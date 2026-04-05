#!/usr/bin/env python3
"""DWG direct-view service core.

This module provides a stable session API with three engine modes:
- stub: deterministic local data for end-to-end API wiring.
- oda_cli: real DWG parsing by invoking local ODA `OdReadEx`.
- external_http: proxy to a remote ODA-backed service over HTTP.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

Affine2D = Tuple[float, float, float, float, float, float]
DWG_CORE_PARSER_REV = "2026-03-29-r24"
DEFAULT_LINEWEIGHT_MM = 0.25


def _point_distance(a: Dict[str, float], b: Dict[str, float]) -> float:
    return math.hypot(float(a["x"]) - float(b["x"]), float(a["y"]) - float(b["y"]))


def _distance_to_segment(
    p: Dict[str, float], a: Dict[str, float], b: Dict[str, float]
) -> Tuple[float, Dict[str, float], float]:
    """Return (distance, closest_point, t)."""
    ax = float(a["x"])
    ay = float(a["y"])
    bx = float(b["x"])
    by = float(b["y"])
    px = float(p["x"])
    py = float(p["y"])

    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab2 = abx * abx + aby * aby
    if ab2 <= 1e-12:
        cp = {"x": ax, "y": ay, "z": 0.0}
        return math.hypot(px - ax, py - ay), cp, 0.0

    t = (apx * abx + apy * aby) / ab2
    t = max(0.0, min(1.0, t))
    cx = ax + abx * t
    cy = ay + aby * t
    cp = {"x": cx, "y": cy, "z": 0.0}
    return math.hypot(px - cx, py - cy), cp, t


def _angle_deg(a: Dict[str, float], v: Dict[str, float], b: Dict[str, float]) -> Optional[float]:
    """Angle AVB in degrees."""
    v1x = float(a["x"]) - float(v["x"])
    v1y = float(a["y"]) - float(v["y"])
    v2x = float(b["x"]) - float(v["x"])
    v2y = float(b["y"]) - float(v["y"])
    n1 = math.hypot(v1x, v1y)
    n2 = math.hypot(v2x, v2y)
    if n1 <= 1e-12 or n2 <= 1e-12:
        return None
    dot = (v1x * v2x + v1y * v2y) / (n1 * n2)
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def _normalize_angle_deg(v: float) -> float:
    return (float(v) % 360.0 + 360.0) % 360.0


def _is_angle_on_arc(angle: float, start: float, end: float) -> bool:
    """Check if angle is within CCW arc [start -> end], handling wrap-around."""
    a = _normalize_angle_deg(angle)
    s = _normalize_angle_deg(start)
    e = _normalize_angle_deg(end)
    if s <= e:
        return s - 1e-9 <= a <= e + 1e-9
    return a >= s - 1e-9 or a <= e + 1e-9


def _point_angle_from_center(center: Dict[str, float], p: Dict[str, float]) -> float:
    return _normalize_angle_deg(math.degrees(math.atan2(float(p["y"]) - float(center["y"]), float(p["x"]) - float(center["x"]))))


def _distance_to_bbox_2d(point: Dict[str, float], bbox_obj: object) -> Optional[float]:
    if not isinstance(bbox_obj, dict):
        return None
    bmin = bbox_obj.get("min")
    bmax = bbox_obj.get("max")
    if not isinstance(bmin, dict) or not isinstance(bmax, dict):
        return None
    try:
        min_x = float(bmin["x"])
        min_y = float(bmin["y"])
        max_x = float(bmax["x"])
        max_y = float(bmax["y"])
        px = float(point["x"])
        py = float(point["y"])
    except Exception:
        return None
    if min_x > max_x:
        min_x, max_x = max_x, min_x
    if min_y > max_y:
        min_y, max_y = max_y, min_y
    dx = 0.0 if min_x <= px <= max_x else min(abs(px - min_x), abs(px - max_x))
    dy = 0.0 if min_y <= py <= max_y else min(abs(py - min_y), abs(py - max_y))
    return math.hypot(dx, dy)


def _bbox_from_points(points: List[Dict[str, float]]) -> Optional[Dict[str, Dict[str, float]]]:
    if not points:
        return None
    xs = [float(p["x"]) for p in points]
    ys = [float(p["y"]) for p in points]
    zs = [float(p.get("z", 0.0)) for p in points]
    return {
        "min": {"x": min(xs), "y": min(ys), "z": min(zs)},
        "max": {"x": max(xs), "y": max(ys), "z": max(zs)},
    }


def _line_segment_from_bbox(
    origin: Dict[str, float],
    u_axis: Dict[str, float],
    bmin: Dict[str, float],
    bmax: Dict[str, float],
) -> Optional[Tuple[Dict[str, float], Dict[str, float]]]:
    """Infer segment endpoints from line origin+direction clipped by AABB."""
    ox = float(origin["x"])
    oy = float(origin["y"])
    oz = float(origin.get("z", 0.0))

    ux = float(u_axis["x"])
    uy = float(u_axis["y"])
    norm = math.hypot(ux, uy)
    if norm <= 1e-12:
        return None
    ux /= norm
    uy /= norm

    intervals: List[Tuple[float, float]] = []
    for o, u, mn, mx in (
        (ox, ux, float(bmin["x"]), float(bmax["x"])),
        (oy, uy, float(bmin["y"]), float(bmax["y"])),
    ):
        if abs(u) <= 1e-12:
            if o < mn - 1e-9 or o > mx + 1e-9:
                return None
            intervals.append((-float("inf"), float("inf")))
        else:
            t1 = (mn - o) / u
            t2 = (mx - o) / u
            intervals.append((min(t1, t2), max(t1, t2)))

    t_min = max(intervals[0][0], intervals[1][0])
    t_max = min(intervals[0][1], intervals[1][1])
    if not math.isfinite(t_min) or not math.isfinite(t_max) or t_min > t_max:
        return None

    p1 = {"x": ox + ux * t_min, "y": oy + uy * t_min, "z": oz}
    p2 = {"x": ox + ux * t_max, "y": oy + uy * t_max, "z": oz}
    return p1, p2


def _line_segment_from_bbox_and_origin(
    origin: Dict[str, float],
    bmin: Dict[str, float],
    bmax: Dict[str, float],
) -> Optional[Tuple[Dict[str, float], Dict[str, float]]]:
    """Infer line endpoints from bbox corners guided by origin proximity."""
    min_x = float(bmin["x"])
    min_y = float(bmin["y"])
    max_x = float(bmax["x"])
    max_y = float(bmax["y"])
    z = float(origin.get("z", bmin.get("z", 0.0)))

    if not all(math.isfinite(v) for v in (min_x, min_y, max_x, max_y)):
        return None

    # Axis-aligned degenerate bbox: endpoints are unique.
    if abs(max_x - min_x) <= 1e-12 or abs(max_y - min_y) <= 1e-12:
        return (
            {"x": min_x, "y": min_y, "z": z},
            {"x": max_x, "y": max_y, "z": z},
        )

    c1 = {"x": min_x, "y": min_y, "z": z}
    c2 = {"x": min_x, "y": max_y, "z": z}
    c3 = {"x": max_x, "y": min_y, "z": z}
    c4 = {"x": max_x, "y": max_y, "z": z}
    candidates = [(c1, c4), (c2, c3)]
    scored: List[Tuple[float, Tuple[Dict[str, float], Dict[str, float]]]] = []
    for a, b in candidates:
        dist, _, _ = _distance_to_segment(origin, a, b)
        scored.append((dist, (a, b)))
    scored.sort(key=lambda item: item[0])
    if not scored:
        return None
    return scored[0][1]


_NUM_RE = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
_POINT_VALUE_RE = re.compile(rf"^\[\s*({_NUM_RE})\s+({_NUM_RE})(?:\s+({_NUM_RE}))?\s*\]$")
_LABEL_VALUE_RE = re.compile(r"^\s*(?P<label>[^.].*?)\s*(?:\.\s*){3,}(?P<value>.+?)\s*$")
_ENTITY_START_RE = re.compile(
    r"^\s*<(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)
_VECTORIZE_ENTITY_START_RE = re.compile(
    r"^\s*>*\s*Start Drawing <(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)
_VECTORIZE_ENTITY_END_RE = re.compile(
    r"^\s*>*\s*End Drawing <(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)
_VECTORIZE_VERTEX_RE = re.compile(
    r"^\s*Vertex\[\d+\]\s*(?:\.\s*)*\[(?P<point>[^\]]+)\]\s*$"
)


def _normalize_label(label: str) -> str:
    normalized = re.sub(r"\s+", " ", label.strip().lower())
    return re.sub(r"[:：]+$", "", normalized)


def _parse_label_value(line: str) -> Tuple[Optional[str], Optional[str]]:
    m = _LABEL_VALUE_RE.match(line)
    if not m:
        return None, None
    return _normalize_label(m.group("label")), m.group("value").strip()


def _parse_point_value(value: str) -> Optional[Dict[str, float]]:
    m = _POINT_VALUE_RE.match(value.strip())
    if not m:
        return None
    x = float(m.group(1))
    y = float(m.group(2))
    z = float(m.group(3)) if m.group(3) is not None else 0.0
    return {"x": x, "y": y, "z": z}


def _parse_float_value(value: str) -> Optional[float]:
    v = value.strip().rstrip("dD")
    try:
        return float(v)
    except Exception:
        return None


def _lineweight_to_mm(raw: object) -> Optional[float]:
    text = str(raw or "").strip()
    if not text:
        return None
    lower = text.lower()
    if lower in ("default", "bylayer", "byblock", "klnwtbylayer", "klnwtbyblock", "klnwtbylwdefault"):
        return None
    m = re.match(r"^klnwt(\d+)$", lower)
    if m:
        try:
            centi_mm = int(m.group(1))
            if centi_mm <= 0:
                return None
            return float(centi_mm) / 100.0
        except Exception:
            return None
    try:
        n = float(text)
        if math.isfinite(n) and n > 0:
            return n
    except Exception:
        return None
    return None


def _is_full_circle_by_points(start: Optional[Dict[str, float]], end: Optional[Dict[str, float]]) -> bool:
    if not isinstance(start, dict) or not isinstance(end, dict):
        return False
    return _point_distance(start, end) <= 1e-6


def _sample_hatch_arc_points(
    center: Dict[str, float],
    radius: float,
    start_deg: float,
    end_deg: float,
    clockwise: bool,
    full_circle_hint: bool,
) -> List[Dict[str, float]]:
    if radius <= 1e-9:
        return []
    s = _normalize_angle_deg(start_deg)
    e = _normalize_angle_deg(end_deg)
    if full_circle_hint:
        sweep = -360.0 if clockwise else 360.0
    elif clockwise:
        sweep = -((_normalize_angle_deg(s - e)) or 360.0)
    else:
        sweep = (_normalize_angle_deg(e - s)) or 360.0

    steps = max(12, min(360, int(abs(sweep) / 8.0) + 1))
    pts: List[Dict[str, float]] = []
    cx = float(center.get("x", 0.0))
    cy = float(center.get("y", 0.0))
    cz = float(center.get("z", 0.0))
    for i in range(steps + 1):
        t = i / max(1, steps)
        ang = math.radians(s + sweep * t)
        pts.append(
            {
                "x": cx + radius * math.cos(ang),
                "y": cy + radius * math.sin(ang),
                "z": cz,
            }
        )
    return pts


def _append_hatch_point(points: List[Dict[str, float]], p: Dict[str, float]) -> None:
    if not isinstance(p, dict):
        return
    if not points:
        points.append(p)
        return
    if _point_distance(points[-1], p) > 1e-6:
        points.append(p)


def _build_hatch_loop_points_from_edges(loop_obj: Dict[str, object]) -> List[Dict[str, float]]:
    edges = loop_obj.get("edges")
    if not isinstance(edges, list) or not edges:
        raw_points = loop_obj.get("points")
        if not isinstance(raw_points, list):
            return []
        return [p for p in raw_points if isinstance(p, dict)]

    out: List[Dict[str, float]] = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        edge_kind = str(edge.get("kind", "")).strip().lower()
        is_arc_edge = (
            "circarc2d" in edge_kind
            or "circulararc" in edge_kind
            or ("arc" in edge_kind and "line" not in edge_kind and "ellipse" not in edge_kind)
        )
        if is_arc_edge:
            center = edge.get("center")
            radius_raw = edge.get("radius")
            if not isinstance(center, dict) or not isinstance(radius_raw, (int, float)):
                continue
            radius = abs(float(radius_raw))
            start_pt = edge.get("start_point") if isinstance(edge.get("start_point"), dict) else None
            end_pt = edge.get("end_point") if isinstance(edge.get("end_point"), dict) else None
            start_angle_raw = edge.get("start_angle")
            end_angle_raw = edge.get("end_angle")
            if isinstance(start_angle_raw, (int, float)):
                start_deg = float(start_angle_raw)
            elif isinstance(start_pt, dict):
                start_deg = _point_angle_from_center(center, start_pt)
            else:
                start_deg = 0.0
            if isinstance(end_angle_raw, (int, float)):
                end_deg = float(end_angle_raw)
            elif isinstance(end_pt, dict):
                end_deg = _point_angle_from_center(center, end_pt)
            else:
                end_deg = start_deg
            clockwise = bool(edge.get("clockwise", False))
            full_circle_hint = _is_full_circle_by_points(start_pt, end_pt)
            if not full_circle_hint:
                try:
                    delta_hint = abs(_normalize_angle_deg(float(end_deg) - float(start_deg)))
                    full_circle_hint = delta_hint <= 1e-9
                except Exception:
                    full_circle_hint = False
            pts = _sample_hatch_arc_points(
                center=center,
                radius=radius,
                start_deg=start_deg,
                end_deg=end_deg,
                clockwise=clockwise,
                full_circle_hint=full_circle_hint,
            )
            for p in pts:
                _append_hatch_point(out, p)
            continue

        start_point = edge.get("start_point")
        end_point = edge.get("end_point")
        if isinstance(start_point, dict):
            _append_hatch_point(out, start_point)
        if isinstance(end_point, dict):
            _append_hatch_point(out, end_point)

    return out


def _normalize_dimblk_name(raw: object) -> Optional[str]:
    s = str(raw or "").strip()
    if not s:
        return None
    if s.lower() in ("null", "none"):
        return None
    return s


def _normalize_arrow_style_name(raw: object) -> str:
    s = str(raw or "").strip().lower()
    if not s or s in ("null", "none"):
        return "closed_filled"
    if "archtick" in s or "tick" in s or "oblique" in s:
        return "archtick"
    if "open" in s and "filled" not in s:
        return "open"
    if "dot" in s:
        return "dot"
    return "closed_filled"


def _clean_oda_text_value(raw: object) -> str:
    s = str(raw or "")
    if s == '""':
        return ""
    # Remove ODA/CAD inline text controls such as \A1;
    s = re.sub(r"\\[A-Za-z][^;]*;", "", s)
    return s.replace("\\P", "\n").replace("\\p", "\n").strip().strip('"')


def _dimension_line_endpoints(
    ext1: Dict[str, float],
    ext2: Dict[str, float],
    dim_line_pt: Dict[str, float],
) -> Tuple[Dict[str, float], Dict[str, float]]:
    dx = float(ext2["x"]) - float(ext1["x"])
    dy = float(ext2["y"]) - float(ext1["y"])
    dn = math.hypot(dx, dy)
    if dn <= 1e-9:
        return dict(ext1), dict(ext2)
    ux = dx / dn
    uy = dy / dn
    # Perpendicular offset from measured line to dimension line.
    nx = -uy
    ny = ux
    off = (float(dim_line_pt["x"]) - float(ext1["x"])) * nx + (float(dim_line_pt["y"]) - float(ext1["y"])) * ny
    p1 = {
        "x": float(ext1["x"]) + nx * off,
        "y": float(ext1["y"]) + ny * off,
        "z": float(ext1.get("z", 0.0)),
    }
    p2 = {
        "x": float(ext2["x"]) + nx * off,
        "y": float(ext2["y"]) + ny * off,
        "z": float(ext2.get("z", 0.0)),
    }
    return p1, p2


def _arrow_marker_lines(
    tip: Dict[str, float],
    inward_dir: Tuple[float, float],
    arrow_len: float,
    arrow_half_width: float,
) -> List[Tuple[Dict[str, float], Dict[str, float]]]:
    ux, uy = inward_dir
    dn = math.hypot(ux, uy)
    if dn <= 1e-9:
        return []
    ux /= dn
    uy /= dn
    nx = -uy
    ny = ux
    tx = float(tip.get("x", 0.0))
    ty = float(tip.get("y", 0.0))
    tz = float(tip.get("z", 0.0))
    b1 = {"x": tx + ux * arrow_len + nx * arrow_half_width, "y": ty + uy * arrow_len + ny * arrow_half_width, "z": tz}
    b2 = {"x": tx + ux * arrow_len - nx * arrow_half_width, "y": ty + uy * arrow_len - ny * arrow_half_width, "z": tz}
    return [(dict(tip), b1), (dict(tip), b2)]


def _arrow_marker_triangle_points(
    tip: Dict[str, float],
    inward_dir: Tuple[float, float],
    arrow_len: float,
    arrow_half_width: float,
) -> Optional[List[Dict[str, float]]]:
    ux, uy = inward_dir
    dn = math.hypot(ux, uy)
    if dn <= 1e-9:
        return None
    ux /= dn
    uy /= dn
    nx = -uy
    ny = ux
    tx = float(tip.get("x", 0.0))
    ty = float(tip.get("y", 0.0))
    tz = float(tip.get("z", 0.0))
    b1 = {"x": tx + ux * arrow_len + nx * arrow_half_width, "y": ty + uy * arrow_len + ny * arrow_half_width, "z": tz}
    b2 = {"x": tx + ux * arrow_len - nx * arrow_half_width, "y": ty + uy * arrow_len - ny * arrow_half_width, "z": tz}
    return [dict(tip), b1, b2, dict(tip)]


def _arrow_marker_archtick_segment(
    tip: Dict[str, float],
    inward_dir: Tuple[float, float],
    tick_len: float,
) -> Optional[Tuple[Dict[str, float], Dict[str, float]]]:
    ux, uy = inward_dir
    dn = math.hypot(ux, uy)
    if dn <= 1e-9:
        return None
    ux /= dn
    uy /= dn
    nx = -uy
    ny = ux
    tx = float(tip.get("x", 0.0))
    ty = float(tip.get("y", 0.0))
    tz = float(tip.get("z", 0.0))
    along = tick_len * 0.45
    across = tick_len * 0.65
    p1 = {"x": tx + ux * along + nx * across, "y": ty + uy * along + ny * across, "z": tz}
    p2 = {"x": tx - ux * along - nx * across, "y": ty - uy * along - ny * across, "z": tz}
    return p1, p2


def _parse_aci_from_color_name(value: object) -> Optional[int]:
    s = str(value or "").strip()
    if not s:
        return None
    sl = s.lower()
    if sl == "bylayer":
        return 256
    if sl == "byblock":
        return 0
    if sl == "foreground":
        # CAD foreground color is viewport dependent; use ACI 7 as a stable fallback.
        return 7
    m = re.search(r"aci\s*(-?\d+)", s, flags=re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    if re.fullmatch(r"-?\d+", s):
        try:
            return int(s)
        except Exception:
            return None
    return None


def _identity_affine() -> Affine2D:
    return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _compose_affine(parent: Affine2D, local: Affine2D) -> Affine2D:
    p00, p01, p10, p11, ptx, pty = parent
    l00, l01, l10, l11, ltx, lty = local
    return (
        p00 * l00 + p01 * l10,
        p00 * l01 + p01 * l11,
        p10 * l00 + p11 * l10,
        p10 * l01 + p11 * l11,
        p00 * ltx + p01 * lty + ptx,
        p10 * ltx + p11 * lty + pty,
    )


def _apply_affine(tf: Affine2D, p: Dict[str, float]) -> Dict[str, float]:
    m00, m01, m10, m11, tx, ty = tf
    x = float(p.get("x", 0.0))
    y = float(p.get("y", 0.0))
    return {
        "x": m00 * x + m01 * y + tx,
        "y": m10 * x + m11 * y + ty,
        "z": float(p.get("z", 0.0)),
    }


def _apply_linear(tf: Affine2D, v: Dict[str, float]) -> Dict[str, float]:
    m00, m01, m10, m11, _, _ = tf
    x = float(v.get("x", 0.0))
    y = float(v.get("y", 0.0))
    return {"x": m00 * x + m01 * y, "y": m10 * x + m11 * y, "z": float(v.get("z", 0.0))}


def _affine_scales(tf: Affine2D) -> Tuple[float, float]:
    m00, m01, m10, m11, _, _ = tf
    sx = math.hypot(m00, m10)
    sy = math.hypot(m01, m11)
    return sx, sy


def _apply_bbox_affine(tf: Affine2D, bbox_obj: object) -> Optional[Dict[str, Dict[str, float]]]:
    if not isinstance(bbox_obj, dict):
        return None
    bmin = bbox_obj.get("min")
    bmax = bbox_obj.get("max")
    if not isinstance(bmin, dict) or not isinstance(bmax, dict):
        return None
    corners = [
        {"x": float(bmin.get("x", 0.0)), "y": float(bmin.get("y", 0.0)), "z": float(bmin.get("z", 0.0))},
        {"x": float(bmin.get("x", 0.0)), "y": float(bmax.get("y", 0.0)), "z": float(bmin.get("z", 0.0))},
        {"x": float(bmax.get("x", 0.0)), "y": float(bmin.get("y", 0.0)), "z": float(bmax.get("z", 0.0))},
        {"x": float(bmax.get("x", 0.0)), "y": float(bmax.get("y", 0.0)), "z": float(bmax.get("z", 0.0))},
    ]
    mapped = [_apply_affine(tf, c) for c in corners]
    return _bbox_from_points(mapped)


def _space_from_block_name(block_name: str) -> Tuple[str, str, str]:
    name = block_name.strip()
    upper = name.upper()
    if upper == "*MODEL_SPACE":
        return "model", "Model", "model"
    if upper.startswith("*PAPER_SPACE"):
        suffix = name[len("*Paper_Space") :] if name.startswith("*Paper_Space") else name[len("*PAPER_SPACE") :]
        display_name = f"Layout{suffix}" if suffix else "Layout1"
        return f"layout:{name}", display_name, "layout"
    clean = name.lstrip("*") or "Layout"
    return f"layout:{clean}", clean, "layout"


def _block_ref_id_from_instance_path(instance_path: Tuple[str, ...]) -> Optional[str]:
    if not instance_path:
        return None
    return f"BLOCK_REF@{'/'.join(instance_path)}"


def _normalize_font_token(value: object) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    base = Path(raw).stem
    return re.sub(r"[^a-z0-9]+", "", base)


def _detect_font_kind(value: object) -> str:
    ext = Path(str(value or "")).suffix.lower()
    if ext in (".ttf", ".ttc", ".otf"):
        return ext[1:]
    if ext == ".shx":
        return "shx"
    return "unknown"


def _font_family_from_name(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    stem = Path(raw).stem.strip()
    return stem or raw


def _sanitize_font_key(value: object) -> str:
    token = _normalize_font_token(value)
    return token or "default"


def _normalize_entity_instance_key(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "@" not in raw:
        return raw.upper()
    base_raw, path_raw = raw.split("@", 1)
    base = base_raw.strip().upper()
    path_parts = [seg.strip().upper() for seg in path_raw.split("/") if seg.strip()]
    if not path_parts:
        return base
    return f"{base}@{'/'.join(path_parts)}"


_SEVEN_SEG_POINTS: Dict[str, Tuple[Tuple[float, float], Tuple[float, float]]] = {
    "a": ((0.12, 1.0), (0.88, 1.0)),
    "b": ((0.88, 1.0), (0.88, 0.54)),
    "c": ((0.88, 0.46), (0.88, 0.0)),
    "d": ((0.12, 0.0), (0.88, 0.0)),
    "e": ((0.12, 0.46), (0.12, 0.0)),
    "f": ((0.12, 1.0), (0.12, 0.54)),
    "g": ((0.12, 0.5), (0.88, 0.5)),
}

_SEVEN_SEG_CHAR_MAP: Dict[str, Tuple[str, ...]] = {
    "0": ("a", "b", "c", "d", "e", "f"),
    "1": ("b", "c"),
    "2": ("a", "b", "g", "e", "d"),
    "3": ("a", "b", "g", "c", "d"),
    "4": ("f", "g", "b", "c"),
    "5": ("a", "f", "g", "c", "d"),
    "6": ("a", "f", "g", "e", "c", "d"),
    "7": ("a", "b", "c"),
    "8": ("a", "b", "c", "d", "e", "f", "g"),
    "9": ("a", "b", "c", "d", "f", "g"),
    "A": ("a", "b", "c", "e", "f", "g"),
    "B": ("f", "e", "g", "c", "d"),
    "C": ("a", "f", "e", "d"),
    "D": ("b", "c", "d", "e", "g"),
    "E": ("a", "f", "g", "e", "d"),
    "F": ("a", "f", "g", "e"),
    "H": ("f", "e", "g", "b", "c"),
    "J": ("b", "c", "d", "e"),
    "L": ("f", "e", "d"),
    "P": ("a", "f", "b", "g", "e"),
    "U": ("f", "e", "d", "c", "b"),
    "Y": ("f", "b", "g", "c", "d"),
}

_STROKE_GLYPHS: Dict[str, List[List[Tuple[float, float]]]] = {
    ".": [[(0.5, 0.06), (0.52, 0.08)]],
    ",": [[(0.5, 0.06), (0.45, -0.08)]],
    "-": [[(0.2, 0.5), (0.8, 0.5)]],
    "_": [[(0.1, 0.0), (0.9, 0.0)]],
    "/": [[(0.1, 0.0), (0.9, 1.0)]],
    "\\": [[(0.1, 1.0), (0.9, 0.0)]],
    ":": [[(0.5, 0.22), (0.52, 0.24)], [(0.5, 0.78), (0.52, 0.8)]],
    "+": [[(0.15, 0.5), (0.85, 0.5)], [(0.5, 0.15), (0.5, 0.85)]],
    "*": [[(0.15, 0.5), (0.85, 0.5)], [(0.26, 0.2), (0.74, 0.8)], [(0.26, 0.8), (0.74, 0.2)]],
    "=": [[(0.18, 0.62), (0.82, 0.62)], [(0.18, 0.38), (0.82, 0.38)]],
    "(": [[(0.64, 1.0), (0.4, 0.76), (0.32, 0.5), (0.4, 0.24), (0.64, 0.0)]],
    ")": [[(0.36, 1.0), (0.6, 0.76), (0.68, 0.5), (0.6, 0.24), (0.36, 0.0)]],
    "[": [[(0.62, 1.0), (0.38, 1.0), (0.38, 0.0), (0.62, 0.0)]],
    "]": [[(0.38, 1.0), (0.62, 1.0), (0.62, 0.0), (0.38, 0.0)]],
    "%": [[(0.2, 0.0), (0.8, 1.0)], [(0.24, 0.86), (0.34, 0.96)], [(0.66, 0.04), (0.76, 0.14)]],
    "N": [[(0.12, 0.0), (0.12, 1.0)], [(0.12, 1.0), (0.88, 0.0)], [(0.88, 0.0), (0.88, 1.0)]],
    "M": [[(0.12, 0.0), (0.12, 1.0)], [(0.12, 1.0), (0.5, 0.48)], [(0.5, 0.48), (0.88, 1.0)], [(0.88, 1.0), (0.88, 0.0)]],
    "R": [[(0.12, 0.0), (0.12, 1.0)], [(0.12, 1.0), (0.78, 1.0), (0.88, 0.86), (0.88, 0.62), (0.78, 0.5), (0.12, 0.5)], [(0.5, 0.5), (0.9, 0.0)]],
    "K": [[(0.12, 0.0), (0.12, 1.0)], [(0.86, 1.0), (0.12, 0.5), (0.86, 0.0)]],
    "T": [[(0.1, 1.0), (0.9, 1.0)], [(0.5, 1.0), (0.5, 0.0)]],
    "V": [[(0.12, 1.0), (0.5, 0.0), (0.88, 1.0)]],
    "W": [[(0.1, 1.0), (0.26, 0.0), (0.5, 0.58), (0.74, 0.0), (0.9, 1.0)]],
    "X": [[(0.12, 1.0), (0.88, 0.0)], [(0.88, 1.0), (0.12, 0.0)]],
    "Z": [[(0.12, 1.0), (0.88, 1.0), (0.12, 0.0), (0.88, 0.0)]],
    "?": [[(0.15, 0.8), (0.25, 1.0), (0.75, 1.0), (0.85, 0.8), (0.85, 0.62), (0.5, 0.42), (0.5, 0.26)], [(0.5, 0.08), (0.52, 0.1)]],
}


def _shx_char_strokes(ch: str) -> Optional[List[List[Tuple[float, float]]]]:
    if ch == " ":
        return []
    if ch in _STROKE_GLYPHS:
        return _STROKE_GLYPHS[ch]
    upper = ch.upper()
    if upper in _STROKE_GLYPHS:
        return _STROKE_GLYPHS[upper]
    segs = _SEVEN_SEG_CHAR_MAP.get(ch) or _SEVEN_SEG_CHAR_MAP.get(upper)
    if segs:
        return [[_SEVEN_SEG_POINTS[s][0], _SEVEN_SEG_POINTS[s][1]] for s in segs if s in _SEVEN_SEG_POINTS]
    return None


class ExternalCoreError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None, body: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


@dataclass
class DwgDocSession:
    doc_id: str
    file_path: Path
    original_name: str
    mode: str
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    current_space: str = "model"
    view_state: Dict[str, object] = field(
        default_factory=lambda: {"zoom": 1.0, "center": {"x": 0.0, "y": 0.0, "z": 0.0}}
    )
    spaces: List[Dict[str, object]] = field(default_factory=list)
    entities_by_space: Dict[str, List[Dict[str, object]]] = field(default_factory=dict)
    block_refs_by_space: Dict[str, List[Dict[str, object]]] = field(default_factory=dict)
    text_styles: Dict[str, Dict[str, object]] = field(default_factory=dict)
    font_files: Dict[str, str] = field(default_factory=dict)
    shx_fallback_hit_count: int = 0
    warnings: List[str] = field(default_factory=list)
    shx_outline_mode: str = "none"
    shx_detected: bool = False
    shx_true_outline: bool = False
    shx_vectorize_attempted: bool = False
    shx_vectorize_attached_count: int = 0
    shx_vectorize_error: Optional[str] = None
    shx_fallback_text_count: int = 0
    shx_missing_original_fonts: List[str] = field(default_factory=list)
    shx_resolved_original_fonts: List[str] = field(default_factory=list)
    shx_fallback_file_name: Optional[str] = None
    shx_diagnostics_unavailable: bool = False
    shx_debug_match: Optional[Dict[str, object]] = None
    remote_doc_id: Optional[str] = None


class DwgServiceCore:
    """Session manager + DWG interaction operations."""

    def __init__(self, uploads_dir: Path):
        self.uploads_dir = uploads_dir
        self.sessions: Dict[str, DwgDocSession] = {}
        self.server_dir = Path(__file__).resolve().parent
        self.oda_vendor_root = (self.server_dir / "vendor" / "oda").resolve()

        self.mode = "stub"

        self.external_base_url = os.environ.get("DWG_CORE_BASE_URL", "").strip().rstrip("/")
        self.external_timeout_sec = max(1.0, float(os.environ.get("DWG_CORE_TIMEOUT_SEC", "25")))
        self.external_auth_bearer = os.environ.get("DWG_CORE_AUTH_BEARER", "").strip()
        self.external_prefix = ""

        explicit_prefix = os.environ.get("DWG_CORE_PREFIX", "").strip().rstrip("/")
        if explicit_prefix and not explicit_prefix.startswith("/"):
            explicit_prefix = f"/{explicit_prefix}"

        self.oda_timeout_sec = max(5.0, float(os.environ.get("DWG_ODA_TIMEOUT_SEC", "60")))
        self.max_entities_per_space = max(500, int(os.environ.get("DWG_ODA_MAX_ENTITIES_PER_SPACE", "120000")))
        self.default_entity_api_limit = max(200, int(os.environ.get("DWG_ENTITY_API_DEFAULT_LIMIT", "6000")))
        self.default_lineweight_mm = max(0.01, float(os.environ.get("DWG_LINEWEIGHT_DEFAULT_MM", str(DEFAULT_LINEWEIGHT_MM))))
        self.vectorize_cache_capacity = max(2, int(os.environ.get("DWG_VECTORIZE_CACHE_CAPACITY", "8")))
        self.oda_profile = os.environ.get("ODA_PROFILE", "").strip() or ("win-x64" if os.name == "nt" else "linux-x64")
        self.oda_version = os.environ.get("ODA_VERSION", "").strip() or "2026.03.25-v1"
        self.oda_runtime_root: Optional[str] = None
        self.oda_runtime_in_project = False
        self.oda_resolve_source: Optional[str] = None
        self.oda_read_exe = self._resolve_oda_read_exe(os.environ.get("ODA_READ_EXE", "").strip())
        self.enable_shx_outline = os.environ.get("DWG_ENABLE_SHX_OUTLINE", "1").strip().lower() not in ("0", "false", "no")
        self.enable_shx_outline_oda = os.environ.get("DWG_ENABLE_SHX_OUTLINE_ODA", "1").strip().lower() not in ("0", "false", "no")
        self.enable_shx_debug_match = os.environ.get("DWG_SHX_DEBUG_MATCH", "0").strip().lower() in ("1", "true", "yes")
        self.force_text_vectorize = os.environ.get("DWG_FORCE_TEXT_VECTORIZE", "0").strip().lower() in ("1", "true", "yes")
        self.oda_vectorize_resolve_source: Optional[str] = None
        self.oda_vectorize_exe = self._resolve_oda_vectorize_exe(os.environ.get("ODA_VECTORIZE_EXE", "").strip())
        self.font_dir = Path(os.environ.get("DWG_FONT_DIR", str((self.server_dir / "fonts").resolve()))).resolve()
        self.font_map_path = Path(
            os.environ.get("DWG_FONT_MAP_PATH", str((self.font_dir / "font-map.json").resolve()))
        ).resolve()
        self.font_map = self._load_font_map(self.font_map_path)
        self.font_search_roots = self._build_font_search_roots()
        self.shx_fallback_file = (self.font_dir / "@!hztxt万能字体.shx").resolve()
        self._vectorize_text_cache: Dict[str, Dict[str, List[Dict[str, object]]]] = {}
        self._vectorize_cache_order: List[str] = []

        if self.external_base_url:
            self.mode = "external_http"
            if explicit_prefix:
                self.external_prefix = explicit_prefix
            else:
                parsed = urllib_parse.urlparse(self.external_base_url)
                path = parsed.path.rstrip("/").lower()
                if path.endswith("/api/dwg") or path.endswith("/dwg"):
                    self.external_prefix = ""
                else:
                    self.external_prefix = "/api/dwg"
        elif self.oda_read_exe:
            self.mode = "oda_cli"

    def _resolve_oda_read_exe(self, env_path: str) -> Optional[str]:
        candidates: List[Tuple[Path, Optional[Path], str]] = []

        if env_path:
            candidate_path = Path(env_path)
            runtime_root = candidate_path.parent
            if runtime_root.name.lower() == "bin":
                runtime_root = runtime_root.parent
            candidates.append((candidate_path, runtime_root, "env:ODA_READ_EXE"))

        oda_runtime_root = os.environ.get("ODA_RUNTIME_ROOT", "").strip()
        if oda_runtime_root:
            root = Path(oda_runtime_root)
            candidates.extend(
                [
                    (root / "bin" / "OdReadEx.exe", root, "env:ODA_RUNTIME_ROOT"),
                    (root / "bin" / "OdReadEx", root, "env:ODA_RUNTIME_ROOT"),
                    (root / "OdReadEx.exe", root, "env:ODA_RUNTIME_ROOT"),
                    (root / "OdReadEx", root, "env:ODA_RUNTIME_ROOT"),
                ]
            )

        vendor_root = self.oda_vendor_root / self.oda_profile / self.oda_version
        candidates.extend(
            [
                (vendor_root / "bin" / "OdReadEx.exe", vendor_root, "project_vendor"),
                (vendor_root / "bin" / "OdReadEx", vendor_root, "project_vendor"),
            ]
        )

        which_hit = shutil.which("OdReadEx")
        if which_hit:
            candidates.append((Path(which_hit), None, "system_path"))
        which_hit_exe = shutil.which("OdReadEx.exe")
        if which_hit_exe:
            candidates.append((Path(which_hit_exe), None, "system_path"))

        oda_sdk_root = os.environ.get("ODA_SDK_ROOT", "").strip()
        if oda_sdk_root:
            root = Path(oda_sdk_root)
            candidates.extend(
                [
                    (root / "artifacts" / "win-x64" / "bin" / "OdReadEx.exe", root / "artifacts" / "win-x64", "env:ODA_SDK_ROOT"),
                    (root / "artifacts" / "linux-x64" / "bin" / "OdReadEx", root / "artifacts" / "linux-x64", "env:ODA_SDK_ROOT"),
                ]
            )

        candidates.extend(
            [
                (Path(r"C:\development\oda\ConvertApp\lib\ODA\OdReadEx.exe"), Path(r"C:\development\oda\ConvertApp\lib\ODA"), "legacy_fallback"),
                (Path("/opt/oda/bin/OdReadEx"), Path("/opt/oda"), "legacy_fallback"),
            ]
        )

        for candidate, runtime_root, source in candidates:
            try:
                if candidate.exists():
                    resolved = candidate.resolve()
                    resolved_runtime_root = runtime_root.resolve() if runtime_root else resolved.parent
                    self.oda_runtime_root = str(resolved_runtime_root)
                    self.oda_resolve_source = source
                    try:
                        self.oda_runtime_in_project = str(resolved).lower().startswith(str(self.oda_vendor_root).lower())
                    except Exception:
                        self.oda_runtime_in_project = False
                    return str(resolved)
            except Exception:
                continue
        return None

    def _resolve_oda_vectorize_exe(self, env_path: str) -> Optional[str]:
        candidates: List[Tuple[Path, str]] = []

        if env_path:
            candidates.append((Path(env_path), "env:ODA_VECTORIZE_EXE"))

        if self.oda_read_exe:
            read_path = Path(self.oda_read_exe)
            candidates.extend(
                [
                    (read_path.with_name("OdVectorizeEx.exe"), "co_located_with_read"),
                    (read_path.with_name("OdVectorizeEx"), "co_located_with_read"),
                ]
            )

        if self.oda_runtime_root:
            root = Path(self.oda_runtime_root)
            candidates.extend(
                [
                    (root / "bin" / "OdVectorizeEx.exe", "runtime_root"),
                    (root / "bin" / "OdVectorizeEx", "runtime_root"),
                    (root / "OdVectorizeEx.exe", "runtime_root"),
                    (root / "OdVectorizeEx", "runtime_root"),
                ]
            )

        which_hit = shutil.which("OdVectorizeEx")
        if which_hit:
            candidates.append((Path(which_hit), "system_path"))
        which_hit_exe = shutil.which("OdVectorizeEx.exe")
        if which_hit_exe:
            candidates.append((Path(which_hit_exe), "system_path"))

        candidates.extend(
            [
                (Path(r"C:\development\oda\ConvertApp\lib\ODA\OdVectorizeEx.exe"), "legacy_fallback"),
                (Path("/opt/oda/bin/OdVectorizeEx"), "legacy_fallback"),
            ]
        )

        for candidate, source in candidates:
            try:
                if candidate.exists():
                    resolved = candidate.resolve()
                    self.oda_vectorize_resolve_source = source
                    return str(resolved)
            except Exception:
                continue
        return None

    def _build_font_search_roots(self) -> List[Path]:
        roots: List[Path] = []
        raw_roots = os.environ.get("DWG_FONT_DIRS", "").strip()
        if raw_roots:
            for part in raw_roots.split(os.pathsep):
                candidate = part.strip()
                if candidate:
                    roots.append(Path(candidate).resolve())
        roots.append(self.font_dir)
        if os.name == "nt":
            roots.append(Path(r"C:\Windows\Fonts"))
        else:
            roots.append(Path("/usr/share/fonts"))
            roots.append(Path("/usr/local/share/fonts"))

        deduped: List[Path] = []
        seen: Set[str] = set()
        for root in roots:
            key = str(root).lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(root)
        return deduped

    def _load_font_map(self, map_path: Path) -> Dict[str, str]:
        out: Dict[str, str] = {}
        if not map_path.exists():
            return out
        try:
            raw = json.loads(map_path.read_text(encoding="utf-8"))
        except Exception:
            return out
        if not isinstance(raw, dict):
            return out

        def put_item(key_raw: object, value_raw: object) -> None:
            key = _normalize_font_token(key_raw)
            if not key:
                return
            if isinstance(value_raw, dict):
                value = str(
                    value_raw.get("path")
                    or value_raw.get("file")
                    or value_raw.get("font_path")
                    or value_raw.get("font_file")
                    or ""
                ).strip()
            else:
                value = str(value_raw or "").strip()
            if not value:
                return
            out[key] = value

        for k, v in raw.items():
            if isinstance(v, dict) and "path" not in v and "file" not in v and "font_path" not in v and "font_file" not in v:
                for child_k, child_v in v.items():
                    put_item(child_k, child_v)
            else:
                put_item(k, v)
        return out

    def _resolve_font_file(self, font_hint: object) -> Optional[Path]:
        hint = str(font_hint or "").strip()
        if not hint:
            return None
        hint_path = Path(hint)
        candidates: List[Path] = []
        if hint_path.is_absolute():
            candidates.append(hint_path)
        key = _normalize_font_token(hint)
        mapped = self.font_map.get(key)
        if mapped:
            candidates.append(Path(mapped))

        name_only = hint_path.name if hint_path.name else hint
        stem = hint_path.stem or hint
        ext = hint_path.suffix.lower()
        for root in self.font_search_roots:
            candidates.append(root / name_only)
            if not ext:
                candidates.append(root / f"{stem}.ttf")
                candidates.append(root / f"{stem}.ttc")
                candidates.append(root / f"{stem}.otf")

        seen: Set[str] = set()
        for candidate in candidates:
            try:
                key_path = str(candidate).lower()
                if key_path in seen:
                    continue
                seen.add(key_path)
                if candidate.exists() and candidate.is_file():
                    return candidate.resolve()
            except Exception:
                continue
        return None

    def _decode_oda_bytes(self, data: bytes) -> str:
        if not data:
            return ""
        if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
            try:
                return data.decode("utf-16")
            except Exception:
                pass
        for enc in ("utf-8", "gb18030", "gbk", "latin-1"):
            try:
                return data.decode(enc)
            except Exception:
                continue
        return data.decode("utf-8", errors="replace")

    def _run_oda_read_dump(self, file_path: Path) -> str:
        if not self.oda_read_exe:
            raise ExternalCoreError("OdReadEx executable is not configured/found")

        exe_path = Path(self.oda_read_exe)
        env = os.environ.copy()
        exe_dir = str(exe_path.parent)
        env["PATH"] = exe_dir + os.pathsep + env.get("PATH", "")

        target_file = str(file_path.resolve())
        cmd = [str(exe_path), target_file, "DO"]
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.oda_timeout_sec,
                env=env,
                cwd=exe_dir,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ExternalCoreError(f"OdReadEx timed out after {self.oda_timeout_sec:.1f}s for {file_path.name}") from exc
        except Exception as exc:
            raise ExternalCoreError(f"failed to launch OdReadEx: {exc}") from exc

        stdout_text = self._decode_oda_bytes(proc.stdout or b"")
        stderr_text = self._decode_oda_bytes(proc.stderr or b"")
        if proc.returncode != 0:
            detail = stderr_text.strip() or stdout_text[:3000].strip()
            raise ExternalCoreError(f"OdReadEx failed (code={proc.returncode}): {detail}")

        if "Can't open file:" in stdout_text:
            raise ExternalCoreError(stdout_text.strip())

        if not stdout_text.strip():
            raise ExternalCoreError("OdReadEx returned empty output")
        return stdout_text

    def _is_oda_vectorize_available(self) -> bool:
        if not self.enable_shx_outline or not self.enable_shx_outline_oda:
            return False
        if not self.oda_vectorize_exe:
            return False
        try:
            return Path(self.oda_vectorize_exe).exists()
        except Exception:
            return False

    def _run_oda_vectorize_dump(self, file_path: Path) -> str:
        if not self.oda_vectorize_exe:
            raise ExternalCoreError("OdVectorizeEx executable is not configured/found")

        exe_path = Path(self.oda_vectorize_exe)
        env = os.environ.copy()
        exe_dir = str(exe_path.parent)
        env["PATH"] = exe_dir + os.pathsep + env.get("PATH", "")

        target_file = str(file_path.resolve())
        cmd = [str(exe_path), target_file]
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.oda_timeout_sec,
                env=env,
                cwd=exe_dir,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ExternalCoreError(f"OdVectorizeEx timed out after {self.oda_timeout_sec:.1f}s for {file_path.name}") from exc
        except Exception as exc:
            raise ExternalCoreError(f"failed to launch OdVectorizeEx: {exc}") from exc

        stdout_text = self._decode_oda_bytes(proc.stdout or b"")
        stderr_text = self._decode_oda_bytes(proc.stderr or b"")
        if proc.returncode != 0:
            detail = stderr_text.strip() or stdout_text[:3000].strip()
            raise ExternalCoreError(f"OdVectorizeEx failed (code={proc.returncode}): {detail}")

        if "Can't open file:" in stdout_text:
            raise ExternalCoreError(stdout_text.strip())

        if not stdout_text.strip():
            raise ExternalCoreError("OdVectorizeEx returned empty output")
        return stdout_text

    def _vectorize_cache_key(self, file_path: Path) -> str:
        p = file_path.resolve()
        try:
            stat = p.stat()
            return f"{p}|{int(stat.st_size)}|{int(getattr(stat, 'st_mtime_ns', int(stat.st_mtime * 1e9)))}"
        except Exception:
            return str(p)

    def _vectorize_cache_get(self, cache_key: str) -> Optional[Dict[str, List[Dict[str, object]]]]:
        hit = self._vectorize_text_cache.get(cache_key)
        if hit is None:
            return None
        try:
            self._vectorize_cache_order.remove(cache_key)
        except ValueError:
            pass
        self._vectorize_cache_order.append(cache_key)
        return hit

    def _vectorize_cache_put(self, cache_key: str, data: Dict[str, List[Dict[str, object]]]) -> None:
        self._vectorize_text_cache[cache_key] = data
        try:
            self._vectorize_cache_order.remove(cache_key)
        except ValueError:
            pass
        self._vectorize_cache_order.append(cache_key)
        while len(self._vectorize_cache_order) > self.vectorize_cache_capacity:
            stale = self._vectorize_cache_order.pop(0)
            self._vectorize_text_cache.pop(stale, None)

    def _build_vectorize_parse_meta_from_primitives(self, data: Dict[str, List[Dict[str, object]]]) -> Dict[str, object]:
        if not isinstance(data, dict):
            return {
                "vectorize_text_entity_count": 0,
                "vectorize_text_keys_count": 0,
                "vectorize_primitives_total": 0,
                "shape_file_text_true_count": 0,
                "vectorize_text_key_samples": [],
            }
        keys = [str(k) for k in data.keys() if str(k).strip()]
        total_primitives = 0
        shape_file_hits = 0
        for plist in data.values():
            if not isinstance(plist, list):
                continue
            total_primitives += len([p for p in plist if isinstance(p, dict)])
            if any(bool(p.get("shape_file_text")) for p in plist if isinstance(p, dict)):
                shape_file_hits += 1
        return {
            "vectorize_text_entity_count": len(keys),
            "vectorize_text_keys_count": len(keys),
            "vectorize_primitives_total": int(total_primitives),
            "shape_file_text_true_count": int(shape_file_hits),
            "vectorize_text_key_samples": keys[:20],
        }

    def _outline_point_key(self, p: Dict[str, float], eps: float = 1e-4) -> Tuple[int, int]:
        return (int(round(float(p.get("x", 0.0)) / eps)), int(round(float(p.get("y", 0.0)) / eps)))

    def _clean_polyline_points(self, points: List[Dict[str, float]], closed: bool) -> List[Dict[str, float]]:
        out: List[Dict[str, float]] = []
        for p in points:
            if not isinstance(p, dict):
                continue
            q = {"x": float(p.get("x", 0.0)), "y": float(p.get("y", 0.0)), "z": float(p.get("z", 0.0))}
            if out and _point_distance(out[-1], q) <= 1e-7:
                continue
            out.append(q)
        if closed and len(out) >= 3 and _point_distance(out[0], out[-1]) > 1e-6:
            out.append(dict(out[0]))
        if closed and len(out) >= 2 and _point_distance(out[0], out[-1]) <= 1e-9 and len(out) == 2:
            return []
        return out

    def _simplify_polyline_points(
        self,
        points: List[Dict[str, float]],
        closed: bool,
        angle_eps: float = 1e-4,
    ) -> List[Dict[str, float]]:
        clean = self._clean_polyline_points(points, closed=closed)
        if len(clean) < 3:
            return clean

        work = clean[:-1] if (closed and len(clean) >= 2 and _point_distance(clean[0], clean[-1]) <= 1e-7) else clean
        if len(work) < 3:
            return clean

        simplified: List[Dict[str, float]] = [dict(work[0])]
        for i in range(1, len(work) - 1):
            prev = simplified[-1]
            curr = work[i]
            nxt = work[i + 1]

            v1x = float(curr["x"]) - float(prev["x"])
            v1y = float(curr["y"]) - float(prev["y"])
            v2x = float(nxt["x"]) - float(curr["x"])
            v2y = float(nxt["y"]) - float(curr["y"])
            n1 = math.hypot(v1x, v1y)
            n2 = math.hypot(v2x, v2y)
            if n1 <= 1e-9 or n2 <= 1e-9:
                continue

            cross = abs(v1x * v2y - v1y * v2x)
            if cross / (n1 * n2) <= angle_eps:
                continue
            simplified.append(dict(curr))

        simplified.append(dict(work[-1]))
        if closed and len(simplified) >= 3:
            simplified.append(dict(simplified[0]))
        return simplified

    def _polygon_abs_area(self, ring: List[Dict[str, float]]) -> float:
        if len(ring) < 3:
            return 0.0
        area2 = 0.0
        pts = ring
        for i in range(len(pts) - 1):
            x1 = float(pts[i]["x"])
            y1 = float(pts[i]["y"])
            x2 = float(pts[i + 1]["x"])
            y2 = float(pts[i + 1]["y"])
            area2 += x1 * y2 - x2 * y1
        return abs(area2) * 0.5

    def _triangle_mesh_to_boundary_loops(self, triangles: List[List[Dict[str, float]]]) -> List[List[Dict[str, float]]]:
        # Convert triangulated text fill to boundary loops to reduce primitive count.
        canonical_point: Dict[Tuple[int, int], Dict[str, float]] = {}
        edge_count: Dict[Tuple[Tuple[int, int], Tuple[int, int]], int] = {}

        for tri in triangles:
            clean = self._clean_polyline_points(tri, closed=False)
            if len(clean) < 3:
                continue
            tri_pts = clean[:3]
            keys = [self._outline_point_key(p) for p in tri_pts]
            if len({keys[0], keys[1], keys[2]}) < 3:
                continue
            for k, p in zip(keys, tri_pts):
                if k not in canonical_point:
                    canonical_point[k] = dict(p)
            tri_edges = [(keys[0], keys[1]), (keys[1], keys[2]), (keys[2], keys[0])]
            for a, b in tri_edges:
                edge = (a, b) if a <= b else (b, a)
                edge_count[edge] = edge_count.get(edge, 0) + 1

        boundary_edges = [e for e, c in edge_count.items() if c == 1]
        if not boundary_edges:
            return []

        adjacency: Dict[Tuple[int, int], Set[Tuple[int, int]]] = {}
        for a, b in boundary_edges:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)

        unused: Set[Tuple[Tuple[int, int], Tuple[int, int]]] = set(boundary_edges)
        loops: List[List[Dict[str, float]]] = []

        def pop_edge_key(a: Tuple[int, int], b: Tuple[int, int]) -> Optional[Tuple[Tuple[int, int], Tuple[int, int]]]:
            k = (a, b) if a <= b else (b, a)
            if k in unused:
                unused.remove(k)
                return k
            return None

        while unused:
            start_edge = next(iter(unused))
            unused.remove(start_edge)
            start, curr = start_edge
            prev = start
            chain: List[Tuple[int, int]] = [start, curr]

            guard = 0
            while guard < 200000:
                guard += 1
                if curr == start:
                    break
                neigh = adjacency.get(curr, set())
                candidates = [n for n in neigh if n != prev and ((curr, n) if curr <= n else (n, curr)) in unused]
                if not candidates:
                    fallback = [n for n in neigh if ((curr, n) if curr <= n else (n, curr)) in unused]
                    if not fallback:
                        break
                    nxt = fallback[0]
                else:
                    nxt = candidates[0]
                if pop_edge_key(curr, nxt) is None:
                    break
                chain.append(nxt)
                prev, curr = curr, nxt
                if curr == start:
                    break

            if len(chain) < 4:
                continue
            if chain[0] != chain[-1]:
                chain.append(chain[0])
            loop_points: List[Dict[str, float]] = []
            for k in chain:
                p = canonical_point.get(k)
                if not p:
                    continue
                loop_points.append(dict(p))
            loop_points = self._simplify_polyline_points(loop_points, closed=True)
            if len(loop_points) < 4:
                continue
            if self._polygon_abs_area(loop_points) <= 1e-4:
                continue
            loops.append(loop_points)

        return loops

    def _optimize_oda_text_outlines(self, primitives: List[Dict[str, object]]) -> List[Dict[str, object]]:
        if not primitives:
            return []

        triangles: List[List[Dict[str, float]]] = []
        passthrough: List[Dict[str, object]] = []

        for prim in primitives:
            if not isinstance(prim, dict):
                continue
            kind = str(prim.get("kind", "")).lower()
            if kind == "polygon":
                rings = prim.get("rings")
                if not isinstance(rings, list) or not rings:
                    continue
                ring0 = rings[0]
                if isinstance(ring0, list):
                    clean = self._clean_polyline_points([p for p in ring0 if isinstance(p, dict)], closed=True)
                    # Triangulated glyph shells usually arrive as many 3-point polygons (+ closing point).
                    unique_count = len({self._outline_point_key(p) for p in clean[:-1]}) if len(clean) >= 2 else 0
                    if unique_count == 3:
                        triangles.append(clean)
                        continue
            if kind == "polyline":
                points = prim.get("points")
                if isinstance(points, list):
                    clean_points = self._simplify_polyline_points(
                        [p for p in points if isinstance(p, dict)],
                        closed=bool(prim.get("closed", False)),
                    )
                    if len(clean_points) >= 2:
                        copy_prim = dict(prim)
                        copy_prim["points"] = clean_points
                        copy_prim["closed"] = bool(prim.get("closed", False))
                        passthrough.append(copy_prim)
                    continue
            passthrough.append(dict(prim))

        optimized: List[Dict[str, object]] = []
        optimized.extend(passthrough)

        if len(triangles) >= 12:
            loops = self._triangle_mesh_to_boundary_loops(triangles)
            if loops:
                for loop in loops:
                    optimized.append(
                        {
                            "kind": "polyline",
                            "points": self._simplify_polyline_points(loop, closed=True),
                            "closed": True,
                            "subtype": "shx_outline_oda_boundary",
                        }
                    )
                return optimized

        # Fallback: keep the original triangles when loop reconstruction is unavailable.
        for tri in triangles:
            if len(tri) >= 4:
                optimized.append(
                    {
                        "kind": "polygon",
                        "rings": [tri],
                        "filled": True,
                        "pattern_name": "TEXT_OUTLINE",
                        "subtype": "shx_outline_oda",
                    }
                )
        return optimized

    def _parse_vectorize_vertex(self, line: str) -> Optional[Dict[str, float]]:
        m = _VECTORIZE_VERTEX_RE.match(line)
        if not m:
            return None
        raw = m.group("point").strip()
        parts = [p for p in re.split(r"\s+", raw) if p]
        if len(parts) < 2:
            return None
        try:
            x = float(parts[0])
            y = float(parts[1])
            z = float(parts[2]) if len(parts) >= 3 else 0.0
        except Exception:
            return None
        return {"x": x, "y": y, "z": z}

    def _parse_oda_vectorize_text_primitives(self, dump_text: str) -> Tuple[Dict[str, List[Dict[str, object]]], Dict[str, object]]:
        result: Dict[str, List[Dict[str, object]]] = {}
        parse_meta: Dict[str, object] = {
            "vectorize_text_entity_count": 0,
            "vectorize_text_keys_count": 0,
            "vectorize_primitives_total": 0,
            "shape_file_text_true_count": 0,
            "vectorize_text_key_samples": [],
        }
        entity_stack: List[Tuple[str, str]] = []
        block_ref_stack: List[str] = []
        text_ctx_stack: List[Dict[str, object]] = []
        capture_kind: Optional[str] = None
        capture_points: List[Dict[str, float]] = []
        key_sample_seen: Set[str] = set()

        def flush_capture() -> None:
            nonlocal capture_kind, capture_points
            if not capture_kind or not text_ctx_stack:
                capture_kind = None
                capture_points = []
                return
            ctx = text_ctx_stack[-1]
            primitives = ctx.get("primitives")
            if not isinstance(primitives, list):
                primitives = []
                ctx["primitives"] = primitives
            shape_file = bool(ctx.get("shape_file", False))

            if capture_kind == "polygon":
                if len(capture_points) >= 3:
                    ring = [dict(p) for p in capture_points]
                    if _point_distance(ring[0], ring[-1]) > 1e-6:
                        ring.append(dict(ring[0]))
                    primitives.append(
                        {
                            "kind": "polygon",
                            "rings": [ring],
                            "filled": True,
                            "pattern_name": "TEXT_OUTLINE",
                            "subtype": "shx_outline_oda",
                            "shape_file_text": shape_file,
                        }
                    )
            elif capture_kind == "polyline":
                if len(capture_points) >= 2:
                    points = [dict(p) for p in capture_points]
                    closed = len(points) >= 3 and _point_distance(points[0], points[-1]) <= 1e-6
                    primitives.append(
                        {
                            "kind": "polyline",
                            "points": points,
                            "closed": closed,
                            "subtype": "shx_outline_oda",
                            "shape_file_text": shape_file,
                        }
                    )

            capture_kind = None
            capture_points = []

        def finalize_text_ctx() -> None:
            if not text_ctx_stack:
                return
            flush_capture()
            ctx = text_ctx_stack.pop()
            key = _normalize_entity_instance_key(ctx.get("key"))
            if not key:
                return
            primitives = ctx.get("primitives")
            if not isinstance(primitives, list):
                return
            clean = [p for p in primitives if isinstance(p, dict)]
            if not clean:
                return
            shape_file = bool(ctx.get("shape_file", False))
            optimized = self._optimize_oda_text_outlines(clean)
            if shape_file:
                parse_meta["shape_file_text_true_count"] = int(parse_meta.get("shape_file_text_true_count", 0)) + 1
                for prim in optimized:
                    if isinstance(prim, dict):
                        prim["shape_file_text"] = True
            bucket = result.setdefault(key, [])
            clean_optimized = [p for p in optimized if isinstance(p, dict)]
            bucket.extend(clean_optimized)
            parse_meta["vectorize_primitives_total"] = int(parse_meta.get("vectorize_primitives_total", 0)) + len(clean_optimized)
            if key not in key_sample_seen and len(key_sample_seen) < 20:
                key_sample_seen.add(key)
                samples = parse_meta.get("vectorize_text_key_samples")
                if isinstance(samples, list):
                    samples.append(key)

        for raw in dump_text.splitlines():
            line = raw.rstrip()

            if capture_kind:
                if capture_kind == "polygon" and "End polygonOut" in line:
                    flush_capture()
                    continue
                if capture_kind == "polyline" and "End polylineOut" in line:
                    flush_capture()
                    continue
                pt = self._parse_vectorize_vertex(line)
                if pt is not None:
                    capture_points.append(pt)
                    continue

            if text_ctx_stack:
                if "Start polygonOut" in line:
                    flush_capture()
                    capture_kind = "polygon"
                    capture_points = []
                    continue
                if "Start polylineOut" in line:
                    flush_capture()
                    capture_kind = "polyline"
                    capture_points = []
                    continue

            m_start = _VECTORIZE_ENTITY_START_RE.match(line)
            if m_start:
                etype = m_start.group("etype").upper()
                handle = m_start.group("handle").upper()
                entity_stack.append((etype, handle))
                if etype == "ACDBBLOCKREFERENCE":
                    block_ref_stack.append(handle)
                if etype in ("ACDBTEXT", "ACDBMTEXT"):
                    parse_meta["vectorize_text_entity_count"] = int(parse_meta.get("vectorize_text_entity_count", 0)) + 1
                    instance_id = handle
                    if block_ref_stack:
                        instance_id = f"{handle}@{'/'.join(block_ref_stack)}"
                    text_ctx_stack.append({"key": instance_id, "primitives": [], "shape_file": False})
                continue

            if text_ctx_stack and not capture_kind:
                label, value = _parse_label_value(line)
                if label == "shape file" and value is not None:
                    text_ctx_stack[-1]["shape_file"] = str(value).strip().lower() == "true"
                    continue

            m_end = _VECTORIZE_ENTITY_END_RE.match(line)
            if m_end:
                end_etype = m_end.group("etype").upper()
                end_handle = m_end.group("handle").upper()
                while entity_stack:
                    popped_etype, popped_handle = entity_stack.pop()
                    if popped_etype in ("ACDBTEXT", "ACDBMTEXT"):
                        finalize_text_ctx()
                    if popped_etype == "ACDBBLOCKREFERENCE" and block_ref_stack:
                        block_ref_stack.pop()
                    if popped_etype == end_etype and popped_handle == end_handle:
                        break
                continue

        flush_capture()
        while text_ctx_stack:
            finalize_text_ctx()

        parse_meta["vectorize_text_keys_count"] = len(result)
        return result, parse_meta

    def _has_shx_text_entities(self, entities_by_space: Dict[str, List[Dict[str, object]]]) -> bool:
        for entities in entities_by_space.values():
            for ent in entities:
                if str(ent.get("type", "")).upper() != "TEXT":
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue
                if str(geom.get("font_kind", "")).strip().lower() == "shx":
                    return True
        return False

    def _has_text_entities(self, entities_by_space: Dict[str, List[Dict[str, object]]]) -> bool:
        for entities in entities_by_space.values():
            for ent in entities:
                if str(ent.get("type", "")).upper() == "TEXT":
                    return True
        return False

    def _has_shx_style_hints(self, text_styles: Dict[str, Dict[str, object]]) -> bool:
        for rec in text_styles.values():
            if not isinstance(rec, dict):
                continue
            if bool(rec.get("shape_file", False)):
                return True
            if str(rec.get("font_kind", "")).strip().lower() == "shx":
                return True
            if _detect_font_kind(rec.get("bigfont_name")) == "shx":
                return True
        return False

    def _count_shx_text_fallback_entities(self, entities_by_space: Dict[str, List[Dict[str, object]]]) -> int:
        count = 0
        for entities in entities_by_space.values():
            for ent in entities:
                if str(ent.get("type", "")).upper() != "TEXT":
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue
                if str(geom.get("font_kind", "")).strip().lower() != "shx":
                    continue
                oda_outlines = geom.get("oda_outline_primitives")
                if not isinstance(oda_outlines, list) or len(oda_outlines) == 0:
                    count += 1
        return count

    @staticmethod
    def _format_missing_font_names(names: List[str], max_items: int = 8) -> str:
        if not names:
            return ""
        shown = names[:max_items]
        if len(names) > max_items:
            return f"{'、'.join(shown)} 等{len(names)}个"
        return "、".join(shown)

    def _collect_missing_style_fonts(self, text_styles: Dict[str, Dict[str, object]]) -> Tuple[List[str], List[str]]:
        missing_primary: Dict[str, str] = {}
        missing_bigfont: Dict[str, str] = {}

        def mark_missing(bucket: Dict[str, str], name_raw: object) -> None:
            name = str(name_raw or "").strip()
            if not name:
                return
            if self._resolve_font_file(name) is not None:
                return
            key = name.lower()
            if key not in bucket:
                bucket[key] = name

        for rec in text_styles.values():
            if not isinstance(rec, dict):
                continue
            mark_missing(missing_primary, rec.get("font_name"))
            mark_missing(missing_bigfont, rec.get("bigfont_name"))

        primary_names = sorted(missing_primary.values(), key=lambda s: s.lower())
        bigfont_names = sorted(missing_bigfont.values(), key=lambda s: s.lower())
        return primary_names, bigfont_names

    def _build_missing_font_warning(self, text_styles: Dict[str, Dict[str, object]]) -> Optional[str]:
        primary_names, bigfont_names = self._collect_missing_style_fonts(text_styles)
        if not primary_names and not bigfont_names:
            return None

        parts: List[str] = []
        if primary_names:
            parts.append(f"主字体: {self._format_missing_font_names(primary_names)}")
        if bigfont_names:
            parts.append(f"大字体: {self._format_missing_font_names(bigfont_names)}")
        detail = "；".join(parts)
        return f"以下字体文件在服务器未找到：{detail}。已按可用字体或降级策略渲染。"

    def _build_shx_font_resolution_warning(
        self,
        text_styles: Dict[str, Dict[str, object]],
        shx_detected: bool,
        shx_true_outline: bool,
    ) -> Optional[str]:
        if not shx_detected or shx_true_outline:
            return None

        missing_items: Dict[str, str] = {}
        found_items: Dict[str, str] = {}

        def push_item(bucket: Dict[str, str], label: str) -> None:
            key = label.lower()
            if key not in bucket:
                bucket[key] = label

        for rec in text_styles.values():
            if not isinstance(rec, dict):
                continue
            shape_file = bool(rec.get("shape_file", False))
            font_kind = str(rec.get("font_kind", "")).strip().lower()
            font_name = str(rec.get("font_name") or "").strip()
            bigfont_name = str(rec.get("bigfont_name") or "").strip()

            primary_is_shx = shape_file or font_kind == "shx" or _detect_font_kind(font_name) == "shx"
            bigfont_is_shx = _detect_font_kind(bigfont_name) == "shx"

            candidates: List[Tuple[str, str]] = []
            if primary_is_shx and font_name:
                candidates.append(("主字体", font_name))
            if bigfont_is_shx and bigfont_name:
                candidates.append(("大字体", bigfont_name))

            for role, name in candidates:
                resolved = self._resolve_font_file(name)
                label = f"{role} {name}"
                if resolved is None:
                    push_item(missing_items, label)
                else:
                    push_item(found_items, label)

        missing_names = sorted(missing_items.values(), key=lambda s: s.lower())
        found_names = sorted(found_items.values(), key=lambda s: s.lower())

        if missing_names:
            fallback_exists = bool(self.shx_fallback_file.exists() and self.shx_fallback_file.is_file())
            fallback_note = (
                f"已尝试使用后备 SHX 字体 {self.shx_fallback_file.name}。"
                if fallback_exists
                else "未检测到可用后备 SHX 字体，请补齐 SHX 文件。"
            )
            found_note = (
                f"已找到：{self._format_missing_font_names(found_names, max_items=6)}。"
                if found_names
                else ""
            )
            return f"以下字体文件在服务器未找到：SHX {self._format_missing_font_names(missing_names)}。{fallback_note}{found_note}"

        if found_names:
            return (
                f"SHX 字体文件检查：未发现缺失项（{self._format_missing_font_names(found_names, max_items=6)}），"
                "当前降级更可能由轮廓匹配失败导致。"
            )

        return "检测到 SHX 文本，但未解析出具体 SHX 字体名；当前已使用降级笔画渲染。"

    @staticmethod
    def _string_list(value: object) -> List[str]:
        if not isinstance(value, list):
            return []
        out: List[str] = []
        seen: Set[str] = set()
        for item in value:
            s = str(item or "").strip()
            if not s:
                continue
            k = s.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append(s)
        return out

    @staticmethod
    def _font_display_name(font_record: Dict[str, object]) -> str:
        return (
            str(font_record.get("name") or "").strip()
            or str(font_record.get("style_name") or "").strip()
            or str(font_record.get("key") or "").strip()
            or "未命名SHX"
        )

    def _build_shx_diagnostics_from_fonts(self, fonts: List[Dict[str, object]]) -> Dict[str, object]:
        missing: Dict[str, str] = {}
        resolved: Dict[str, str] = {}
        fallback_file: Optional[str] = None
        fallback_hit_count = 0

        for rec in fonts:
            kind = str(rec.get("kind") or "").strip().lower()
            if kind != "shx":
                continue
            name = self._font_display_name(rec)
            name_key = name.lower()
            reason = str(rec.get("reason") or "").strip().lower()
            fallback_hit = bool(rec.get("fallback_shx_hit"))
            fallback_file_name = str(rec.get("fallback_shx_file_name") or "").strip() or None
            available = bool(rec.get("available"))

            looks_missing = fallback_hit or (not available) or ("not found" in reason) or ("未找到" in reason)
            if looks_missing:
                missing[name_key] = name
                fallback_hit_count += 1 if fallback_hit else 0
                if fallback_hit and fallback_file_name:
                    fallback_file = fallback_file_name
                continue
            resolved[name_key] = name

        missing_names = sorted(missing.values(), key=lambda s: s.lower())
        resolved_names = sorted(v for k, v in resolved.items() if k not in missing)
        if not fallback_file and fallback_hit_count > 0:
            fallback_file = self.shx_fallback_file.name
        return {
            "missing_original_shx_fonts": missing_names,
            "resolved_original_shx_fonts": resolved_names,
            "fallback_shx_file": fallback_file,
            "fallback_hit_count": int(fallback_hit_count),
            "diagnostics_unavailable": False,
        }

    def _build_shx_status(self, session: DwgDocSession) -> Dict[str, object]:
        mode = str(session.shx_outline_mode or "none").strip().lower() or "none"
        true_outline = bool(session.shx_true_outline or (mode == "oda_vectorize" and session.shx_vectorize_attached_count > 0))
        payload = {
            "detected": bool(session.shx_detected),
            "outline_mode": mode,
            "true_outline": true_outline,
            "vectorize_attempted": bool(session.shx_vectorize_attempted),
            "vectorize_attached_count": int(session.shx_vectorize_attached_count),
            "vectorize_error": session.shx_vectorize_error,
            "fallback_text_count": int(session.shx_fallback_text_count),
            "vectorize_available": bool(self._is_oda_vectorize_available()),
            "missing_original_shx_fonts": list(session.shx_missing_original_fonts),
            "resolved_original_shx_fonts": list(session.shx_resolved_original_fonts),
            "fallback_shx_file": session.shx_fallback_file_name,
            "fallback_hit_count": int(session.shx_fallback_hit_count),
            "diagnostics_unavailable": bool(session.shx_diagnostics_unavailable),
        }
        if isinstance(session.shx_debug_match, dict):
            payload["debug_match"] = session.shx_debug_match
        return payload

    def _attach_oda_vectorized_text_primitives(
        self,
        entities_by_space: Dict[str, List[Dict[str, object]]],
        text_primitives: Dict[str, List[Dict[str, object]]],
    ) -> int:
        attached, _ = self._attach_oda_vectorized_text_primitives_with_debug(
            entities_by_space,
            text_primitives,
            enable_debug=False,
        )
        return attached

    def _attach_oda_vectorized_text_primitives_with_debug(
        self,
        entities_by_space: Dict[str, List[Dict[str, object]]],
        text_primitives: Dict[str, List[Dict[str, object]]],
        enable_debug: bool,
    ) -> Tuple[int, Dict[str, object]]:
        debug: Dict[str, object] = {
            "attach_candidate_entity_count": 0,
            "matched_entity_count": 0,
            "unmatched_entity_count": 0,
            "no_vectorize_payload_count": 0,
            "key_mismatch_count": 0,
            "filtered_by_font_kind_count": 0,
            "empty_after_optimize_count": 0,
            "filtered_non_shx_count": 0,
            "shape_file_text_true_count": 0,
            "unmatched_key_samples": [],
            "orphan_vectorize_key_samples": [],
            "key_mismatch_samples": [],
        }
        if not text_primitives:
            return 0, debug

        vector_keys: Set[str] = set()
        for k in text_primitives.keys():
            nk = _normalize_entity_instance_key(k)
            if nk:
                vector_keys.add(nk)
        vector_base_handles = {k.split("@", 1)[0] for k in vector_keys}
        matched_vector_keys: Set[str] = set()

        attached = 0
        for entities in entities_by_space.values():
            for ent in entities:
                if str(ent.get("type", "")).upper() != "TEXT":
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue

                debug["attach_candidate_entity_count"] = int(debug.get("attach_candidate_entity_count", 0)) + 1

                ent_id = str(ent.get("id", "")).strip()
                base_id = ent_id.split("@", 1)[0].strip() if ent_id else ""
                handle_raw = str(ent.get("handle", "")).strip()
                if not handle_raw:
                    handle_raw = base_id
                base_norm = _normalize_entity_instance_key(base_id)
                handle_norm = _normalize_entity_instance_key(handle_raw)
                candidate_keys = [
                    _normalize_entity_instance_key(ent_id),
                    base_norm,
                    handle_norm,
                ]

                resolved_key: Optional[str] = None
                resolved: Optional[List[Dict[str, object]]] = None
                for key in candidate_keys:
                    if not key:
                        continue
                    hit = text_primitives.get(key)
                    if isinstance(hit, list) and hit:
                        resolved_key = key
                        resolved = hit
                        break

                if not resolved:
                    looks_mismatch = False
                    if base_norm and base_norm.split("@", 1)[0] in vector_base_handles:
                        looks_mismatch = True
                    elif handle_norm and handle_norm.split("@", 1)[0] in vector_base_handles:
                        looks_mismatch = True

                    if looks_mismatch:
                        debug["key_mismatch_count"] = int(debug.get("key_mismatch_count", 0)) + 1
                        if enable_debug:
                            samples = debug.get("key_mismatch_samples")
                            if isinstance(samples, list) and len(samples) < 10:
                                samples.append(
                                    {
                                        "entity_id": ent_id,
                                        "handle": handle_raw,
                                        "instance_path": ent.get("instance_path"),
                                        "candidate_keys": [k for k in candidate_keys if k],
                                    }
                                )
                    else:
                        debug["no_vectorize_payload_count"] = int(debug.get("no_vectorize_payload_count", 0)) + 1

                    if enable_debug:
                        unmatched = debug.get("unmatched_key_samples")
                        first_key = next((k for k in candidate_keys if k), ent_id or handle_raw)
                        if isinstance(unmatched, list) and first_key and len(unmatched) < 20:
                            unmatched.append(first_key)
                    continue

                if resolved_key:
                    matched_vector_keys.add(resolved_key)
                font_kind = str(geom.get("font_kind", "")).strip().lower()
                shape_file_text = any(bool(p.get("shape_file_text")) for p in resolved if isinstance(p, dict))
                if shape_file_text:
                    debug["shape_file_text_true_count"] = int(debug.get("shape_file_text_true_count", 0)) + 1
                if font_kind != "shx" and not shape_file_text:
                    debug["filtered_by_font_kind_count"] = int(debug.get("filtered_by_font_kind_count", 0)) + 1
                    debug["filtered_non_shx_count"] = int(debug.get("filtered_non_shx_count", 0)) + 1
                    continue

                clean_resolved = [p for p in resolved if isinstance(p, dict)]
                if len(clean_resolved) == 0:
                    debug["empty_after_optimize_count"] = int(debug.get("empty_after_optimize_count", 0)) + 1
                    continue

                geom_out = dict(geom)
                geom_out["oda_outline_primitives"] = clean_resolved
                geom_out["shx_outline_mode"] = "oda_vectorize"
                if shape_file_text and font_kind != "shx":
                    geom_out["font_kind"] = "shx"
                ent["geom"] = geom_out
                attached += 1
                debug["matched_entity_count"] = int(debug.get("matched_entity_count", 0)) + 1

        attach_candidates = int(debug.get("attach_candidate_entity_count", 0))
        matched_count = int(debug.get("matched_entity_count", 0))
        debug["unmatched_entity_count"] = max(0, attach_candidates - matched_count)
        if enable_debug:
            orphan = [k for k in sorted(vector_keys) if k not in matched_vector_keys]
            debug["orphan_vectorize_key_samples"] = orphan[:20]
        return attached, debug

    def _build_entity_from_oda(
        self,
        etype: str,
        handle: str,
        lines: List[str],
        space_id: str,
        dim_styles: Optional[Dict[str, Dict[str, object]]] = None,
        header_dim_defaults: Optional[Dict[str, object]] = None,
    ) -> Optional[Dict[str, object]]:
        is_block_reference = etype.lower() == "acdbblockreference"
        blockref_has_position = False
        layer = "0"
        min_pt: Optional[Dict[str, float]] = None
        max_pt: Optional[Dict[str, float]] = None
        origin_pt: Optional[Dict[str, float]] = None
        u_axis_pt: Optional[Dict[str, float]] = None
        center_pt: Optional[Dict[str, float]] = None
        start_pt: Optional[Dict[str, float]] = None
        end_pt: Optional[Dict[str, float]] = None
        radius: Optional[float] = None
        start_angle: Optional[float] = None
        end_angle: Optional[float] = None
        vertices: List[Dict[str, float]] = []
        vertex_segment_kinds: List[str] = []
        current_vertex_segment_kind: Optional[str] = None
        block_name: Optional[str] = None
        scale_factors: Optional[Dict[str, float]] = None
        rotation_deg: Optional[float] = None
        text_string: Optional[str] = None
        text_height: Optional[float] = None
        text_width: Optional[float] = None
        major_axis_vec: Optional[Dict[str, float]] = None
        minor_axis_vec: Optional[Dict[str, float]] = None
        major_radius: Optional[float] = None
        minor_radius: Optional[float] = None
        spline_points: List[Dict[str, float]] = []
        color_index: Optional[int] = None
        color_name: Optional[str] = None
        linetype_name: Optional[str] = None
        lineweight_name: Optional[str] = None
        text_style_name: Optional[str] = None
        width_factor: Optional[float] = None
        oblique_angle: Optional[float] = None
        horizontal_mode: Optional[str] = None
        vertical_mode: Optional[str] = None
        attachment_mode: Optional[str] = None
        actual_height: Optional[float] = None
        mirrored_x: Optional[bool] = None
        mirrored_y: Optional[bool] = None
        poly_start_width: Optional[float] = None
        poly_end_width: Optional[float] = None
        poly_global_width: Optional[float] = None
        poly_closed_flag: Optional[bool] = None
        poly_closed_seen = False
        named_points: Dict[str, Dict[str, float]] = {}

        hatch_pattern_name: Optional[str] = None
        hatch_solid_fill = False
        hatch_pattern_angle: Optional[float] = None
        hatch_pattern_scale: Optional[float] = None
        hatch_pattern_spacing: Optional[float] = None
        hatch_loops: List[Dict[str, object]] = []
        hatch_current_loop: Optional[Dict[str, object]] = None
        hatch_current_edge_start: Optional[Dict[str, float]] = None
        hatch_current_edge: Optional[Dict[str, object]] = None
        dimension_line_point: Optional[Dict[str, float]] = None
        ext_line1_point: Optional[Dict[str, float]] = None
        ext_line2_point: Optional[Dict[str, float]] = None
        dimension_measurement: Optional[float] = None
        formatted_measurement: Optional[str] = None
        dimension_style_name: Optional[str] = None
        dimension_arrow_block: Optional[str] = None
        dimension_arrow_block1: Optional[str] = None
        dimension_arrow_block2: Optional[str] = None
        dimension_arrow_size: Optional[float] = None
        text_position_point: Optional[Dict[str, float]] = None
        text_rotation_deg: Optional[float] = None
        leader_has_arrowhead = False
        leader_splined = False
        leader_arrow_block: Optional[str] = None
        leader_arrow_size: Optional[float] = None

        expect_vertex_point = False

        for raw in lines:
            stripped = raw.strip()
            if etype.lower() == "acdbblockreference" and stripped.startswith("<AcDb") and not stripped.startswith("<AcDbBlockReference"):
                # Stop at nested entities (e.g. AcDbAttribute) to avoid picking child fields as INSERT transform.
                break
            if stripped.lower().startswith("vertex "):
                inline_label, inline_value = _parse_label_value(raw)
                if inline_label and inline_value is not None:
                    inline_pt = _parse_point_value(inline_value)
                    if inline_pt is not None:
                        vertices.append(inline_pt)
                        vertex_segment_kinds.append((current_vertex_segment_kind or "").strip())
                        expect_vertex_point = False
                        current_vertex_segment_kind = None
                        continue
                expect_vertex_point = True
                current_vertex_segment_kind = None
                continue

            label, value = _parse_label_value(raw)
            if not label or value is None:
                continue

            if expect_vertex_point and label == "point":
                pt = _parse_point_value(value)
                if pt is not None:
                    vertices.append(pt)
                    vertex_segment_kinds.append((current_vertex_segment_kind or "").strip())
                    expect_vertex_point = False
                    current_vertex_segment_kind = None
                continue
            if expect_vertex_point and label == "segment type":
                current_vertex_segment_kind = value
                continue

            if label == "layer":
                layer = value
                continue
            if label == "dimension line point":
                dimension_line_point = _parse_point_value(value)
                continue
            if label == "extension line 1 point":
                ext_line1_point = _parse_point_value(value)
                continue
            if label == "extension line 2 point":
                ext_line2_point = _parse_point_value(value)
                continue
            if label == "measurement":
                dimension_measurement = _parse_float_value(value)
                continue
            if label == "formatted measurement":
                formatted_measurement = value
                continue
            if label == "text rotation":
                text_rotation_deg = _parse_float_value(value)
                continue
            if label in ("dimension style", "dim style", "dimstyle"):
                dimension_style_name = value.strip() or None
                continue
            if label == "dimblk":
                dimension_arrow_block = _normalize_dimblk_name(value)
                continue
            if label == "dimblk1":
                dimension_arrow_block1 = _normalize_dimblk_name(value)
                continue
            if label == "dimblk2":
                dimension_arrow_block2 = _normalize_dimblk_name(value)
                continue
            if label == "dimasz":
                dimension_arrow_size = _parse_float_value(value)
                continue
            if label == "has arrowhead":
                leader_has_arrowhead = value.strip().lower() == "true"
                continue
            if label == "splined":
                leader_splined = value.strip().lower() == "true"
                continue
            if label in ("arrow symbol", "arrow block", "leader arrow block", "dimldrblk"):
                leader_arrow_block = _normalize_dimblk_name(value)
                continue
            if label == "arrow size":
                leader_arrow_size = _parse_float_value(value)
                continue
            if etype.lower() == "acdbhatch" and label.startswith("loop "):
                hatch_current_loop = {"kind": value, "points": [], "edges": [], "closed": True}
                hatch_loops.append(hatch_current_loop)
                hatch_current_edge_start = None
                hatch_current_edge = None
                continue
            if etype.lower() == "acdbhatch" and label.startswith("edge "):
                hatch_current_edge_start = None
                hatch_current_edge = {"kind": value}
                if isinstance(hatch_current_loop, dict):
                    loop_edges = hatch_current_loop.get("edges")
                    if not isinstance(loop_edges, list):
                        loop_edges = []
                        hatch_current_loop["edges"] = loop_edges
                    loop_edges.append(hatch_current_edge)
                continue
            if etype.lower() == "acdbhatch" and label == "pattern name":
                hatch_pattern_name = value
                continue
            if etype.lower() == "acdbhatch" and label == "solid fill":
                hatch_solid_fill = value.strip().lower() == "true"
                continue
            if etype.lower() == "acdbhatch" and label == "pattern angle":
                hatch_pattern_angle = _parse_float_value(value)
                continue
            if etype.lower() == "acdbhatch" and label == "pattern scale":
                hatch_pattern_scale = _parse_float_value(value)
                continue
            if etype.lower() == "acdbhatch" and label in ("pattern space", "pattern spacing"):
                hatch_pattern_spacing = _parse_float_value(value)
                continue
            if label == "min extents":
                min_pt = _parse_point_value(value)
                continue
            if label == "max extents":
                max_pt = _parse_point_value(value)
                continue
            if label == "origin":
                parsed_origin = _parse_point_value(value)
                if parsed_origin is None:
                    continue
                # AcDbBlockReference may contain an OCS "Origin" section after "Position".
                # Keep insertion point from "Position" when available.
                if is_block_reference and blockref_has_position:
                    continue
                origin_pt = parsed_origin
                continue
            if label == "u-axis":
                u_axis_pt = _parse_point_value(value)
                continue
            if label in ("center", "center point"):
                parsed_center = _parse_point_value(value)
                if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                    if isinstance(parsed_center, dict):
                        hatch_current_edge["center"] = parsed_center
                    continue
                center_pt = parsed_center
                continue
            if label == "radius":
                parsed_radius = _parse_float_value(value)
                if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                    if isinstance(parsed_radius, float) and math.isfinite(parsed_radius):
                        hatch_current_edge["radius"] = float(parsed_radius)
                    continue
                radius = parsed_radius
                continue
            if label == "closed":
                poly_closed_seen = True
                poly_closed_flag = value.strip().lower() in ("true", "1", "yes", "ktrue")
                continue
            if label in ("start width", "starting width"):
                w = _parse_float_value(value)
                if isinstance(w, float) and math.isfinite(w) and w > 0:
                    if poly_start_width is None or w > poly_start_width:
                        poly_start_width = float(w)
                continue
            if label in ("end width", "ending width"):
                w = _parse_float_value(value)
                if isinstance(w, float) and math.isfinite(w) and w > 0:
                    if poly_end_width is None or w > poly_end_width:
                        poly_end_width = float(w)
                continue
            if label in ("constant width", "global width"):
                w = _parse_float_value(value)
                if isinstance(w, float) and math.isfinite(w) and w > 0:
                    if poly_global_width is None or w > poly_global_width:
                        poly_global_width = float(w)
                continue
            if label == "width" and etype.lower() in ("acdbpolyline", "acdb2dpolyline", "acdb3dpolyline", "acdblwpolyline"):
                w = _parse_float_value(value)
                if isinstance(w, float) and math.isfinite(w) and w > 0:
                    if poly_global_width is None or w > poly_global_width:
                        poly_global_width = float(w)
                continue
            if label == "start point":
                if etype.lower() == "acdbhatch":
                    hatch_current_edge_start = _parse_point_value(value)
                    if isinstance(hatch_current_edge, dict) and isinstance(hatch_current_edge_start, dict):
                        hatch_current_edge["start_point"] = hatch_current_edge_start
                    continue
                start_pt = _parse_point_value(value)
                continue
            if label == "end point":
                if etype.lower() == "acdbhatch":
                    p_end = _parse_point_value(value)
                    if isinstance(hatch_current_edge, dict) and isinstance(p_end, dict):
                        hatch_current_edge["end_point"] = p_end
                    if isinstance(hatch_current_loop, dict) and isinstance(p_end, dict):
                        loop_points = hatch_current_loop.get("points")
                        if not isinstance(loop_points, list):
                            loop_points = []
                            hatch_current_loop["points"] = loop_points
                        if isinstance(hatch_current_edge_start, dict):
                            if not loop_points:
                                loop_points.append(hatch_current_edge_start)
                            elif isinstance(loop_points[-1], dict) and _point_distance(loop_points[-1], hatch_current_edge_start) > 1e-6:
                                loop_points.append(hatch_current_edge_start)
                        if not loop_points:
                            loop_points.append(p_end)
                        elif isinstance(loop_points[-1], dict) and _point_distance(loop_points[-1], p_end) > 1e-6:
                            loop_points.append(p_end)
                    continue
                end_pt = _parse_point_value(value)
                continue
            if label == "start angle":
                parsed_start_angle = _parse_float_value(value)
                if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                    if isinstance(parsed_start_angle, float) and math.isfinite(parsed_start_angle):
                        hatch_current_edge["start_angle"] = float(parsed_start_angle)
                    continue
                start_angle = parsed_start_angle
                continue
            if label == "end angle":
                parsed_end_angle = _parse_float_value(value)
                if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                    if isinstance(parsed_end_angle, float) and math.isfinite(parsed_end_angle):
                        hatch_current_edge["end_angle"] = float(parsed_end_angle)
                    continue
                end_angle = parsed_end_angle
                continue
            if etype.lower() == "acdbhatch" and label == "clockwise":
                if isinstance(hatch_current_edge, dict):
                    hatch_current_edge["clockwise"] = value.strip().lower() == "true"
                continue
            if label == "name":
                block_name = value
                continue
            if label == "position":
                parsed_position = _parse_point_value(value)
                if parsed_position is not None:
                    origin_pt = parsed_position
                    if is_block_reference:
                        blockref_has_position = True
                continue
            if label == "scale factors":
                scale_factors = _parse_point_value(value)
                continue
            if label == "rotation":
                rotation_deg = _parse_float_value(value)
                continue
            if label in ("text string", "contents"):
                text_string = value
                continue
            if label in ("text position", "location"):
                origin_pt = _parse_point_value(value)
                text_position_point = origin_pt
                continue
            if label == "height":
                text_height = _parse_float_value(value)
                continue
            if label in ("actual width", "width"):
                text_width = _parse_float_value(value)
                continue
            if label == "actual height":
                actual_height = _parse_float_value(value)
                continue
            if label == "major axis":
                major_axis_vec = _parse_point_value(value)
                continue
            if label == "minor axis":
                minor_axis_vec = _parse_point_value(value)
                continue
            if label == "major radius":
                major_radius = _parse_float_value(value)
                continue
            if label == "minor radius":
                minor_radius = _parse_float_value(value)
                continue
            if label.startswith("control point ") or label.startswith("fit point "):
                pt = _parse_point_value(value)
                if pt is not None:
                    spline_points.append(pt)
                continue
            if label == "color index":
                try:
                    color_index = int(value)
                except Exception:
                    color_index = None
                continue
            if label == "color":
                color_name = value
                continue
            if label == "linetype":
                linetype_name = value
                continue
            if label == "lineweight":
                lineweight_name = value
                continue
            if label == "text style":
                text_style_name = value
                continue
            if label == "width factor":
                width_factor = _parse_float_value(value)
                continue
            if label == "oblique":
                oblique_angle = _parse_float_value(value)
                continue
            if label == "horizontal mode":
                horizontal_mode = value
                continue
            if label == "vertical mode":
                vertical_mode = value
                continue
            if label == "attachment":
                attachment_mode = value
                continue
            if label == "mirrored in x":
                mirrored_x = value.strip().lower() == "true"
                continue
            if label == "mirrored in y":
                mirrored_y = value.strip().lower() == "true"
                continue
            point_like = _parse_point_value(value)
            if point_like is not None:
                if "point" in label or label.startswith("frame vertex "):
                    named_points[label] = point_like
                    continue

        bbox = {"min": min_pt, "max": max_pt} if (min_pt and max_pt) else None
        et = etype.lower()

        style_obj: Dict[str, object] = {"lineweight": lineweight_name or "default"}
        lineweight_mm = _lineweight_to_mm(lineweight_name)
        if isinstance(lineweight_mm, float) and math.isfinite(lineweight_mm) and lineweight_mm > 0:
            style_obj["lineweight_mm"] = lineweight_mm
        if color_index is not None:
            style_obj["color_index"] = color_index
        if color_name:
            style_obj["color"] = color_name
        if linetype_name:
            style_obj["linetype"] = linetype_name
        if text_style_name:
            style_obj["text_style"] = text_style_name

        if et == "acdbline":
            start = start_pt
            end = end_pt
            if (start is None or end is None) and min_pt and max_pt and origin_pt and u_axis_pt:
                bbox_dx = abs(float(max_pt["x"]) - float(min_pt["x"]))
                bbox_dy = abs(float(max_pt["y"]) - float(min_pt["y"]))
                bbox_span = math.hypot(bbox_dx, bbox_dy)
                longer = max(bbox_dx, bbox_dy)
                shorter = min(bbox_dx, bbox_dy)
                slanted_ratio = (shorter / longer) if longer > 1e-12 else 0.0

                ux = float(u_axis_pt.get("x", 0.0))
                uy = float(u_axis_pt.get("y", 0.0))
                un = math.hypot(ux, uy)
                if un > 1e-12:
                    ux /= un
                    uy /= un
                axis_like = (abs(abs(ux) - 1.0) <= 1e-6 and abs(uy) <= 1e-6) or (abs(abs(uy) - 1.0) <= 1e-6 and abs(ux) <= 1e-6)

                # For many ODA exports, AcDbLine always reports canonical OCS u-axis.
                # When bbox is visibly non-axis-aligned, that u-axis is not the line
                # direction and should not drive segment reconstruction.
                allow_u_axis_infer = not (axis_like and slanted_ratio > 1e-3)

                if allow_u_axis_infer:
                    inferred = _line_segment_from_bbox(origin_pt, u_axis_pt, min_pt, max_pt)
                    if inferred:
                        inf_start, inf_end = inferred
                        inferred_len = _point_distance(inf_start, inf_end)
                        # If inferred segment collapses but bbox indicates a visible span,
                        # keep trying other fallbacks.
                        if inferred_len > 1e-9 or bbox_span <= 1e-9:
                            start, end = inf_start, inf_end
            if (start is None or end is None) and min_pt and max_pt and origin_pt:
                inferred_from_origin = _line_segment_from_bbox_and_origin(origin_pt, min_pt, max_pt)
                if inferred_from_origin:
                    start, end = inferred_from_origin
            if (start is None or end is None) and min_pt and max_pt:
                start = dict(min_pt)
                end = dict(max_pt)
            if start is None or end is None:
                return None
            if bbox is None:
                bbox = _bbox_from_points([start, end])
            return {
                "id": handle,
                "type": "LINE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"start": start, "end": end},
                "style": style_obj,
                "bbox": bbox,
            }

        if et in ("acdbpolyline", "acdb2dpolyline", "acdb3dpolyline", "acdblwpolyline"):
            if len(vertices) < 2:
                return None
            if poly_closed_seen:
                # Trust explicit CAD flag first: Closed=false must remain open.
                is_closed = bool(poly_closed_flag)
            else:
                is_closed = False
                if len(vertices) >= 2:
                    first_v = vertices[0]
                    last_v = vertices[-1]
                    is_closed = _point_distance(first_v, last_v) <= 1e-6
                if not is_closed and vertex_segment_kinds:
                    tail = vertex_segment_kinds[-1].lower()
                    if "coincident" in tail:
                        is_closed = True
                if not is_closed and vertex_segment_kinds and len(vertex_segment_kinds) == len(vertices):
                    tail = vertex_segment_kinds[-1].strip().lower()
                    # In ODA polyline dump, an open polyline typically ends with kPoint
                    # (no outgoing segment from the last vertex). If the last vertex still
                    # has a real segment kind (kLine / kArc / etc.), it implies closure.
                    if tail and tail not in ("kpoint", "point", "kcoincident", "coincident"):
                        is_closed = True
            if bbox is None:
                bbox = _bbox_from_points(vertices)
            poly_geom: Dict[str, object] = {"vertices": vertices, "closed": is_closed}
            if isinstance(poly_start_width, float) and math.isfinite(poly_start_width) and poly_start_width > 0:
                poly_geom["start_width"] = float(poly_start_width)
            if isinstance(poly_end_width, float) and math.isfinite(poly_end_width) and poly_end_width > 0:
                poly_geom["end_width"] = float(poly_end_width)
            if isinstance(poly_global_width, float) and math.isfinite(poly_global_width) and poly_global_width > 0:
                poly_geom["global_width"] = float(poly_global_width)
            return {
                "id": handle,
                "type": "POLYLINE",
                "layer": layer,
                "space_id": space_id,
                "geom": poly_geom,
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbcircle":
            if center_pt is None or radius is None:
                return None
            if bbox is None:
                bbox = {
                    "min": {"x": center_pt["x"] - radius, "y": center_pt["y"] - radius, "z": center_pt.get("z", 0.0)},
                    "max": {"x": center_pt["x"] + radius, "y": center_pt["y"] + radius, "z": center_pt.get("z", 0.0)},
                }
            return {
                "id": handle,
                "type": "CIRCLE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"center": center_pt, "radius": radius},
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbarc":
            if center_pt is None or radius is None:
                return None

            if start_pt is None and start_angle is not None:
                rad = math.radians(start_angle)
                start_pt = {"x": center_pt["x"] + radius * math.cos(rad), "y": center_pt["y"] + radius * math.sin(rad), "z": center_pt.get("z", 0.0)}
            if end_pt is None and end_angle is not None:
                rad = math.radians(end_angle)
                end_pt = {"x": center_pt["x"] + radius * math.cos(rad), "y": center_pt["y"] + radius * math.sin(rad), "z": center_pt.get("z", 0.0)}

            if bbox is None:
                pts = [center_pt]
                if start_pt:
                    pts.append(start_pt)
                if end_pt:
                    pts.append(end_pt)
                bbox = _bbox_from_points(pts)

            geom: Dict[str, object] = {"center": center_pt, "radius": radius}
            if start_pt:
                geom["start"] = start_pt
            if end_pt:
                geom["end"] = end_pt
            if start_angle is not None:
                geom["start_angle"] = start_angle
            if end_angle is not None:
                geom["end_angle"] = end_angle

            return {
                "id": handle,
                "type": "ARC",
                "layer": layer,
                "space_id": space_id,
                "geom": geom,
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbblockreference":
            if not block_name:
                return None
            position = origin_pt or {"x": 0.0, "y": 0.0, "z": 0.0}
            sx = float(scale_factors.get("x", 1.0)) if isinstance(scale_factors, dict) else 1.0
            sy = float(scale_factors.get("y", 1.0)) if isinstance(scale_factors, dict) else 1.0
            sz = float(scale_factors.get("z", 1.0)) if isinstance(scale_factors, dict) else 1.0
            return {
                "id": handle,
                "type": "INSERT",
                "layer": layer,
                "space_id": space_id,
                "geom": {
                    "block_name": block_name,
                    "position": position,
                    "rotation": float(rotation_deg or 0.0),
                    "scale": {"x": sx, "y": sy, "z": sz},
                },
                "style": style_obj,
                "bbox": bbox,
            }

        if et in ("acdbtext", "acdbmtext", "acdbattributedefinition", "acdbattribute"):
            text = text_string or ""
            pos = origin_pt
            if pos is None:
                if min_pt and max_pt:
                    pos = {
                        "x": (min_pt["x"] + max_pt["x"]) * 0.5,
                        "y": (min_pt["y"] + max_pt["y"]) * 0.5,
                        "z": min_pt.get("z", 0.0),
                    }
                else:
                    return None
            if bbox is None:
                h = float(text_height or 100.0)
                w = float(text_width or max(h * 0.5, len(text) * h * 0.55))
                bbox = {
                    "min": {"x": pos["x"], "y": pos["y"] - h, "z": pos.get("z", 0.0)},
                    "max": {"x": pos["x"] + w, "y": pos["y"], "z": pos.get("z", 0.0)},
                }
            return {
                "id": handle,
                "type": "TEXT",
                "layer": layer,
                "space_id": space_id,
                "geom": {
                    "text": text.replace("\\P", "\n").replace("\\p", "\n"),
                    "position": pos,
                    "height": float(text_height or 100.0),
                    "rotation": float(rotation_deg or 0.0),
                    "width": float(text_width or 0.0),
                    "width_factor": float(width_factor or 1.0),
                    "is_mtext": et == "acdbmtext",
                    "style_name": text_style_name,
                    "horizontal_mode": horizontal_mode,
                    "vertical_mode": vertical_mode,
                    "attachment": attachment_mode,
                    "oblique": float(oblique_angle or 0.0),
                    "actual_height": float(actual_height or text_height or 0.0),
                    "mirrored_x": bool(mirrored_x),
                    "mirrored_y": bool(mirrored_y),
                    "is_attribute": et in ("acdbattributedefinition", "acdbattribute"),
                },
                "style": style_obj,
                "bbox": bbox,
            }

        if et in ("acdbraligneddimension", "acdbrotateddimension"):
            ext1 = ext_line1_point or named_points.get("extension line 1 point")
            ext2 = ext_line2_point or named_points.get("extension line 2 point")
            dim_pt = dimension_line_point or named_points.get("dimension line point") or origin_pt
            text_pos = text_position_point or named_points.get("text position") or dim_pt

            if not isinstance(ext1, dict) or not isinstance(ext2, dict):
                return None
            if not isinstance(dim_pt, dict):
                dim_pt = dict(ext2)
            line_start, line_end = _dimension_line_endpoints(ext1, ext2, dim_pt)

            if bbox is None:
                pts_for_bbox = [ext1, ext2, dim_pt, line_start, line_end]
                if isinstance(text_pos, dict):
                    pts_for_bbox.append(text_pos)
                bbox = _bbox_from_points(pts_for_bbox)

            text_value = _clean_oda_text_value(text_string)
            if not text_value:
                text_value = _clean_oda_text_value(formatted_measurement)

            style_key = (dimension_style_name or "").strip()
            style_rec = (dim_styles or {}).get(style_key, {}) if style_key else {}
            dim_defaults = header_dim_defaults or {}
            dimblk = (
                dimension_arrow_block
                or _normalize_dimblk_name(style_rec.get("dimblk"))
                or _normalize_dimblk_name(dim_defaults.get("dimblk"))
            )
            dimblk1 = (
                dimension_arrow_block1
                or _normalize_dimblk_name(style_rec.get("dimblk1"))
                or _normalize_dimblk_name(dim_defaults.get("dimblk1"))
            )
            dimblk2 = (
                dimension_arrow_block2
                or _normalize_dimblk_name(style_rec.get("dimblk2"))
                or _normalize_dimblk_name(dim_defaults.get("dimblk2"))
            )
            if not dimblk1:
                dimblk1 = dimblk
            if not dimblk2:
                dimblk2 = dimblk
            dimasz = dimension_arrow_size
            if not isinstance(dimasz, (int, float)) or not math.isfinite(float(dimasz)) or float(dimasz) <= 0:
                style_dimasz = style_rec.get("dimasz")
                if isinstance(style_dimasz, (int, float)) and math.isfinite(float(style_dimasz)) and float(style_dimasz) > 0:
                    dimasz = float(style_dimasz)
            if not isinstance(dimasz, (int, float)) or not math.isfinite(float(dimasz)) or float(dimasz) <= 0:
                default_dimasz = dim_defaults.get("dimasz")
                if isinstance(default_dimasz, (int, float)) and math.isfinite(float(default_dimasz)) and float(default_dimasz) > 0:
                    dimasz = float(default_dimasz)
            geom_dim: Dict[str, object] = {
                "ext1": ext1,
                "ext2": ext2,
                "dim_line_point": dim_pt,
                "line_start": line_start,
                "line_end": line_end,
                "measurement": float(dimension_measurement or _point_distance(ext1, ext2)),
                "rotation": float(text_rotation_deg if text_rotation_deg is not None else rotation_deg or 0.0),
                "text": text_value,
                "text_position": text_pos if isinstance(text_pos, dict) else dict(dim_pt),
                "dim_kind": "aligned" if et == "acdbraligneddimension" else "rotated",
                "dimension_style": style_key or None,
                "arrow_block": dimblk or None,
                "arrow_block1": dimblk1 or None,
                "arrow_block2": dimblk2 or None,
            }
            if isinstance(dimasz, (int, float)) and math.isfinite(float(dimasz)) and float(dimasz) > 0:
                geom_dim["arrow_size"] = float(dimasz)
            return {
                "id": handle,
                "type": "DIMENSION",
                "layer": layer,
                "space_id": space_id,
                "geom": geom_dim,
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbleader":
            leader_points = [p for p in vertices if isinstance(p, dict)]
            if len(leader_points) < 2:
                # Fallback: parse named vertex labels when ODA emits them inline.
                by_index: List[Tuple[int, Dict[str, float]]] = []
                for k, p in named_points.items():
                    m = re.match(r"^vertex\s+(\d+)$", k)
                    if not m:
                        continue
                    by_index.append((int(m.group(1)), p))
                by_index.sort(key=lambda item: item[0])
                leader_points = [p for _, p in by_index]
            if len(leader_points) < 2 and isinstance(start_pt, dict) and isinstance(end_pt, dict):
                leader_points = [start_pt, end_pt]
            if len(leader_points) < 2:
                return None
            if bbox is None:
                bbox = _bbox_from_points(leader_points)
            dim_defaults = header_dim_defaults or {}
            resolved_leader_arrow_block = (
                leader_arrow_block
                or _normalize_dimblk_name(dim_defaults.get("dimldrblk"))
                or _normalize_dimblk_name(dim_defaults.get("dimblk"))
            )
            resolved_leader_arrow_size = leader_arrow_size
            if (
                not isinstance(resolved_leader_arrow_size, (int, float))
                or not math.isfinite(float(resolved_leader_arrow_size))
                or float(resolved_leader_arrow_size) <= 0
            ):
                default_dimasz = dim_defaults.get("dimasz")
                if isinstance(default_dimasz, (int, float)) and math.isfinite(float(default_dimasz)) and float(default_dimasz) > 0:
                    resolved_leader_arrow_size = float(default_dimasz)
            geom_leader: Dict[str, object] = {
                "points": leader_points,
                "has_arrowhead": bool(leader_has_arrowhead),
                "splined": bool(leader_splined),
                "arrow_block": resolved_leader_arrow_block,
            }
            if (
                isinstance(resolved_leader_arrow_size, (int, float))
                and math.isfinite(float(resolved_leader_arrow_size))
                and float(resolved_leader_arrow_size) > 0
            ):
                geom_leader["arrow_size"] = float(resolved_leader_arrow_size)
            return {
                "id": handle,
                "type": "LEADER",
                "layer": layer,
                "space_id": space_id,
                "geom": geom_leader,
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbpoint":
            pos = origin_pt or center_pt
            if pos is None and min_pt and max_pt:
                pos = {
                    "x": (min_pt["x"] + max_pt["x"]) * 0.5,
                    "y": (min_pt["y"] + max_pt["y"]) * 0.5,
                    "z": min_pt.get("z", 0.0),
                }
            if pos is None:
                return None
            if bbox is None:
                bbox = {"min": dict(pos), "max": dict(pos)}
            return {
                "id": handle,
                "type": "POINT",
                "layer": layer,
                "space_id": space_id,
                "geom": {"position": pos, "display_size": 6.0},
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbhatch":
            loops_out: List[Dict[str, object]] = []
            for lp in hatch_loops:
                if not isinstance(lp, dict):
                    continue
                clean_points = _build_hatch_loop_points_from_edges(lp)
                if len(clean_points) < 2:
                    continue
                if _point_distance(clean_points[0], clean_points[-1]) > 1e-6:
                    clean_points.append(dict(clean_points[0]))
                loops_out.append(
                    {
                        "kind": lp.get("kind", "kExternal") if isinstance(lp, dict) else "kExternal",
                        "points": clean_points,
                        "closed": True,
                    }
                )
            if not loops_out and min_pt and max_pt:
                loops_out = [
                    {
                        "kind": "kExternal",
                        "closed": True,
                        "points": [
                            {"x": min_pt["x"], "y": min_pt["y"], "z": min_pt.get("z", 0.0)},
                            {"x": max_pt["x"], "y": min_pt["y"], "z": min_pt.get("z", 0.0)},
                            {"x": max_pt["x"], "y": max_pt["y"], "z": max_pt.get("z", 0.0)},
                            {"x": min_pt["x"], "y": max_pt["y"], "z": min_pt.get("z", 0.0)},
                            {"x": min_pt["x"], "y": min_pt["y"], "z": min_pt.get("z", 0.0)},
                        ],
                    }
                ]
            if not loops_out:
                return None
            if bbox is None:
                all_pts: List[Dict[str, float]] = []
                for lp in loops_out:
                    pts = lp.get("points")
                    if isinstance(pts, list):
                        all_pts.extend([p for p in pts if isinstance(p, dict)])
                bbox = _bbox_from_points(all_pts)
            return {
                "id": handle,
                "type": "HATCH",
                "layer": layer,
                "space_id": space_id,
                "geom": {
                    "loops": loops_out,
                    "solid_fill": bool(hatch_solid_fill),
                    "pattern_name": hatch_pattern_name or "SOLID",
                    "pattern_angle": hatch_pattern_angle,
                    "pattern_scale": hatch_pattern_scale,
                    "pattern_spacing": hatch_pattern_spacing,
                },
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbwipeout":
            frame_pts: List[Tuple[int, Dict[str, float]]] = []
            for k, p in named_points.items():
                m = re.match(r"^frame vertex\s+(\d+)$", k)
                if not m:
                    continue
                frame_pts.append((int(m.group(1)), p))
            frame_pts.sort(key=lambda item: item[0])
            vertices_out = [p for _, p in frame_pts]
            if len(vertices_out) < 3:
                return None
            if _point_distance(vertices_out[0], vertices_out[-1]) > 1e-6:
                vertices_out.append(dict(vertices_out[0]))
            if bbox is None:
                bbox = _bbox_from_points(vertices_out)
            return {
                "id": handle,
                "type": "WIPEOUT",
                "layer": layer,
                "space_id": space_id,
                "geom": {
                    "vertices": vertices_out,
                    "closed": True,
                },
                "style": style_obj,
                "bbox": bbox,
            }

        if et in ("acdbsolid", "acdbtrace", "acdbface", "acdb3dface"):
            ordered_keys = ("first point", "second point", "third point", "fourth point", "point 0", "point 1", "point 2", "point 3")
            pts: List[Dict[str, float]] = []
            for key in ordered_keys:
                p = named_points.get(key)
                if isinstance(p, dict):
                    if not pts or _point_distance(pts[-1], p) > 1e-6:
                        pts.append(p)
            if len(pts) < 3:
                return None
            if _point_distance(pts[0], pts[-1]) > 1e-6:
                pts.append(dict(pts[0]))
            if bbox is None:
                bbox = _bbox_from_points(pts)
            return {
                "id": handle,
                "type": "POLYLINE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"vertices": pts, "closed": True},
                "style": style_obj,
                "bbox": bbox,
            }

        if et in ("acdbxline", "acdbray"):
            start = origin_pt or start_pt
            direction_pt = None
            if isinstance(u_axis_pt, dict):
                direction_pt = {
                    "x": float(start["x"]) + float(u_axis_pt.get("x", 0.0)),
                    "y": float(start["y"]) + float(u_axis_pt.get("y", 0.0)),
                    "z": float(start.get("z", 0.0)),
                } if isinstance(start, dict) else None
            if not isinstance(start, dict):
                return None
            if not isinstance(direction_pt, dict):
                direction_pt = end_pt
            if not isinstance(direction_pt, dict):
                return None
            dx = float(direction_pt["x"]) - float(start["x"])
            dy = float(direction_pt["y"]) - float(start["y"])
            dn = math.hypot(dx, dy)
            if dn <= 1e-9:
                return None
            dx /= dn
            dy /= dn
            span = 20000.0
            if bbox and isinstance(bbox.get("min"), dict) and isinstance(bbox.get("max"), dict):
                bx = abs(float(bbox["max"]["x"]) - float(bbox["min"]["x"]))
                by = abs(float(bbox["max"]["y"]) - float(bbox["min"]["y"]))
                span = max(span, math.hypot(bx, by) * 2.0)
            if et == "acdbxline":
                p1 = {"x": float(start["x"]) - dx * span, "y": float(start["y"]) - dy * span, "z": float(start.get("z", 0.0))}
                p2 = {"x": float(start["x"]) + dx * span, "y": float(start["y"]) + dy * span, "z": float(start.get("z", 0.0))}
            else:
                p1 = dict(start)
                p2 = {"x": float(start["x"]) + dx * span, "y": float(start["y"]) + dy * span, "z": float(start.get("z", 0.0))}
            if bbox is None:
                bbox = _bbox_from_points([p1, p2])
            return {
                "id": handle,
                "type": "LINE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"start": p1, "end": p2, "source_type": et.upper()},
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbellipse":
            if center_pt is None:
                return None

            if major_radius is None and isinstance(major_axis_vec, dict):
                major_radius = math.hypot(float(major_axis_vec.get("x", 0.0)), float(major_axis_vec.get("y", 0.0)))
            if minor_radius is None and isinstance(minor_axis_vec, dict):
                minor_radius = math.hypot(float(minor_axis_vec.get("x", 0.0)), float(minor_axis_vec.get("y", 0.0)))
            if major_radius is None:
                major_radius = radius
            if major_radius is None or major_radius <= 0:
                return None
            if minor_radius is None or minor_radius <= 0:
                minor_radius = major_radius

            if rotation_deg is None and isinstance(major_axis_vec, dict):
                rotation_deg = math.degrees(math.atan2(float(major_axis_vec.get("y", 0.0)), float(major_axis_vec.get("x", 0.0))))
            rotation = float(rotation_deg or 0.0)

            if bbox is None:
                rx = abs(float(major_radius))
                ry = abs(float(minor_radius))
                bbox = {
                    "min": {"x": center_pt["x"] - rx, "y": center_pt["y"] - ry, "z": center_pt.get("z", 0.0)},
                    "max": {"x": center_pt["x"] + rx, "y": center_pt["y"] + ry, "z": center_pt.get("z", 0.0)},
                }

            geom_ellipse: Dict[str, object] = {
                "center": center_pt,
                "rx": float(major_radius),
                "ry": float(minor_radius),
                "rotation": rotation,
            }
            if isinstance(start_angle, (int, float)):
                geom_ellipse["start_angle"] = float(start_angle)
            if isinstance(end_angle, (int, float)):
                geom_ellipse["end_angle"] = float(end_angle)
            if isinstance(start_pt, dict):
                geom_ellipse["start"] = start_pt
            if isinstance(end_pt, dict):
                geom_ellipse["end"] = end_pt
            if isinstance(major_axis_vec, dict):
                geom_ellipse["major_axis"] = major_axis_vec
            if isinstance(minor_axis_vec, dict):
                geom_ellipse["minor_axis"] = minor_axis_vec

            return {
                "id": handle,
                "type": "ELLIPSE",
                "layer": layer,
                "space_id": space_id,
                "geom": geom_ellipse,
                "style": style_obj,
                "bbox": bbox,
            }

        if et == "acdbspline":
            points = list(spline_points)
            if len(points) < 2:
                if isinstance(start_pt, dict):
                    points.append(start_pt)
                if isinstance(end_pt, dict):
                    points.append(end_pt)
            if len(points) < 2:
                return None
            if bbox is None:
                bbox = _bbox_from_points(points)
            return {
                "id": handle,
                "type": "SPLINE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"points": points},
                "style": style_obj,
                "bbox": bbox,
            }

        return None

    def _insert_transform_from_entity(self, ent: Dict[str, object]) -> Affine2D:
        geom = ent.get("geom", {}) if isinstance(ent.get("geom"), dict) else {}
        pos = geom.get("position") if isinstance(geom.get("position"), dict) else {"x": 0.0, "y": 0.0, "z": 0.0}
        scale = geom.get("scale") if isinstance(geom.get("scale"), dict) else {}
        sx = float(scale.get("x", 1.0))
        sy = float(scale.get("y", 1.0))
        rot_deg = float(geom.get("rotation", 0.0))
        rad = math.radians(rot_deg)
        cos_r = math.cos(rad)
        sin_r = math.sin(rad)
        tx = float(pos.get("x", 0.0))
        ty = float(pos.get("y", 0.0))
        return (cos_r * sx, -sin_r * sy, sin_r * sx, cos_r * sy, tx, ty)

    def _extract_layer_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        layer_styles: Dict[str, Dict[str, object]] = {}
        current_name: Optional[str] = None
        current_color_index: Optional[int] = None
        current_color_name: Optional[str] = None
        current_lineweight_raw: Optional[str] = None
        in_record = False

        def finalize_record() -> None:
            nonlocal current_name, current_color_index, current_color_name, current_lineweight_raw
            if current_name:
                obj: Dict[str, object] = {}
                if current_color_index is not None:
                    obj["color_index"] = current_color_index
                if current_color_name:
                    obj["color"] = current_color_name
                if current_lineweight_raw:
                    obj["lineweight"] = current_lineweight_raw
                lineweight_mm = _lineweight_to_mm(current_lineweight_raw)
                if isinstance(lineweight_mm, float) and math.isfinite(lineweight_mm) and lineweight_mm > 0:
                    obj["lineweight_mm"] = lineweight_mm
                layer_styles[current_name] = obj
            current_name = None
            current_color_index = None
            current_color_name = None
            current_lineweight_raw = None

        for raw in dump_text.splitlines():
            stripped = raw.strip()
            if stripped == "<AcDbLayerTableRecord>":
                if in_record:
                    finalize_record()
                in_record = True
                continue

            if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbLayerTableRecord>":
                finalize_record()
                in_record = False
                continue

            if not in_record:
                continue

            label, value = _parse_label_value(raw)
            if not label or value is None:
                continue
            if label == "name" and current_name is None:
                current_name = value
                continue
            if label == "color index":
                try:
                    current_color_index = int(value)
                except Exception:
                    current_color_index = None
                continue
            if label == "color":
                current_color_name = value
                continue
            if label == "lineweight":
                current_lineweight_raw = value
                continue

        if in_record:
            finalize_record()

        return layer_styles

    def _extract_text_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        text_styles: Dict[str, Dict[str, object]] = {}
        current_name: Optional[str] = None
        current_font_file: Optional[str] = None
        current_bigfont_file: Optional[str] = None
        current_typeface: Optional[str] = None
        current_shape_file = False
        in_record = False

        def finalize_record() -> None:
            nonlocal current_name, current_font_file, current_bigfont_file, current_typeface, current_shape_file
            if current_name:
                font_name = (current_font_file or "").strip()
                if not font_name:
                    font_name = (current_typeface or "").strip()
                if not font_name:
                    font_name = current_name
                bigfont_name = (current_bigfont_file or "").strip() or None
                font_kind = "shx" if current_shape_file else _detect_font_kind(font_name)
                if font_kind == "unknown" and bigfont_name and _detect_font_kind(bigfont_name) == "shx":
                    font_kind = "shx"
                font_family = (current_typeface or "").strip() or _font_family_from_name(font_name)
                text_styles[current_name] = {
                    "style_name": current_name,
                    "font_name": font_name,
                    "bigfont_name": bigfont_name,
                    "font_family": font_family,
                    "font_kind": font_kind,
                    "shape_file": bool(current_shape_file),
                }
            current_name = None
            current_font_file = None
            current_bigfont_file = None
            current_typeface = None
            current_shape_file = False

        for raw in dump_text.splitlines():
            stripped = raw.strip()
            if stripped == "<AcDbTextStyleTableRecord>":
                if in_record:
                    finalize_record()
                in_record = True
                continue

            if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbTextStyleTableRecord>":
                finalize_record()
                in_record = False
                continue

            if not in_record:
                continue

            label, value = _parse_label_value(raw)
            if not label or value is None:
                continue
            if label == "name" and current_name is None:
                current_name = value
                continue
            if label in ("file", "file name", "filename", "font", "font name", "font file", "primary file", "primary font file"):
                current_font_file = value
                continue
            if label in (
                "bigfont",
                "bigfont file",
                "bigfont file name",
                "bigfont filename",
                "big font file",
                "big font",
            ):
                current_bigfont_file = value
                continue
            if label == "typeface":
                current_typeface = value
                continue
            if label == "shape file":
                current_shape_file = str(value).strip().lower() == "true"
                continue

        if in_record:
            finalize_record()
        return text_styles

    def _extract_header_dim_defaults(self, dump_text: str) -> Dict[str, object]:
        defaults: Dict[str, object] = {}
        for raw in dump_text.splitlines():
            stripped = raw.strip()
            if stripped.startswith("<AcDb"):
                break
            label, value = _parse_label_value(raw)
            if not label or value is None:
                continue
            if label in ("dimblk", "dimblk1", "dimblk2", "dimldrblk"):
                v = _normalize_dimblk_name(value)
                if v:
                    defaults[label] = v
                continue
            if label in ("dimasz", "dimtsz"):
                n = _parse_float_value(value)
                if isinstance(n, float) and math.isfinite(n) and n > 0:
                    defaults[label] = float(n)
                continue
        return defaults

    def _extract_dim_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        styles: Dict[str, Dict[str, object]] = {}
        current_name: Optional[str] = None
        current_dimblk: Optional[str] = None
        current_dimblk1: Optional[str] = None
        current_dimblk2: Optional[str] = None
        current_dimldrblk: Optional[str] = None
        current_dimasz: Optional[float] = None
        current_dimtsz: Optional[float] = None
        in_record = False

        def finalize_record() -> None:
            nonlocal current_name, current_dimblk, current_dimblk1, current_dimblk2, current_dimldrblk, current_dimasz, current_dimtsz
            if current_name:
                rec: Dict[str, object] = {}
                if current_dimblk:
                    rec["dimblk"] = current_dimblk
                if current_dimblk1:
                    rec["dimblk1"] = current_dimblk1
                if current_dimblk2:
                    rec["dimblk2"] = current_dimblk2
                if current_dimldrblk:
                    rec["dimldrblk"] = current_dimldrblk
                if isinstance(current_dimasz, float) and math.isfinite(current_dimasz) and current_dimasz > 0:
                    rec["dimasz"] = current_dimasz
                if isinstance(current_dimtsz, float) and math.isfinite(current_dimtsz) and current_dimtsz > 0:
                    rec["dimtsz"] = current_dimtsz
                styles[current_name] = rec
            current_name = None
            current_dimblk = None
            current_dimblk1 = None
            current_dimblk2 = None
            current_dimldrblk = None
            current_dimasz = None
            current_dimtsz = None

        for raw in dump_text.splitlines():
            stripped = raw.strip()
            if stripped == "<AcDbDimStyleTableRecord>":
                if in_record:
                    finalize_record()
                in_record = True
                continue

            if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbDimStyleTableRecord>":
                finalize_record()
                in_record = False
                continue

            if not in_record:
                continue

            label, value = _parse_label_value(raw)
            if not label or value is None:
                continue
            if label == "name" and current_name is None:
                current_name = value
                continue
            if label == "dimblk":
                current_dimblk = _normalize_dimblk_name(value)
                continue
            if label == "dimblk1":
                current_dimblk1 = _normalize_dimblk_name(value)
                continue
            if label == "dimblk2":
                current_dimblk2 = _normalize_dimblk_name(value)
                continue
            if label == "dimldrblk":
                current_dimldrblk = _normalize_dimblk_name(value)
                continue
            if label == "dimasz":
                current_dimasz = _parse_float_value(value)
                continue
            if label == "dimtsz":
                current_dimtsz = _parse_float_value(value)
                continue

        if in_record:
            finalize_record()
        return styles

    def _attach_text_font_meta(self, ent: Dict[str, object], text_styles: Dict[str, Dict[str, object]]) -> Dict[str, object]:
        if str(ent.get("type", "")).upper() != "TEXT":
            return ent
        geom = ent.get("geom")
        if not isinstance(geom, dict):
            return ent
        style_obj = ent.get("style", {}) if isinstance(ent.get("style"), dict) else {}
        style_name = str(geom.get("style_name") or style_obj.get("text_style") or "").strip()
        style_rec = text_styles.get(style_name) if style_name else None

        font_name = str((style_rec or {}).get("font_name") or style_name or "").strip()
        font_family = str((style_rec or {}).get("font_family") or _font_family_from_name(font_name) or "").strip()
        font_kind = str((style_rec or {}).get("font_kind") or _detect_font_kind(font_name) or "unknown").strip().lower() or "unknown"
        if bool((style_rec or {}).get("shape_file", False)):
            font_kind = "shx"
        font_source = "text_style_table" if style_rec else ("entity_style_name" if style_name else "fallback")
        font_key_seed = style_name or font_name or font_family or "default"
        font_key = _sanitize_font_key(font_key_seed)

        geom_out = dict(geom)
        geom_out["font_key"] = font_key
        geom_out["font_style_name"] = style_name or None
        geom_out["font_name"] = font_name or None
        geom_out["font_family"] = font_family or None
        geom_out["font_kind"] = font_kind
        geom_out["font_source"] = font_source
        geom_out["shape_file"] = bool((style_rec or {}).get("shape_file", False))

        out = dict(ent)
        out["geom"] = geom_out
        return out

    def _layer_default_color_index(
        self,
        layer_name: str,
        layer_styles: Dict[str, Dict[str, object]],
    ) -> int:
        style = layer_styles.get(layer_name, {})
        idx_raw = style.get("color_index")
        if isinstance(idx_raw, (int, float)) and math.isfinite(float(idx_raw)):
            return int(idx_raw)
        parsed = _parse_aci_from_color_name(style.get("color"))
        if parsed is not None:
            return parsed
        return 7

    def _layer_default_lineweight_mm(
        self,
        layer_name: str,
        layer_styles: Dict[str, Dict[str, object]],
    ) -> float:
        style = layer_styles.get(layer_name, {})
        raw_mm = style.get("lineweight_mm")
        if isinstance(raw_mm, (int, float)) and math.isfinite(float(raw_mm)) and float(raw_mm) > 0:
            return float(raw_mm)
        raw = style.get("lineweight")
        lw_mm = _lineweight_to_mm(raw)
        if isinstance(lw_mm, float) and math.isfinite(lw_mm) and lw_mm > 0:
            return lw_mm
        return self.default_lineweight_mm

    def _resolve_effective_style(
        self,
        style_obj: Dict[str, object],
        layer_name: str,
        layer_styles: Dict[str, Dict[str, object]],
        parent_effective_color_index: Optional[int],
        parent_effective_lineweight_mm: Optional[float],
    ) -> Dict[str, object]:
        out = dict(style_obj)
        local_idx: Optional[int] = None
        raw_idx = out.get("color_index")
        if isinstance(raw_idx, (int, float)) and math.isfinite(float(raw_idx)):
            local_idx = int(raw_idx)
        if local_idx is None:
            local_idx = _parse_aci_from_color_name(out.get("color"))
        if local_idx is None:
            local_idx = 256

        source = "entity"
        if local_idx == 0:
            if parent_effective_color_index is not None:
                effective_idx = int(parent_effective_color_index)
                source = "byblock(parent)"
            else:
                effective_idx = self._layer_default_color_index(layer_name, layer_styles)
                source = "byblock(layer-fallback)"
        elif local_idx == 256:
            effective_idx = self._layer_default_color_index(layer_name, layer_styles)
            source = "bylayer"
        else:
            effective_idx = int(local_idx)
            source = "entity"

        out["effective_color_index"] = effective_idx
        out["effective_color"] = f"ACI {effective_idx}"
        out["effective_color_source"] = source

        raw_lw = str(out.get("lineweight", "") or "").strip()
        lw_token = raw_lw.lower()
        explicit_lw_mm = _lineweight_to_mm(raw_lw)
        lw_source = "entity"
        if lw_token in ("", "default", "klnwtbylwdefault"):
            effective_lw_mm = self.default_lineweight_mm
            lw_source = "default"
        elif lw_token in ("bylayer", "klnwtbylayer"):
            effective_lw_mm = self._layer_default_lineweight_mm(layer_name, layer_styles)
            lw_source = "bylayer"
        elif lw_token in ("byblock", "klnwtbyblock"):
            if isinstance(parent_effective_lineweight_mm, (int, float)) and math.isfinite(float(parent_effective_lineweight_mm)) and float(parent_effective_lineweight_mm) > 0:
                effective_lw_mm = float(parent_effective_lineweight_mm)
                lw_source = "byblock(parent)"
            else:
                effective_lw_mm = self._layer_default_lineweight_mm(layer_name, layer_styles)
                lw_source = "byblock(layer-fallback)"
        elif isinstance(explicit_lw_mm, float) and math.isfinite(explicit_lw_mm) and explicit_lw_mm > 0:
            effective_lw_mm = explicit_lw_mm
            lw_source = "entity"
        else:
            effective_lw_mm = self.default_lineweight_mm
            lw_source = "default"

        out["effective_lineweight_mm"] = float(effective_lw_mm)
        out["effective_lineweight_source"] = lw_source
        return out

    def _transform_entity(self, ent: Dict[str, object], tf: Affine2D) -> Optional[Dict[str, object]]:
        et = str(ent.get("type", "")).upper()
        geom = ent.get("geom", {}) if isinstance(ent.get("geom"), dict) else {}

        transformed = {
            "id": ent.get("id"),
            "type": ent.get("type"),
            "layer": ent.get("layer", "0"),
            "space_id": ent.get("space_id", "model"),
            "geom": {},
            "style": ent.get("style", {"lineweight": "default"}),
            "bbox": None,
        }

        if et == "LINE":
            start = geom.get("start")
            end = geom.get("end")
            if not isinstance(start, dict) or not isinstance(end, dict):
                return None
            t_start = _apply_affine(tf, start)
            t_end = _apply_affine(tf, end)
            transformed["geom"] = {"start": t_start, "end": t_end}
            transformed["bbox"] = _bbox_from_points([t_start, t_end])
            return transformed

        if et == "POLYLINE":
            vertices_raw = geom.get("vertices")
            if not isinstance(vertices_raw, list):
                return None
            vertices = [_apply_affine(tf, v) for v in vertices_raw if isinstance(v, dict)]
            if len(vertices) < 2:
                return None
            transformed_geom: Dict[str, object] = {"vertices": vertices, "closed": bool(geom.get("closed", False))}
            sx, sy = _affine_scales(tf)
            scale_avg = max(1e-9, (abs(sx) + abs(sy)) * 0.5)
            start_w = geom.get("start_width")
            end_w = geom.get("end_width")
            global_w = geom.get("global_width")
            if isinstance(start_w, (int, float)) and math.isfinite(float(start_w)) and float(start_w) > 0:
                transformed_geom["start_width"] = float(start_w) * scale_avg
            if isinstance(end_w, (int, float)) and math.isfinite(float(end_w)) and float(end_w) > 0:
                transformed_geom["end_width"] = float(end_w) * scale_avg
            if isinstance(global_w, (int, float)) and math.isfinite(float(global_w)) and float(global_w) > 0:
                transformed_geom["global_width"] = float(global_w) * scale_avg
            transformed["geom"] = transformed_geom
            transformed["bbox"] = _bbox_from_points(vertices)
            return transformed

        if et == "CIRCLE":
            center = geom.get("center")
            radius = geom.get("radius")
            if not isinstance(center, dict) or not isinstance(radius, (int, float)):
                return None
            t_center = _apply_affine(tf, center)
            sx, sy = _affine_scales(tf)
            t_radius = float(radius) * (abs(sx) + abs(sy)) * 0.5
            if t_radius <= 0:
                return None
            transformed["geom"] = {"center": t_center, "radius": t_radius}
            transformed["bbox"] = {
                "min": {"x": t_center["x"] - t_radius, "y": t_center["y"] - t_radius, "z": t_center.get("z", 0.0)},
                "max": {"x": t_center["x"] + t_radius, "y": t_center["y"] + t_radius, "z": t_center.get("z", 0.0)},
            }
            return transformed

        if et == "ARC":
            center = geom.get("center")
            if not isinstance(center, dict):
                return None
            t_center = _apply_affine(tf, center)
            sx, sy = _affine_scales(tf)
            scale_avg = (abs(sx) + abs(sy)) * 0.5
            if scale_avg <= 1e-12:
                return None

            start_raw = geom.get("start")
            end_raw = geom.get("end")
            radius = geom.get("radius")
            start_angle = geom.get("start_angle")
            end_angle = geom.get("end_angle")

            if (not isinstance(start_raw, dict) or not isinstance(end_raw, dict)) and isinstance(radius, (int, float)):
                if isinstance(start_angle, (int, float)):
                    start_raw = {
                        "x": float(center["x"]) + float(radius) * math.cos(math.radians(float(start_angle))),
                        "y": float(center["y"]) + float(radius) * math.sin(math.radians(float(start_angle))),
                        "z": float(center.get("z", 0.0)),
                    }
                if isinstance(end_angle, (int, float)):
                    end_raw = {
                        "x": float(center["x"]) + float(radius) * math.cos(math.radians(float(end_angle))),
                        "y": float(center["y"]) + float(radius) * math.sin(math.radians(float(end_angle))),
                        "z": float(center.get("z", 0.0)),
                    }

            if not isinstance(start_raw, dict) or not isinstance(end_raw, dict):
                return None

            t_start = _apply_affine(tf, start_raw)
            t_end = _apply_affine(tf, end_raw)
            t_radius = (
                float(radius) * scale_avg
                if isinstance(radius, (int, float))
                else max(1e-9, _point_distance(t_center, t_start))
            )
            s_angle = _point_angle_from_center(t_center, t_start)
            e_angle = _point_angle_from_center(t_center, t_end)
            transformed["geom"] = {
                "center": t_center,
                "radius": t_radius,
                "start": t_start,
                "end": t_end,
                "start_angle": s_angle,
                "end_angle": e_angle,
            }
            # Prefer ODA-provided entity extents (affine-mapped) to avoid over-inflated
            # arc bounds when center is far from the visible arc chord.
            transformed["bbox"] = _apply_bbox_affine(tf, ent.get("bbox"))
            if transformed["bbox"] is None:
                transformed["bbox"] = _bbox_from_points([t_start, t_end, t_center])
            return transformed

        if et == "TEXT":
            pos = geom.get("position")
            text = str(geom.get("text", ""))
            if not isinstance(pos, dict):
                return None
            t_pos = _apply_affine(tf, pos)
            sx, sy = _affine_scales(tf)
            scale_avg = max(1e-9, (abs(sx) + abs(sy)) * 0.5)
            local_rot = float(geom.get("rotation", 0.0))
            tf_rot = math.degrees(math.atan2(tf[2], tf[0]))
            t_height = max(1e-9, float(geom.get("height", 100.0)) * scale_avg)
            t_width = float(geom.get("width", 0.0)) * scale_avg
            transformed["geom"] = {
                "text": text,
                "position": t_pos,
                "height": t_height,
                "rotation": local_rot + tf_rot,
                "width": t_width,
                "width_factor": float(geom.get("width_factor", 1.0)),
                "is_mtext": bool(geom.get("is_mtext", False)),
                "style_name": geom.get("style_name"),
                "horizontal_mode": geom.get("horizontal_mode"),
                "vertical_mode": geom.get("vertical_mode"),
                "attachment": geom.get("attachment"),
                "oblique": float(geom.get("oblique", 0.0)),
                "actual_height": float(geom.get("actual_height", t_height)),
                "mirrored_x": bool(geom.get("mirrored_x", False)),
                "mirrored_y": bool(geom.get("mirrored_y", False)),
                "font_key": geom.get("font_key"),
                "font_style_name": geom.get("font_style_name"),
                "font_name": geom.get("font_name"),
                "font_family": geom.get("font_family"),
                "font_kind": geom.get("font_kind"),
                "font_source": geom.get("font_source"),
            }
            transformed["bbox"] = _apply_bbox_affine(tf, ent.get("bbox"))
            if transformed["bbox"] is None:
                est_w = t_width if t_width > 0 else max(t_height * 0.5, len(text) * t_height * 0.55)
                transformed["bbox"] = {
                    "min": {"x": t_pos["x"], "y": t_pos["y"] - t_height, "z": t_pos.get("z", 0.0)},
                    "max": {"x": t_pos["x"] + est_w, "y": t_pos["y"], "z": t_pos.get("z", 0.0)},
                }
            return transformed

        if et == "POINT":
            pos = geom.get("position")
            if not isinstance(pos, dict):
                return None
            t_pos = _apply_affine(tf, pos)
            transformed["geom"] = {
                "position": t_pos,
                "display_size": float(geom.get("display_size", 6.0)),
            }
            transformed["bbox"] = {"min": dict(t_pos), "max": dict(t_pos)}
            return transformed

        if et == "HATCH":
            loops_raw = geom.get("loops")
            if not isinstance(loops_raw, list):
                return None
            loops: List[Dict[str, object]] = []
            all_points: List[Dict[str, float]] = []
            for loop in loops_raw:
                if not isinstance(loop, dict):
                    continue
                points_raw = loop.get("points")
                if not isinstance(points_raw, list):
                    continue
                points = [_apply_affine(tf, p) for p in points_raw if isinstance(p, dict)]
                if len(points) < 2:
                    continue
                loops.append(
                    {
                        "kind": loop.get("kind", "kExternal"),
                        "closed": bool(loop.get("closed", True)),
                        "points": points,
                    }
                )
                all_points.extend(points)
            if not loops:
                return None
            transformed["geom"] = {
                "loops": loops,
                "solid_fill": bool(geom.get("solid_fill", False)),
                "pattern_name": geom.get("pattern_name", "SOLID"),
                "pattern_angle": geom.get("pattern_angle"),
                "pattern_scale": geom.get("pattern_scale"),
                "pattern_spacing": geom.get("pattern_spacing"),
            }
            transformed["bbox"] = _bbox_from_points(all_points)
            return transformed

        if et == "DIMENSION":
            ext1 = geom.get("ext1")
            ext2 = geom.get("ext2")
            dim_pt = geom.get("dim_line_point")
            if not isinstance(ext1, dict) or not isinstance(ext2, dict):
                return None
            if not isinstance(dim_pt, dict):
                dim_pt = ext2
            t_ext1 = _apply_affine(tf, ext1)
            t_ext2 = _apply_affine(tf, ext2)
            t_dim_pt = _apply_affine(tf, dim_pt)
            line_start_raw = geom.get("line_start")
            line_end_raw = geom.get("line_end")
            if isinstance(line_start_raw, dict) and isinstance(line_end_raw, dict):
                t_line_start = _apply_affine(tf, line_start_raw)
                t_line_end = _apply_affine(tf, line_end_raw)
            else:
                t_line_start, t_line_end = _dimension_line_endpoints(t_ext1, t_ext2, t_dim_pt)

            text_pos = geom.get("text_position")
            t_text_pos = _apply_affine(tf, text_pos) if isinstance(text_pos, dict) else {
                "x": (t_line_start["x"] + t_line_end["x"]) * 0.5,
                "y": (t_line_start["y"] + t_line_end["y"]) * 0.5,
                "z": 0.0,
            }
            sx, sy = _affine_scales(tf)
            scale_avg = max(1e-9, (abs(sx) + abs(sy)) * 0.5)
            local_rot = float(geom.get("rotation", 0.0))
            tf_rot = math.degrees(math.atan2(tf[2], tf[0]))
            measurement_raw = geom.get("measurement")
            measurement = float(measurement_raw) * scale_avg if isinstance(measurement_raw, (int, float)) else _point_distance(t_ext1, t_ext2)
            transformed["geom"] = {
                "ext1": t_ext1,
                "ext2": t_ext2,
                "dim_line_point": t_dim_pt,
                "line_start": t_line_start,
                "line_end": t_line_end,
                "text_position": t_text_pos,
                "text": str(geom.get("text", "")),
                "measurement": measurement,
                "rotation": local_rot + tf_rot,
                "dim_kind": geom.get("dim_kind", "aligned"),
                "dimension_style": geom.get("dimension_style"),
                "arrow_block": geom.get("arrow_block"),
                "arrow_block1": geom.get("arrow_block1"),
                "arrow_block2": geom.get("arrow_block2"),
                "arrow_size": geom.get("arrow_size"),
            }
            transformed["bbox"] = _apply_bbox_affine(tf, ent.get("bbox"))
            if transformed["bbox"] is None:
                transformed["bbox"] = _bbox_from_points([t_ext1, t_ext2, t_line_start, t_line_end, t_text_pos])
            return transformed

        if et == "LEADER":
            points_raw = geom.get("points")
            if not isinstance(points_raw, list):
                return None
            points = [_apply_affine(tf, p) for p in points_raw if isinstance(p, dict)]
            if len(points) < 2:
                return None
            transformed["geom"] = {
                "points": points,
                "has_arrowhead": bool(geom.get("has_arrowhead", False)),
                "splined": bool(geom.get("splined", False)),
                "arrow_block": geom.get("arrow_block"),
                "arrow_size": geom.get("arrow_size"),
            }
            transformed["bbox"] = _bbox_from_points(points)
            return transformed

        if et == "WIPEOUT":
            vertices_raw = geom.get("vertices")
            if not isinstance(vertices_raw, list):
                return None
            vertices = [_apply_affine(tf, p) for p in vertices_raw if isinstance(p, dict)]
            if len(vertices) < 3:
                return None
            transformed["geom"] = {"vertices": vertices, "closed": bool(geom.get("closed", True))}
            transformed["bbox"] = _bbox_from_points(vertices)
            return transformed

        if et == "ELLIPSE":
            center = geom.get("center")
            if not isinstance(center, dict):
                return None
            t_center = _apply_affine(tf, center)
            major_axis = geom.get("major_axis")
            minor_axis = geom.get("minor_axis")

            if not isinstance(major_axis, dict):
                rx = float(geom.get("rx", 0.0))
                rot = math.radians(float(geom.get("rotation", 0.0)))
                major_axis = {"x": rx * math.cos(rot), "y": rx * math.sin(rot), "z": 0.0}
            if not isinstance(minor_axis, dict):
                ry = float(geom.get("ry", 0.0))
                rot = math.radians(float(geom.get("rotation", 0.0)))
                minor_axis = {"x": -ry * math.sin(rot), "y": ry * math.cos(rot), "z": 0.0}

            t_major_axis = _apply_linear(tf, major_axis)
            t_minor_axis = _apply_linear(tf, minor_axis)
            t_rx = math.hypot(float(t_major_axis["x"]), float(t_major_axis["y"]))
            t_ry = math.hypot(float(t_minor_axis["x"]), float(t_minor_axis["y"]))
            if t_rx <= 1e-12 or t_ry <= 1e-12:
                return None
            t_rot = math.degrees(math.atan2(float(t_major_axis["y"]), float(t_major_axis["x"])))

            transformed["geom"] = {
                "center": t_center,
                "rx": t_rx,
                "ry": t_ry,
                "rotation": t_rot,
                "start_angle": float(geom.get("start_angle", 0.0)),
                "end_angle": float(geom.get("end_angle", 360.0)),
            }
            if isinstance(geom.get("start"), dict):
                transformed["geom"]["start"] = _apply_affine(tf, geom.get("start"))  # type: ignore[arg-type]
            if isinstance(geom.get("end"), dict):
                transformed["geom"]["end"] = _apply_affine(tf, geom.get("end"))  # type: ignore[arg-type]
            transformed["bbox"] = _apply_bbox_affine(tf, ent.get("bbox"))
            if transformed["bbox"] is None:
                transformed["bbox"] = {
                    "min": {"x": t_center["x"] - t_rx, "y": t_center["y"] - t_ry, "z": t_center.get("z", 0.0)},
                    "max": {"x": t_center["x"] + t_rx, "y": t_center["y"] + t_ry, "z": t_center.get("z", 0.0)},
                }
            return transformed

        if et == "SPLINE":
            points_raw = geom.get("points")
            if not isinstance(points_raw, list):
                return None
            points = [_apply_affine(tf, p) for p in points_raw if isinstance(p, dict)]
            if len(points) < 2:
                return None
            transformed["geom"] = {"points": points}
            transformed["bbox"] = _bbox_from_points(points)
            return transformed

        return None

    def _parse_oda_dump(
        self,
        dump_text: str,
    ) -> Tuple[
        List[Dict[str, object]],
        Dict[str, List[Dict[str, object]]],
        Dict[str, List[Dict[str, object]]],
        List[str],
        Dict[str, Dict[str, object]],
    ]:
        spaces_by_id: Dict[str, Dict[str, object]] = {}
        entities_by_space: Dict[str, List[Dict[str, object]]] = {}
        block_refs_by_space: Dict[str, List[Dict[str, object]]] = {}
        warnings: List[str] = []
        layer_styles = self._extract_layer_styles(dump_text)
        text_styles = self._extract_text_styles(dump_text)
        dim_styles = self._extract_dim_styles(dump_text)
        header_dim_defaults = self._extract_header_dim_defaults(dump_text)

        current_block_name: Optional[str] = None
        current_block_layout = False
        current_block_origin: Optional[Dict[str, float]] = None
        current_block_entities: List[Dict[str, object]] = []
        current_entity: Optional[Dict[str, object]] = None

        block_order: List[str] = []
        block_is_layout: Dict[str, bool] = {}
        block_entities: Dict[str, List[Dict[str, object]]] = {}
        block_origin_by_name: Dict[str, Dict[str, float]] = {}

        unresolved_insert_names: set[str] = set()
        cyclic_insert_names: set[str] = set()
        capped_spaces: set[str] = set()
        max_expand_depth = max(8, int(os.environ.get("DWG_BLOCK_EXPAND_MAX_DEPTH", "16")))

        def finalize_entity() -> None:
            nonlocal current_entity
            if not current_entity:
                current_entity = None
                return

            ent = self._build_entity_from_oda(
                etype=str(current_entity["etype"]),
                handle=str(current_entity["handle"]),
                lines=list(current_entity["lines"]),
                space_id="block",
                dim_styles=dim_styles,
                header_dim_defaults=header_dim_defaults,
            )
            if ent is not None:
                current_block_entities.append(self._attach_text_font_meta(ent, text_styles))
            current_entity = None

        def finalize_block() -> None:
            nonlocal current_block_name, current_block_layout, current_block_entities, current_block_origin
            if current_block_name:
                name = current_block_name
                if name not in block_is_layout:
                    block_order.append(name)
                block_is_layout[name] = bool(current_block_layout)
                block_entities[name] = list(current_block_entities)
                block_origin_by_name[name] = dict(current_block_origin) if isinstance(current_block_origin, dict) else {"x": 0.0, "y": 0.0, "z": 0.0}
            current_block_name = None
            current_block_layout = False
            current_block_origin = None
            current_block_entities = []

        for raw in dump_text.splitlines():
            line = raw.rstrip("\r\n")
            stripped = line.strip()

            if stripped == "<AcDbBlockTableRecord>":
                finalize_entity()
                finalize_block()
                continue

            ent_m = _ENTITY_START_RE.match(line)
            if ent_m:
                finalize_entity()
                current_entity = {
                    "etype": ent_m.group("etype"),
                    "handle": ent_m.group("handle"),
                    "lines": [],
                }
                continue

            if current_entity is not None:
                current_entity["lines"].append(line)
                continue

            label, value = _parse_label_value(line)
            if label == "name" and value:
                current_block_name = value
                continue
            if label == "layout" and value:
                current_block_layout = value.lower() == "true"
                continue
            if label == "origin" and value:
                origin = _parse_point_value(value)
                if origin is not None:
                    current_block_origin = origin
                continue

        finalize_entity()
        finalize_block()

        layout_blocks_in_order = [name for name in block_order if block_is_layout.get(name, False)]
        model_block_name: Optional[str] = None
        for name in block_order:
            if name.strip().upper() == "*MODEL_SPACE":
                model_block_name = name
                break
        if model_block_name is None:
            for name in layout_blocks_in_order:
                if not name.strip().upper().startswith("*PAPER_SPACE"):
                    model_block_name = name
                    break
        if model_block_name is None and layout_blocks_in_order:
            model_block_name = layout_blocks_in_order[0]

        root_blocks: List[str] = []
        if model_block_name and model_block_name in block_entities:
            root_blocks.append(model_block_name)
        for name in layout_blocks_in_order:
            if name == model_block_name:
                continue
            root_blocks.append(name)
        if not root_blocks and model_block_name:
            root_blocks.append(model_block_name)
        if not root_blocks and block_order:
            root_blocks.append(block_order[0])

        def space_id_for_layout_block(name: str) -> str:
            if model_block_name and name == model_block_name:
                if "model" not in spaces_by_id:
                    spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}
                return "model"
            sid, display_name, kind = _space_from_block_name(name)
            if sid == "model":
                sid = f"layout:{name}"
                kind = "layout"
                display_name = name.lstrip("*") or "Layout"
            if sid not in spaces_by_id:
                spaces_by_id[sid] = {"id": sid, "display_name": display_name, "kind": kind}
            return sid

        def append_space_entity(space_id: str, ent: Dict[str, object]) -> None:
            bucket = entities_by_space.setdefault(space_id, [])
            if len(bucket) < self.max_entities_per_space:
                ent_copy = dict(ent)
                ent_copy["space_id"] = space_id
                bucket.append(ent_copy)
            elif space_id not in capped_spaces:
                capped_spaces.add(space_id)
                warnings.append(
                    f"Entity cap reached for {space_id}: only first {self.max_entities_per_space} entities loaded."
                )

        def append_block_ref(space_id: str, block_ref: Dict[str, object]) -> None:
            bucket = block_refs_by_space.setdefault(space_id, [])
            bucket.append(block_ref)

        def build_block_ref_entity(
            raw_insert: Dict[str, object],
            parent_tf: Affine2D,
            path_with_self: Tuple[str, ...],
            parent_block_id: Optional[str],
            effective_style: Dict[str, object],
            space_id: str,
        ) -> Optional[Dict[str, object]]:
            insert_geom = raw_insert.get("geom", {}) if isinstance(raw_insert.get("geom"), dict) else {}
            block_name = str(insert_geom.get("block_name", "")).strip()
            if not block_name:
                return None
            position = insert_geom.get("position")
            if not isinstance(position, dict):
                position = {"x": 0.0, "y": 0.0, "z": 0.0}

            insert_tf = self._insert_transform_from_entity(raw_insert)
            world_insert_tf = _compose_affine(parent_tf, insert_tf)
            world_pos = _apply_affine(parent_tf, position)
            sx, sy = _affine_scales(world_insert_tf)
            rotation_deg = math.degrees(math.atan2(world_insert_tf[2], world_insert_tf[0]))
            raw_scale = insert_geom.get("scale") if isinstance(insert_geom.get("scale"), dict) else {}
            scale_z = float(raw_scale.get("z", 1.0))

            block_ref_id = _block_ref_id_from_instance_path(path_with_self)
            if not block_ref_id:
                return None

            bbox = _apply_bbox_affine(parent_tf, raw_insert.get("bbox"))
            if bbox is None:
                bbox = {"min": dict(world_pos), "max": dict(world_pos)}

            insert_handle = str(raw_insert.get("id", "")).strip() or path_with_self[-1]
            return {
                "id": block_ref_id,
                "type": "BLOCK_REF",
                "handle": insert_handle,
                "layer": str(raw_insert.get("layer", "0")),
                "space_id": space_id,
                "parent_block_id": parent_block_id,
                "instance_path": list(path_with_self),
                "geom": {
                    "block_name": block_name,
                    "position": world_pos,
                    "rotation": rotation_deg,
                    "scale": {"x": sx, "y": sy, "z": scale_z},
                    "insert_handle": insert_handle,
                    "source_type": "BLOCK_REF",
                },
                "style": effective_style,
                "bbox": bbox,
            }

        def expand_block_into_space(
            space_id: str,
            source_block_name: str,
            tf: Affine2D,
            stack: Tuple[str, ...],
            instance_path: Tuple[str, ...],
            parent_effective_color_index: Optional[int],
            parent_effective_lineweight_mm: Optional[float],
        ) -> None:
            if len(stack) > max_expand_depth:
                warnings.append(
                    f"Block expansion depth exceeded ({max_expand_depth}) for {source_block_name}; deeper references were skipped."
                )
                return

            source_entities = block_entities.get(source_block_name, [])
            for raw_ent in source_entities:
                etype = str(raw_ent.get("type", "")).upper()
                raw_style = raw_ent.get("style", {})
                style_obj = raw_style if isinstance(raw_style, dict) else {"lineweight": "default"}
                raw_layer = str(raw_ent.get("layer", "0"))
                effective_style = self._resolve_effective_style(
                    style_obj=style_obj,
                    layer_name=raw_layer,
                    layer_styles=layer_styles,
                    parent_effective_color_index=parent_effective_color_index,
                    parent_effective_lineweight_mm=parent_effective_lineweight_mm,
                )
                next_parent_color_idx = effective_style.get("effective_color_index")
                if not isinstance(next_parent_color_idx, int):
                    next_parent_color_idx = None
                next_parent_lineweight_mm = effective_style.get("effective_lineweight_mm")
                if not isinstance(next_parent_lineweight_mm, (int, float)) or not math.isfinite(float(next_parent_lineweight_mm)):
                    next_parent_lineweight_mm = None
                elif float(next_parent_lineweight_mm) <= 0:
                    next_parent_lineweight_mm = None
                else:
                    next_parent_lineweight_mm = float(next_parent_lineweight_mm)

                if etype == "INSERT":
                    geom = raw_ent.get("geom", {}) if isinstance(raw_ent.get("geom"), dict) else {}
                    child_name = str(geom.get("block_name", "")).strip()
                    if not child_name:
                        continue
                    if child_name in stack:
                        if child_name not in cyclic_insert_names:
                            cyclic_insert_names.add(child_name)
                            warnings.append(f"Cyclic block reference detected for '{child_name}', skipped recursive expansion.")
                        continue
                    if child_name not in block_entities:
                        if child_name not in unresolved_insert_names:
                            unresolved_insert_names.add(child_name)
                            warnings.append(f"Unresolved block reference '{child_name}', skipped.")
                        continue
                    insert_tf = self._insert_transform_from_entity(raw_ent)
                    insert_id = str(raw_ent.get("id", "insert"))
                    path_with_self = instance_path + (insert_id,)
                    parent_block_id = _block_ref_id_from_instance_path(instance_path)
                    block_ref = build_block_ref_entity(
                        raw_insert=raw_ent,
                        parent_tf=tf,
                        path_with_self=path_with_self,
                        parent_block_id=parent_block_id,
                        effective_style=effective_style,
                        space_id=space_id,
                    )
                    if block_ref is not None:
                        append_block_ref(space_id, block_ref)
                    child_origin = block_origin_by_name.get(child_name, {"x": 0.0, "y": 0.0, "z": 0.0})
                    child_origin_tf: Affine2D = (
                        1.0,
                        0.0,
                        0.0,
                        1.0,
                        -float(child_origin.get("x", 0.0)),
                        -float(child_origin.get("y", 0.0)),
                    )
                    child_tf = _compose_affine(insert_tf, child_origin_tf)
                    nested_tf = _compose_affine(tf, child_tf)
                    expand_block_into_space(
                        space_id,
                        child_name,
                        nested_tf,
                        stack + (child_name,),
                        path_with_self,
                        next_parent_color_idx,
                        next_parent_lineweight_mm,
                    )
                    continue

                transformed = self._transform_entity(raw_ent, tf)
                if transformed is not None:
                    base_id = str(transformed.get("id", ""))
                    if instance_path:
                        transformed["id"] = f"{base_id}@{'/'.join(instance_path)}"
                    transformed["instance_path"] = list(instance_path)
                    transformed["parent_block_id"] = _block_ref_id_from_instance_path(instance_path)
                    transformed["style"] = effective_style
                    append_space_entity(space_id, transformed)

        for block_name in root_blocks:
            sid = space_id_for_layout_block(block_name)
            root_origin = block_origin_by_name.get(block_name, {"x": 0.0, "y": 0.0, "z": 0.0})
            root_tf: Affine2D = (
                1.0,
                0.0,
                0.0,
                1.0,
                -float(root_origin.get("x", 0.0)),
                -float(root_origin.get("y", 0.0)),
            )
            expand_block_into_space(sid, block_name, root_tf, (block_name,), (), None, None)

        if not spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}
        elif "model" not in spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}

        ordered_ids = sorted(spaces_by_id.keys(), key=lambda sid: (0 if sid == "model" else 1, sid))
        spaces = [spaces_by_id[sid] for sid in ordered_ids]
        return spaces, entities_by_space, block_refs_by_space, warnings, text_styles

    def _external_url(self, path: str) -> str:
        if not self.external_base_url:
            raise ExternalCoreError("DWG_CORE_BASE_URL is not configured")
        suffix = path if path.startswith("/") else f"/{path}"
        return f"{self.external_base_url}{self.external_prefix}{suffix}"

    def _external_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.external_auth_bearer:
            headers["Authorization"] = f"Bearer {self.external_auth_bearer}"
        return headers

    def _decode_json_body(self, raw: bytes) -> Dict[str, object]:
        text = (raw or b"").decode("utf-8", errors="replace").strip()
        if not text:
            return {}
        try:
            obj = json.loads(text)
        except Exception as exc:
            raise ExternalCoreError(f"invalid JSON from external DWG core: {exc}", body=text)
        if not isinstance(obj, dict):
            raise ExternalCoreError("external DWG core response must be a JSON object")
        return obj

    def _external_request_json(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, object]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, object]:
        url = self._external_url(path)
        body: Optional[bytes] = None
        headers = self._external_headers()
        if extra_headers:
            headers.update(extra_headers)

        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib_request.Request(url=url, data=body, method=method.upper(), headers=headers)
        try:
            with urllib_request.urlopen(req, timeout=self.external_timeout_sec) as resp:
                return self._decode_json_body(resp.read())
        except urllib_error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            message = f"external DWG core HTTP {exc.code} on {path}"
            raise ExternalCoreError(message, status_code=exc.code, body=body_text)
        except urllib_error.URLError as exc:
            raise ExternalCoreError(f"external DWG core unreachable on {path}: {exc}")

    def _external_open_document(self, file_path: Path, original_name: str) -> Dict[str, object]:
        url = self._external_url("/open")
        boundary = f"----dwgcore{uuid.uuid4().hex}"
        file_bytes = file_path.read_bytes()

        lines: List[bytes] = []
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(
            (
                f'Content-Disposition: form-data; name="file"; filename="{original_name}"\r\n'
                "Content-Type: application/octet-stream\r\n\r\n"
            ).encode("utf-8")
        )
        lines.append(file_bytes)
        lines.append(b"\r\n")
        lines.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(lines)

        headers = self._external_headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        req = urllib_request.Request(url=url, data=body, method="POST", headers=headers)

        try:
            with urllib_request.urlopen(req, timeout=self.external_timeout_sec) as resp:
                return self._decode_json_body(resp.read())
        except urllib_error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            message = f"external DWG core HTTP {exc.code} on /open"
            raise ExternalCoreError(message, status_code=exc.code, body=body_text)
        except urllib_error.URLError as exc:
            raise ExternalCoreError(f"external DWG core unreachable on /open: {exc}")

    def _strip_ok(self, payload: Dict[str, object]) -> Dict[str, object]:
        data = dict(payload)
        data.pop("ok", None)
        return data

    def _external_doc_request(
        self,
        session: DwgDocSession,
        method: str,
        suffix: str,
        payload: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        if not session.remote_doc_id:
            raise ExternalCoreError("missing remote_doc_id in external_http session")
        remote_id = urllib_parse.quote(session.remote_doc_id, safe="")
        data = self._external_request_json(method, f"/{remote_id}{suffix}", payload)
        data = self._strip_ok(data)
        data["doc_id"] = session.doc_id
        return data

    def health(self) -> Dict[str, object]:
        base: Dict[str, object] = {
            "status": "ok",
            "mode": self.mode,
            "parser_revision": DWG_CORE_PARSER_REV,
            "external_base_url": self.external_base_url or None,
            "external_prefix": self.external_prefix or None,
            "oda_read_exe": self.oda_read_exe,
            "oda_runtime_root": self.oda_runtime_root,
            "oda_runtime_in_project": self.oda_runtime_in_project,
            "oda_profile": self.oda_profile,
            "oda_version": self.oda_version,
            "oda_resolve_source": self.oda_resolve_source,
            "session_count": len(self.sessions),
            "supports": {
                "direct_dwg": True,
                "spaces": True,
                "pick": True,
                "snap": True,
                "measure": True,
                "entities": True,
                "fonts": True,
                "shx_outline": self.enable_shx_outline,
                "shx_outline_oda": self._is_oda_vectorize_available(),
                "shx_debug_match": self.enable_shx_debug_match,
            },
            "fonts": {
                "font_dir": str(self.font_dir),
                "font_map_path": str(self.font_map_path),
                "font_map_count": len(self.font_map),
                "font_search_roots": [str(p) for p in self.font_search_roots],
                "shx_fallback_file": str(self.shx_fallback_file),
                "shx_fallback_exists": bool(self.shx_fallback_file.exists() and self.shx_fallback_file.is_file()),
                "shx_fallback_hits_total": int(sum(int(s.shx_fallback_hit_count) for s in self.sessions.values())),
                "shx_outline_enabled": self.enable_shx_outline,
                "shx_outline_oda_enabled": self.enable_shx_outline_oda,
                "force_text_vectorize": self.force_text_vectorize,
                "shx_debug_match_enabled": self.enable_shx_debug_match,
                "vectorize_cache_capacity": self.vectorize_cache_capacity,
                "vectorize_cache_size": len(self._vectorize_text_cache),
                "oda_vectorize_exe": self.oda_vectorize_exe,
                "oda_vectorize_exe_exists": bool(self._is_oda_vectorize_available()),
                "oda_vectorize_resolve_source": self.oda_vectorize_resolve_source,
            },
        }

        if self.mode == "external_http":
            try:
                remote = self._external_request_json("GET", "/health")
                base["external_health"] = self._strip_ok(remote)
            except ExternalCoreError as exc:
                base["status"] = "error"
                base["external_error"] = str(exc)
                if exc.status_code is not None:
                    base["external_status_code"] = exc.status_code
                if exc.body:
                    base["external_body"] = exc.body[:500]
            return base

        if self.mode == "oda_cli":
            if not self.oda_read_exe:
                base["status"] = "error"
                base["error"] = "OdReadEx executable is not configured"
            elif not Path(self.oda_read_exe).exists():
                base["status"] = "error"
                base["error"] = f"OdReadEx not found: {self.oda_read_exe}"
            return base

        return base

    def _build_stub_spaces(self, stem: str) -> Tuple[List[Dict[str, object]], Dict[str, List[Dict[str, object]]]]:
        spaces = [
            {"id": "model", "display_name": "Model", "kind": "model"},
            {"id": "layout:Layout1", "display_name": "Layout1", "kind": "layout"},
        ]
        entities = {
            "model": [
                {
                    "id": f"{stem}-line-1",
                    "type": "LINE",
                    "layer": "0",
                    "space_id": "model",
                    "geom": {
                        "start": {"x": 0.0, "y": 0.0, "z": 0.0},
                        "end": {"x": 1000.0, "y": 0.0, "z": 0.0},
                    },
                    "style": {"lineweight": "default"},
                    "bbox": {"min": {"x": 0.0, "y": 0.0, "z": 0.0}, "max": {"x": 1000.0, "y": 0.0, "z": 0.0}},
                },
                {
                    "id": f"{stem}-circle-1",
                    "type": "CIRCLE",
                    "layer": "0",
                    "space_id": "model",
                    "geom": {"center": {"x": 300.0, "y": 200.0, "z": 0.0}, "radius": 120.0},
                    "style": {"lineweight": "default"},
                    "bbox": {"min": {"x": 180.0, "y": 80.0, "z": 0.0}, "max": {"x": 420.0, "y": 320.0, "z": 0.0}},
                },
            ],
            "layout:Layout1": [
                {
                    "id": f"{stem}-layout-line-1",
                    "type": "LINE",
                    "layer": "VIEWPORT",
                    "space_id": "layout:Layout1",
                    "geom": {
                        "start": {"x": 50.0, "y": 50.0, "z": 0.0},
                        "end": {"x": 350.0, "y": 50.0, "z": 0.0},
                    },
                    "style": {"lineweight": "default"},
                    "bbox": {"min": {"x": 50.0, "y": 50.0, "z": 0.0}, "max": {"x": 350.0, "y": 50.0, "z": 0.0}},
                }
            ],
        }
        return spaces, entities

    def open_document(self, file_path: Path, original_name: str) -> Dict[str, object]:
        if self.mode == "external_http":
            opened = self._external_open_document(file_path, original_name)
            remote_doc_id = str(opened.get("doc_id", "")).strip() or str(opened.get("id", "")).strip()
            if not remote_doc_id:
                raise ExternalCoreError("external DWG core /open did not return doc_id")

            doc_id = str(uuid.uuid4())
            spaces = opened.get("spaces") if isinstance(opened.get("spaces"), list) else []
            current_space = str(opened.get("current_space", "model") or "model")
            warnings_raw = opened.get("warnings")
            warnings = warnings_raw if isinstance(warnings_raw, list) else []
            mode = str(opened.get("mode") or "external_http")
            remote_shx_status = opened.get("shx_status") if isinstance(opened.get("shx_status"), dict) else {}
            outline_mode = str(
                remote_shx_status.get("outline_mode")
                or opened.get("shx_outline_mode")
                or "none"
            ).strip().lower() or "none"

            def _to_int(value: object, default: int = 0) -> int:
                try:
                    return int(value)  # type: ignore[arg-type]
                except Exception:
                    return default

            session = DwgDocSession(
                doc_id=doc_id,
                file_path=file_path,
                original_name=original_name,
                mode=mode,
                spaces=spaces,
                entities_by_space={},
                text_styles={},
                warnings=warnings,
                current_space=current_space,
                remote_doc_id=remote_doc_id,
            )
            session.shx_outline_mode = outline_mode
            session.shx_detected = bool(remote_shx_status.get("detected"))
            session.shx_true_outline = bool(remote_shx_status.get("true_outline"))
            session.shx_vectorize_attempted = bool(remote_shx_status.get("vectorize_attempted"))
            session.shx_vectorize_attached_count = _to_int(remote_shx_status.get("vectorize_attached_count"), 0)
            vectorize_error = remote_shx_status.get("vectorize_error")
            session.shx_vectorize_error = str(vectorize_error).strip() if vectorize_error else None
            session.shx_fallback_text_count = _to_int(remote_shx_status.get("fallback_text_count"), 0)
            session.shx_missing_original_fonts = self._string_list(remote_shx_status.get("missing_original_shx_fonts"))
            session.shx_resolved_original_fonts = self._string_list(remote_shx_status.get("resolved_original_shx_fonts"))
            fallback_name_raw = remote_shx_status.get("fallback_shx_file")
            session.shx_fallback_file_name = str(fallback_name_raw or "").strip() or None
            session.shx_fallback_hit_count = _to_int(remote_shx_status.get("fallback_hit_count"), 0)
            session.shx_diagnostics_unavailable = bool(remote_shx_status.get("diagnostics_unavailable"))
            session.shx_debug_match = (
                remote_shx_status.get("debug_match")
                if isinstance(remote_shx_status.get("debug_match"), dict)
                else None
            )
            session.view_state["remote_doc_id"] = remote_doc_id
            self.sessions[doc_id] = session

            return {
                "doc_id": doc_id,
                "mode": mode,
                "parser_revision": DWG_CORE_PARSER_REV,
                "spaces": spaces,
                "current_space": current_space,
                "warnings": warnings,
                "shx_status": self._build_shx_status(session),
            }

        if self.mode == "oda_cli":
            dump_text = self._run_oda_read_dump(file_path)
            spaces, entities_by_space, block_refs_by_space, warnings, text_styles = self._parse_oda_dump(dump_text)
            if not spaces:
                spaces = [{"id": "model", "display_name": "Model", "kind": "model"}]
            current_space = "model" if any(s.get("id") == "model" for s in spaces) else str(spaces[0].get("id", "model"))

            shx_outline_mode = "none"
            has_text = self._has_text_entities(entities_by_space)
            has_shx_text = self._has_shx_text_entities(entities_by_space)
            has_shx_style_hints = self._has_shx_style_hints(text_styles)
            shx_detected = has_shx_text or has_shx_style_hints
            shx_vectorize_attempted = False
            shx_vectorize_attached_count = 0
            shx_vectorize_error: Optional[str] = None
            shx_debug_match: Optional[Dict[str, object]] = None
            should_try_vectorize = (
                has_text
                and self.enable_shx_outline
                and self._is_oda_vectorize_available()
            )
            if should_try_vectorize:
                shx_vectorize_attempted = True
                try:
                    cache_key = self._vectorize_cache_key(file_path)
                    vector_text_primitives = self._vectorize_cache_get(cache_key)
                    parse_meta: Dict[str, object]
                    cache_hit = vector_text_primitives is not None
                    if vector_text_primitives is None:
                        vector_dump = self._run_oda_vectorize_dump(file_path)
                        vector_text_primitives, parse_meta = self._parse_oda_vectorize_text_primitives(vector_dump)
                        self._vectorize_cache_put(cache_key, vector_text_primitives)
                    else:
                        parse_meta = self._build_vectorize_parse_meta_from_primitives(vector_text_primitives)

                    attached_count, attach_debug = self._attach_oda_vectorized_text_primitives_with_debug(
                        entities_by_space,
                        vector_text_primitives,
                        enable_debug=self.enable_shx_debug_match,
                    )
                    shx_vectorize_attached_count = attached_count
                    if self.enable_shx_debug_match:
                        shx_debug_match = {
                            **parse_meta,
                            **attach_debug,
                            "vectorize_cache_hit": cache_hit,
                            "vectorize_text_keys_count": len(vector_text_primitives),
                        }
                    if attached_count > 0:
                        shx_outline_mode = "oda_vectorize"
                    elif shx_detected:
                        shx_outline_mode = "stub"
                        warnings.append(
                            "SHX 轮廓提取未匹配到可替换文字实体，已回退为笔画模拟渲染。"
                        )
                except ExternalCoreError as exc:
                    shx_vectorize_error = str(exc)
                    if self.enable_shx_debug_match:
                        shx_debug_match = {
                            "vectorize_error": str(exc),
                            "vectorize_cache_hit": False,
                            "attach_candidate_entity_count": 0,
                            "matched_entity_count": 0,
                            "unmatched_entity_count": 0,
                        }
                    if shx_detected:
                        shx_outline_mode = "stub"
                        warnings.append(
                            f"SHX 轮廓提取失败（{exc}），已回退为笔画模拟渲染。"
                        )
            elif shx_detected and self.enable_shx_outline:
                shx_outline_mode = "stub"
                warnings.append(
                    "未配置或未找到 OdVectorizeEx，SHX 将使用笔画模拟渲染。"
                )
            elif shx_detected:
                shx_outline_mode = "disabled"

            shx_true_outline = shx_outline_mode == "oda_vectorize" and shx_vectorize_attached_count > 0
            shx_fallback_text_count = self._count_shx_text_fallback_entities(entities_by_space) if shx_detected else 0
            shx_font_resolution_warning = self._build_shx_font_resolution_warning(
                text_styles=text_styles,
                shx_detected=shx_detected,
                shx_true_outline=shx_true_outline,
            )
            if shx_font_resolution_warning:
                warnings.append(shx_font_resolution_warning)
            missing_font_warning = self._build_missing_font_warning(text_styles)
            if missing_font_warning:
                warnings.append(missing_font_warning)

            total_entities = sum(len(v) for v in entities_by_space.values())
            if total_entities == 0:
                warnings.append("ODA 已加载 DWG，但尚未提取到可显示的受支持图元。")

            doc_id = str(uuid.uuid4())
            session = DwgDocSession(
                doc_id=doc_id,
                file_path=file_path,
                original_name=original_name,
                mode="oda_cli",
                spaces=spaces,
                entities_by_space=entities_by_space,
                block_refs_by_space=block_refs_by_space,
                text_styles=text_styles,
                warnings=warnings,
                shx_outline_mode=shx_outline_mode,
                shx_detected=shx_detected,
                shx_true_outline=shx_true_outline,
                shx_vectorize_attempted=shx_vectorize_attempted,
                shx_vectorize_attached_count=shx_vectorize_attached_count,
                shx_vectorize_error=shx_vectorize_error,
                shx_fallback_text_count=shx_fallback_text_count,
                shx_debug_match=shx_debug_match if self.enable_shx_debug_match else None,
                current_space=current_space,
            )
            fonts_preview = self._collect_session_fonts(session)
            shx_diag = self._build_shx_diagnostics_from_fonts(fonts_preview)
            session.shx_missing_original_fonts = self._string_list(shx_diag.get("missing_original_shx_fonts"))
            session.shx_resolved_original_fonts = self._string_list(shx_diag.get("resolved_original_shx_fonts"))
            fallback_file = str(shx_diag.get("fallback_shx_file") or "").strip() or None
            session.shx_fallback_file_name = fallback_file
            session.shx_fallback_hit_count = int(shx_diag.get("fallback_hit_count") or 0)
            session.shx_diagnostics_unavailable = bool(shx_diag.get("diagnostics_unavailable"))

            if session.shx_missing_original_fonts:
                missing_text = self._format_missing_font_names(session.shx_missing_original_fonts)
                fallback_note = f"，已使用后备字体 {session.shx_fallback_file_name}" if session.shx_fallback_file_name else ""
                warning_text = f"未命中原始 SHX 字体：{missing_text}{fallback_note}。"
                if warning_text not in warnings:
                    warnings.append(warning_text)
            elif session.shx_detected and not session.shx_true_outline and session.shx_resolved_original_fonts:
                warning_text = "原始 SHX 字体已命中，当前降级更可能由轮廓匹配失败导致。"
                if warning_text not in warnings:
                    warnings.append(warning_text)

            session.view_state["entity_count"] = total_entities
            self.sessions[doc_id] = session
            return {
                "doc_id": doc_id,
                "mode": session.mode,
                "parser_revision": DWG_CORE_PARSER_REV,
                "spaces": spaces,
                "current_space": current_space,
                "shx_outline_mode": shx_outline_mode,
                "warnings": warnings,
                "shx_status": self._build_shx_status(session),
            }

        doc_id = str(uuid.uuid4())
        stem = file_path.stem
        spaces, entities = self._build_stub_spaces(stem)

        warnings: List[str] = []
        warnings.append(
            "DWG core is running in stub mode. Configure ODA_READ_EXE/ODA_RUNTIME_ROOT or DWG_CORE_BASE_URL for real parsing."
        )

        session = DwgDocSession(
            doc_id=doc_id,
            file_path=file_path,
            original_name=original_name,
            mode=self.mode,
            spaces=spaces,
            entities_by_space=entities,
            text_styles={},
            warnings=warnings,
        )
        self.sessions[doc_id] = session
        return {
            "doc_id": doc_id,
            "mode": session.mode,
            "parser_revision": DWG_CORE_PARSER_REV,
            "spaces": spaces,
            "current_space": session.current_space,
            "warnings": warnings,
            "shx_status": self._build_shx_status(session),
        }

    def get_session(self, doc_id: str) -> Optional[DwgDocSession]:
        session = self.sessions.get(doc_id)
        if session:
            session.updated_at = time.time()
        return session

    def close_document(self, doc_id: str) -> bool:
        session = self.sessions.get(doc_id)
        if not session:
            return False

        if self.mode == "external_http" and session.remote_doc_id:
            try:
                self._external_doc_request(session, "POST", "/close", {})
            except ExternalCoreError:
                pass

        self.sessions.pop(doc_id, None)
        return True

    def list_spaces(self, doc_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            data = self._external_doc_request(session, "GET", "/spaces")
            spaces = data.get("spaces") if isinstance(data.get("spaces"), list) else session.spaces
            current_space = str(data.get("current_space", session.current_space) or session.current_space)
            session.spaces = spaces
            session.current_space = current_space
            return {"doc_id": doc_id, "current_space": current_space, "spaces": spaces}

        return {"doc_id": doc_id, "current_space": session.current_space, "spaces": session.spaces}

    def list_entities(
        self,
        doc_id: str,
        space_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        space = space_id or session.current_space

        if self.mode == "external_http":
            params: Dict[str, object] = {"space_id": space}
            if limit is not None:
                params["limit"] = int(limit)
            query = urllib_parse.urlencode(params)
            suffix = "/entities"
            if query:
                suffix += f"?{query}"
            return self._external_doc_request(session, "GET", suffix)

        if isinstance(limit, int):
            entity_limit = int(limit) if limit > 0 else self.max_entities_per_space
        else:
            entity_limit = self.default_entity_api_limit
        all_entities = list(session.entities_by_space.get(space, []))
        sliced = [self._entity_with_primitives(ent) for ent in all_entities[:entity_limit]]
        return {
            "doc_id": doc_id,
            "space_id": space,
            "entities": sliced,
            "total_count": len(all_entities),
            "truncated": len(all_entities) > entity_limit,
        }

    def list_hierarchy(self, doc_id: str, space_id: Optional[str] = None) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        space = space_id or session.current_space

        if self.mode == "external_http":
            params: Dict[str, object] = {"space_id": space}
            query = urllib_parse.urlencode(params)
            suffix = "/hierarchy"
            if query:
                suffix += f"?{query}"
            return self._external_doc_request(session, "GET", suffix)

        all_entities = [self._entity_with_primitives(ent) for ent in session.entities_by_space.get(space, [])]
        all_block_refs = [self._entity_with_primitives(ref) for ref in session.block_refs_by_space.get(space, [])]

        def _extract_handle(obj: Dict[str, object]) -> str:
            raw = str(obj.get("handle") or obj.get("id") or "").strip()
            if not raw:
                return ""
            if "@" in raw:
                raw = raw.split("@", 1)[0]
            if "/" in raw:
                raw = raw.rsplit("/", 1)[-1]
            return raw.upper()

        def _handle_sort_key(obj: Dict[str, object]) -> Tuple[int, int, str]:
            h = _extract_handle(obj)
            if not h:
                return (2, 0, "")
            try:
                return (0, int(h, 16), h)
            except Exception:
                return (1, 0, h)

        entities_by_parent: Dict[Optional[str], List[Dict[str, object]]] = {}
        for ent in all_entities:
            parent_raw = ent.get("parent_block_id")
            parent = str(parent_raw).strip() if isinstance(parent_raw, str) and str(parent_raw).strip() else None
            entities_by_parent.setdefault(parent, []).append(ent)

        block_refs_by_parent: Dict[Optional[str], List[Dict[str, object]]] = {}
        for ref in all_block_refs:
            parent_raw = ref.get("parent_block_id")
            parent = str(parent_raw).strip() if isinstance(parent_raw, str) and str(parent_raw).strip() else None
            block_refs_by_parent.setdefault(parent, []).append(ref)

        def _build_level(parent_block_id: Optional[str], visiting: set[str]) -> List[Dict[str, object]]:
            objs: List[Dict[str, object]] = []
            objs.extend(block_refs_by_parent.get(parent_block_id, []))
            objs.extend(entities_by_parent.get(parent_block_id, []))

            by_type: Dict[str, List[Dict[str, object]]] = {}
            for obj in objs:
                t = str(obj.get("type", "UNKNOWN")).upper() or "UNKNOWN"
                by_type.setdefault(t, []).append(obj)

            level_nodes: List[Dict[str, object]] = []
            parent_key = parent_block_id or "root"
            for t in sorted(by_type.keys()):
                group_items = sorted(by_type[t], key=_handle_sort_key)
                item_nodes: List[Dict[str, object]] = []
                for item in group_items:
                    entity_id = str(item.get("id", "")).strip()
                    is_block_ref = str(item.get("type", "")).upper() == "BLOCK_REF"
                    bbox = item.get("bbox") if isinstance(item.get("bbox"), dict) else None
                    handle = _extract_handle(item)
                    geom = item.get("geom") if isinstance(item.get("geom"), dict) else {}
                    block_name = str(geom.get("block_name", "")).strip() if isinstance(geom, dict) else ""
                    label = handle or entity_id or "--"
                    if is_block_ref and block_name:
                        label = f"{label} ({block_name})"
                    child_nodes: List[Dict[str, object]] = []
                    if is_block_ref and entity_id and entity_id not in visiting:
                        next_visiting = set(visiting)
                        next_visiting.add(entity_id)
                        child_nodes = _build_level(entity_id, next_visiting)
                    item_nodes.append(
                        {
                            "node_id": f"{'block' if is_block_ref else 'entity'}:{entity_id}",
                            "node_kind": "block_ref" if is_block_ref else "entity",
                            "label": label,
                            "type": str(item.get("type", "")).upper() or "UNKNOWN",
                            "layer": str(item.get("layer", "0")),
                            "handle": handle or None,
                            "entity_id": entity_id,
                            "parent_block_id": parent_block_id,
                            "bbox": bbox,
                            "children": child_nodes,
                        }
                    )
                level_nodes.append(
                    {
                        "node_id": f"category:{parent_key}:{t}",
                        "node_kind": "category",
                        "label": t,
                        "type": t,
                        "layer": None,
                        "handle": None,
                        "entity_id": None,
                        "parent_block_id": parent_block_id,
                        "bbox": None,
                        "children": item_nodes,
                    }
                )
            return level_nodes

        tree = _build_level(None, set())
        return {
            "doc_id": doc_id,
            "space_id": space,
            "nodes": tree,
            "total_entity_count": len(all_entities),
            "total_block_ref_count": len(all_block_refs),
        }

    def _collect_session_fonts(self, session: DwgDocSession) -> List[Dict[str, object]]:
        aggregated: Dict[str, Dict[str, object]] = {}
        font_files: Dict[str, str] = {}
        shx_fallback_hits = 0

        for entities in session.entities_by_space.values():
            for ent in entities:
                if str(ent.get("type", "")).upper() != "TEXT":
                    continue
                geom = ent.get("geom") if isinstance(ent.get("geom"), dict) else {}
                if not isinstance(geom, dict):
                    continue

                font_key = _sanitize_font_key(
                    geom.get("font_key")
                    or geom.get("font_style_name")
                    or geom.get("font_name")
                    or geom.get("font_family")
                )
                style_name = str(geom.get("font_style_name") or geom.get("style_name") or "").strip() or None
                font_name = str(geom.get("font_name") or style_name or "").strip() or None
                font_family = str(geom.get("font_family") or _font_family_from_name(font_name or style_name or "")).strip() or None
                font_kind = str(geom.get("font_kind") or _detect_font_kind(font_name or "")).strip().lower() or "unknown"
                font_source = str(geom.get("font_source") or ("text_style_table" if style_name else "fallback")).strip() or "fallback"

                record = aggregated.get(font_key)
                if record is None:
                    record = {
                        "key": font_key,
                        "style_name": style_name,
                        "name": font_name,
                        "family": font_family,
                        "kind": font_kind,
                        "source": font_source,
                        "usage_count": 0,
                    }
                    aggregated[font_key] = record
                record["usage_count"] = int(record.get("usage_count", 0)) + 1

        fonts: List[Dict[str, object]] = []
        for key, record in aggregated.items():
            name_or_style = record.get("name") or record.get("style_name") or record.get("family") or key
            resolved = self._resolve_font_file(name_or_style)
            kind = str(record.get("kind", "unknown")).lower()
            fallback_shx_hit = False
            if (
                not resolved
                and kind == "shx"
                and self.enable_shx_outline
                and self.shx_fallback_file.exists()
                and self.shx_fallback_file.is_file()
            ):
                resolved = self.shx_fallback_file
                fallback_shx_hit = True
                shx_fallback_hits += 1
            file_url: Optional[str] = None
            reason: Optional[str] = None
            available = False
            shx_mode = str(session.shx_outline_mode or "none").strip().lower()
            if resolved and resolved.exists():
                resolved_ext_kind = _detect_font_kind(str(resolved))
                if kind == "unknown":
                    kind = resolved_ext_kind
                if kind in ("ttf", "ttc", "otf"):
                    available = True
                    file_url = f"/api/dwg/{session.doc_id}/fonts/{urllib_parse.quote(key, safe='')}/file"
                    font_files[key] = str(resolved)
                elif kind == "shx":
                    if self.enable_shx_outline:
                        available = True
                        if shx_mode == "oda_vectorize":
                            if fallback_shx_hit:
                                reason = f"SHX rendered by ODA vectorized glyph outlines (fallback: {self.shx_fallback_file.name})."
                            else:
                                reason = "SHX rendered by ODA vectorized glyph outlines."
                        else:
                            if fallback_shx_hit:
                                reason = f"SHX rendered by server-side stroke outline emulation (fallback: {self.shx_fallback_file.name})."
                            else:
                                reason = "SHX rendered by server-side stroke outline emulation."
                    else:
                        reason = "SHX font detected: frontend fallback font will be used."
                else:
                    reason = "Unsupported font file type."
            else:
                if kind == "shx":
                    if self.enable_shx_outline:
                        available = True
                        if shx_mode == "oda_vectorize":
                            reason = "SHX rendered by ODA vectorized glyph outlines (font file optional)."
                        else:
                            reason = "SHX rendered by server-side stroke outline emulation (font file not required)."
                    else:
                        reason = "SHX font file not found on server."
                else:
                    reason = "Font file not found on server."

            fonts.append(
                {
                    "key": key,
                    "style_name": record.get("style_name"),
                    "name": record.get("name"),
                    "family": record.get("family"),
                    "kind": kind,
                    "source": record.get("source"),
                    "usage_count": int(record.get("usage_count", 0)),
                    "available": available,
                    "file_name": Path(font_files[key]).name if available and key in font_files else None,
                    "file_url": file_url,
                    "reason": reason,
                    "fallback_shx_hit": fallback_shx_hit,
                    "fallback_shx_file_name": self.shx_fallback_file.name if fallback_shx_hit else None,
                }
            )

        fonts.sort(key=lambda f: (str(f.get("kind", "")), str(f.get("style_name", "")), str(f.get("name", ""))))
        session.font_files = font_files
        session.shx_fallback_hit_count = shx_fallback_hits
        return fonts

    def list_fonts(self, doc_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            try:
                return self._external_doc_request(session, "GET", "/fonts")
            except ExternalCoreError:
                # Keep UI usable even if remote core does not provide a dedicated /fonts endpoint.
                return {"doc_id": doc_id, "fonts": [], "count": 0, "warnings": ["Remote DWG core did not expose /fonts endpoint."]}

        fonts = self._collect_session_fonts(session)
        shx_diagnostics = self._build_shx_diagnostics_from_fonts(fonts)
        session.shx_missing_original_fonts = self._string_list(shx_diagnostics.get("missing_original_shx_fonts"))
        session.shx_resolved_original_fonts = self._string_list(shx_diagnostics.get("resolved_original_shx_fonts"))
        session.shx_fallback_file_name = str(shx_diagnostics.get("fallback_shx_file") or "").strip() or None
        session.shx_fallback_hit_count = int(shx_diagnostics.get("fallback_hit_count") or 0)
        session.shx_diagnostics_unavailable = bool(shx_diagnostics.get("diagnostics_unavailable"))

        warnings: List[str] = []
        if any(str(f.get("kind")) == "shx" for f in fonts):
            if self.enable_shx_outline:
                if str(session.shx_outline_mode).strip().lower() == "oda_vectorize":
                    warnings.append("SHX 字体当前由 ODA 真实轮廓渲染。")
                else:
                    warnings.append("SHX 字体当前由服务端笔画模拟渲染。")
            else:
                warnings.append("SHX 字体当前由前端降级字体渲染。")

        if session.shx_missing_original_fonts:
            missing_text = self._format_missing_font_names(session.shx_missing_original_fonts)
            fallback_note = f"已使用后备字体 {session.shx_fallback_file_name}。" if session.shx_fallback_file_name else "未检测到后备 SHX 字体。"
            warnings.append(f"未命中原始 SHX 字体：{missing_text}。{fallback_note}")
        elif bool(session.shx_detected) and not bool(session.shx_true_outline) and session.shx_resolved_original_fonts:
            warnings.append("原始 SHX 字体均已命中，当前降级更可能由轮廓匹配失败导致。")

        return {
            "doc_id": doc_id,
            "fonts": fonts,
            "count": len(fonts),
            "warnings": warnings,
            "shx_outline_mode": session.shx_outline_mode,
            "shx_diagnostics": shx_diagnostics,
            "shx_fallback_file": str(self.shx_fallback_file),
            "shx_fallback_exists": bool(self.shx_fallback_file.exists() and self.shx_fallback_file.is_file()),
            "shx_fallback_hit_count": int(session.shx_fallback_hit_count),
        }

    def get_font_file(self, doc_id: str, font_key: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None
        key = _sanitize_font_key(font_key)
        if key not in session.font_files:
            # Lazy refresh once to avoid stale cache issues.
            self._collect_session_fonts(session)
        path_raw = session.font_files.get(key)
        if not path_raw:
            return None
        p = Path(path_raw)
        if not p.exists() or not p.is_file():
            return None
        return {"doc_id": doc_id, "font_key": key, "path": p}

    def set_view(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            data = self._external_doc_request(session, "POST", "/view", payload)
            current_space = data.get("current_space")
            if isinstance(current_space, str) and current_space:
                session.current_space = current_space

            view_state = data.get("view_state")
            if isinstance(view_state, dict):
                session.view_state.update(view_state)
            else:
                zoom = payload.get("zoom")
                if isinstance(zoom, (int, float)) and float(zoom) > 0:
                    session.view_state["zoom"] = float(zoom)
                center = payload.get("center")
                if isinstance(center, dict) and "x" in center and "y" in center:
                    session.view_state["center"] = {
                        "x": float(center.get("x", 0.0)),
                        "y": float(center.get("y", 0.0)),
                        "z": float(center.get("z", 0.0)),
                    }

            return {
                "doc_id": doc_id,
                "current_space": session.current_space,
                "view_state": session.view_state,
            }

        space_id = payload.get("space_id")
        if isinstance(space_id, str) and any(s["id"] == space_id for s in session.spaces):
            session.current_space = space_id

        zoom = payload.get("zoom")
        if isinstance(zoom, (int, float)) and float(zoom) > 0:
            session.view_state["zoom"] = float(zoom)

        center = payload.get("center")
        if isinstance(center, dict) and "x" in center and "y" in center:
            session.view_state["center"] = {
                "x": float(center.get("x", 0.0)),
                "y": float(center.get("y", 0.0)),
                "z": float(center.get("z", 0.0)),
            }

        return {
            "doc_id": doc_id,
            "current_space": session.current_space,
            "view_state": session.view_state,
        }

    def _build_shx_outline_primitives(self, geom: Dict[str, object]) -> List[Dict[str, object]]:
        text = str(geom.get("text", ""))
        if not text:
            return []
        position = geom.get("position")
        if not isinstance(position, dict):
            return []
        lines = text.replace("\r", "").split("\n")
        if not lines:
            return []

        try:
            height = float(geom.get("actual_height", geom.get("height", 100.0)))
        except Exception:
            height = 100.0
        if not math.isfinite(height) or height <= 1e-9:
            return []
        try:
            width_factor = float(geom.get("width_factor", 1.0))
        except Exception:
            width_factor = 1.0
        if not math.isfinite(width_factor) or width_factor <= 0:
            width_factor = 1.0
        try:
            oblique_deg = float(geom.get("oblique", 0.0))
        except Exception:
            oblique_deg = 0.0
        try:
            rotation_deg = float(geom.get("rotation", 0.0))
        except Exception:
            rotation_deg = 0.0
        mirrored_x = bool(geom.get("mirrored_x", False))
        mirrored_y = bool(geom.get("mirrored_y", False))
        is_mtext = bool(geom.get("is_mtext", False))

        shear = math.tan(math.radians(oblique_deg))
        rot_rad = math.radians(rotation_deg)
        cos_r = math.cos(rot_rad)
        sin_r = math.sin(rot_rad)

        base_x = float(position.get("x", 0.0))
        base_y = float(position.get("y", 0.0))
        base_z = float(position.get("z", 0.0))

        line_gap = height * (1.22 if is_mtext else 1.0)
        char_w = height * 0.62 * width_factor
        advance = height * 0.72 * width_factor

        outlines: List[Dict[str, object]] = []
        for line_index, line in enumerate(lines):
            x_cursor = 0.0
            y_offset = -line_index * line_gap
            for ch in line:
                glyph = _shx_char_strokes(ch)
                if glyph is None:
                    # Unknown character, let frontend text fallback render this entity.
                    return []
                if glyph:
                    for stroke in glyph:
                        if len(stroke) < 2:
                            continue
                        points: List[Dict[str, float]] = []
                        for px, py in stroke:
                            x_local = x_cursor + px * char_w
                            y_local = y_offset + py * height
                            if mirrored_x:
                                x_local = -x_local
                            if mirrored_y:
                                y_local = -y_local
                            x_sheared = x_local + shear * y_local
                            y_sheared = y_local
                            xr = x_sheared * cos_r - y_sheared * sin_r
                            yr = x_sheared * sin_r + y_sheared * cos_r
                            points.append({"x": base_x + xr, "y": base_y + yr, "z": base_z})
                        if len(points) >= 2:
                            outlines.append(
                                {
                                    "kind": "polyline",
                                    "points": points,
                                    "closed": False,
                                    "subtype": "shx_outline",
                                }
                            )
                x_cursor += advance
        return outlines

    def _entity_primitives(self, ent: Dict[str, object]) -> List[Dict[str, object]]:
        geom = ent.get("geom", {}) if isinstance(ent.get("geom"), dict) else {}
        existing = geom.get("primitives")
        if isinstance(existing, list) and existing:
            return [p for p in existing if isinstance(p, dict)]

        et = str(ent.get("type", "")).upper()
        out: List[Dict[str, object]] = []
        if et == "LINE":
            start = geom.get("start")
            end = geom.get("end")
            if isinstance(start, dict) and isinstance(end, dict):
                out.append({"kind": "line", "start": start, "end": end})
            return out

        if et in ("POLYLINE", "SPLINE"):
            points = geom.get("vertices") if et == "POLYLINE" else geom.get("points")
            if isinstance(points, list):
                clean = [p for p in points if isinstance(p, dict)]
                if len(clean) >= 2:
                    poly_obj: Dict[str, object] = {"kind": "polyline", "points": clean, "closed": bool(geom.get("closed", False))}
                    if et == "POLYLINE":
                        start_w = geom.get("start_width")
                        end_w = geom.get("end_width")
                        global_w = geom.get("global_width")
                        if isinstance(start_w, (int, float)) and math.isfinite(float(start_w)) and float(start_w) > 0:
                            poly_obj["start_width"] = float(start_w)
                        if isinstance(end_w, (int, float)) and math.isfinite(float(end_w)) and float(end_w) > 0:
                            poly_obj["end_width"] = float(end_w)
                        if isinstance(global_w, (int, float)) and math.isfinite(float(global_w)) and float(global_w) > 0:
                            poly_obj["global_width"] = float(global_w)
                    out.append(poly_obj)
            return out

        if et == "CIRCLE":
            center = geom.get("center")
            radius = geom.get("radius")
            if isinstance(center, dict) and isinstance(radius, (int, float)) and float(radius) > 0:
                out.append({"kind": "circle", "center": center, "radius": float(radius)})
            return out

        if et == "ARC":
            center = geom.get("center")
            radius = geom.get("radius")
            if isinstance(center, dict) and isinstance(radius, (int, float)) and float(radius) > 0:
                obj: Dict[str, object] = {"kind": "arc", "center": center, "radius": float(radius)}
                if isinstance(geom.get("start"), dict):
                    obj["start"] = geom.get("start")
                if isinstance(geom.get("end"), dict):
                    obj["end"] = geom.get("end")
                if isinstance(geom.get("start_angle"), (int, float)):
                    obj["start_angle"] = float(geom.get("start_angle"))  # type: ignore[arg-type]
                if isinstance(geom.get("end_angle"), (int, float)):
                    obj["end_angle"] = float(geom.get("end_angle"))  # type: ignore[arg-type]
                out.append(obj)
            return out

        if et == "ELLIPSE":
            center = geom.get("center")
            rx = geom.get("rx")
            ry = geom.get("ry")
            if isinstance(center, dict) and isinstance(rx, (int, float)) and isinstance(ry, (int, float)):
                obj = {
                    "kind": "ellipse",
                    "center": center,
                    "rx": float(rx),
                    "ry": float(ry),
                    "rotation": float(geom.get("rotation", 0.0)),
                    "start_angle": float(geom.get("start_angle", 0.0)),
                    "end_angle": float(geom.get("end_angle", 360.0)),
                }
                if isinstance(geom.get("start"), dict):
                    obj["start"] = geom.get("start")
                if isinstance(geom.get("end"), dict):
                    obj["end"] = geom.get("end")
                out.append(obj)
            return out

        if et == "TEXT":
            font_kind = str(geom.get("font_kind", "")).strip().lower()
            if self.enable_shx_outline and font_kind == "shx":
                oda_outlines = geom.get("oda_outline_primitives")
                if isinstance(oda_outlines, list):
                    clean_oda = [p for p in oda_outlines if isinstance(p, dict)]
                    if clean_oda:
                        return clean_oda
                shx_outlines = self._build_shx_outline_primitives(geom)
                if shx_outlines:
                    return shx_outlines
            pos = geom.get("position")
            if isinstance(pos, dict):
                out.append(
                    {
                        "kind": "text",
                        "text": str(geom.get("text", "")),
                        "position": pos,
                        "height": float(geom.get("height", 100.0)),
                        "rotation": float(geom.get("rotation", 0.0)),
                        "width_factor": float(geom.get("width_factor", 1.0)),
                        "oblique": float(geom.get("oblique", 0.0)),
                        "actual_height": float(geom.get("actual_height", geom.get("height", 100.0))),
                        "horizontal_mode": geom.get("horizontal_mode"),
                        "vertical_mode": geom.get("vertical_mode"),
                        "attachment": geom.get("attachment"),
                        "mirrored_x": bool(geom.get("mirrored_x", False)),
                        "mirrored_y": bool(geom.get("mirrored_y", False)),
                        "is_mtext": bool(geom.get("is_mtext", False)),
                        "font_key": geom.get("font_key"),
                        "font_style_name": geom.get("font_style_name"),
                        "font_name": geom.get("font_name"),
                        "font_family": geom.get("font_family"),
                        "font_kind": geom.get("font_kind"),
                        "font_source": geom.get("font_source"),
                    }
                )
            return out

        if et == "POINT":
            pos = geom.get("position")
            if isinstance(pos, dict):
                out.append({"kind": "point", "position": pos, "display_size": float(geom.get("display_size", 6.0))})
            return out

        if et == "HATCH":
            loops = geom.get("loops")
            if isinstance(loops, list):
                rings: List[List[Dict[str, float]]] = []
                for lp in loops:
                    pts = lp.get("points") if isinstance(lp, dict) else None
                    if not isinstance(pts, list):
                        continue
                    clean = [p for p in pts if isinstance(p, dict)]
                    if len(clean) >= 2:
                        rings.append(clean)
                if rings:
                    out.append(
                        {
                            "kind": "polygon",
                            "rings": rings,
                            "filled": bool(geom.get("solid_fill", False)),
                            "pattern_name": geom.get("pattern_name", "SOLID"),
                            "pattern_angle": geom.get("pattern_angle"),
                            "pattern_scale": geom.get("pattern_scale"),
                            "pattern_spacing": geom.get("pattern_spacing"),
                        }
                    )
                    for ring in rings:
                        out.append({"kind": "polyline", "points": ring, "closed": True})
            return out

        if et == "DIMENSION":
            line_start = geom.get("line_start")
            line_end = geom.get("line_end")
            ext1 = geom.get("ext1")
            ext2 = geom.get("ext2")
            if isinstance(ext1, dict) and isinstance(line_start, dict):
                out.append({"kind": "line", "start": ext1, "end": line_start})
            if isinstance(ext2, dict) and isinstance(line_end, dict):
                out.append({"kind": "line", "start": ext2, "end": line_end})
            if isinstance(line_start, dict) and isinstance(line_end, dict):
                seg_dx = float(line_end["x"]) - float(line_start["x"])
                seg_dy = float(line_end["y"]) - float(line_start["y"])
                line_head = dict(line_start)
                line_tail = dict(line_end)
                dim_len = _point_distance(line_start, line_end)
                arrow_size_raw = geom.get("arrow_size")
                if isinstance(arrow_size_raw, (int, float)) and math.isfinite(float(arrow_size_raw)) and float(arrow_size_raw) > 0:
                    arrow_len = max(3.0, min(160.0, float(arrow_size_raw)))
                else:
                    arrow_len = max(8.0, min(120.0, dim_len * 0.03))
                arrow_half = arrow_len * 0.55
                if dim_len > arrow_len * 2.4:
                    ux = seg_dx / max(dim_len, 1e-9)
                    uy = seg_dy / max(dim_len, 1e-9)
                    inset = arrow_len * 0.9
                    line_head = {
                        "x": float(line_start["x"]) + ux * inset,
                        "y": float(line_start["y"]) + uy * inset,
                        "z": float(line_start.get("z", 0.0)),
                    }
                    line_tail = {
                        "x": float(line_end["x"]) - ux * inset,
                        "y": float(line_end["y"]) - uy * inset,
                        "z": float(line_end.get("z", 0.0)),
                    }
                out.append({"kind": "line", "start": line_head, "end": line_tail})
                in1 = (float(line_end["x"]) - float(line_start["x"]), float(line_end["y"]) - float(line_start["y"]))
                in2 = (float(line_start["x"]) - float(line_end["x"]), float(line_start["y"]) - float(line_end["y"]))
                arrow_block = geom.get("arrow_block")
                start_block = geom.get("arrow_block1") or arrow_block
                end_block = geom.get("arrow_block2") or arrow_block
                start_style = _normalize_arrow_style_name(start_block)
                end_style = _normalize_arrow_style_name(end_block)
                for tip, inward, style_name, style_block in (
                    (line_start, in1, start_style, start_block),
                    (line_end, in2, end_style, end_block),
                ):
                    if style_name == "archtick":
                        tick_seg = _arrow_marker_archtick_segment(tip, inward, max(arrow_len, 4.0))
                        if tick_seg:
                            out.append(
                                {
                                    "kind": "line",
                                    "start": tick_seg[0],
                                    "end": tick_seg[1],
                                    "subtype": "dim_arrow_tick",
                                    "arrow_style": style_name,
                                    "arrow_block": style_block,
                                }
                            )
                        continue
                    if style_name == "open":
                        open_lines = _arrow_marker_lines(tip, inward, arrow_len, arrow_half)
                        for line_a, line_b in open_lines:
                            out.append(
                                {
                                    "kind": "line",
                                    "start": line_a,
                                    "end": line_b,
                                    "subtype": "dim_arrow_open",
                                    "arrow_style": style_name,
                                    "arrow_block": style_block,
                                }
                            )
                        continue
                    if style_name == "dot":
                        dot_radius = max(1.2, min(arrow_len * 0.32, arrow_len))
                        dot_pts: List[Dict[str, float]] = []
                        steps = 14
                        tx = float(tip.get("x", 0.0))
                        ty = float(tip.get("y", 0.0))
                        tz = float(tip.get("z", 0.0))
                        for i in range(steps + 1):
                            a = math.pi * 2 * (i / steps)
                            dot_pts.append({"x": tx + dot_radius * math.cos(a), "y": ty + dot_radius * math.sin(a), "z": tz})
                        out.append(
                            {
                                "kind": "polygon",
                                "rings": [dot_pts],
                                "filled": True,
                                "pattern_name": "ARROW",
                                "arrow_fill": True,
                                "subtype": "dim_arrow_dot",
                                "arrow_style": style_name,
                                "arrow_block": style_block,
                            }
                        )
                        continue
                    tri = _arrow_marker_triangle_points(tip, inward, arrow_len, arrow_half)
                    if tri:
                        out.append(
                            {
                                "kind": "polygon",
                                "rings": [tri],
                                "filled": True,
                                "pattern_name": "ARROW",
                                "arrow_fill": True,
                                "subtype": "dim_arrow_fill",
                                "arrow_style": style_name,
                                "arrow_block": style_block,
                            }
                        )
            text = str(geom.get("text", "")).strip()
            text_pos = geom.get("text_position")
            if text and isinstance(text_pos, dict):
                text_height = geom.get("text_height")
                if not isinstance(text_height, (int, float)):
                    bbox = ent.get("bbox")
                    if isinstance(bbox, dict) and isinstance(bbox.get("min"), dict) and isinstance(bbox.get("max"), dict):
                        h = abs(float(bbox["max"]["y"]) - float(bbox["min"]["y"]))
                        text_height = max(1.0, h * 0.12)
                    else:
                        text_height = 20.0
                out.append(
                    {
                        "kind": "text",
                        "text": text,
                        "position": text_pos,
                        "height": float(text_height),
                        "actual_height": float(text_height),
                        "rotation": float(geom.get("rotation", 0.0)),
                        "width_factor": 1.0,
                        "oblique": 0.0,
                        "horizontal_mode": "kTextCenter",
                        "vertical_mode": "kTextMiddle",
                        "attachment": "",
                        "mirrored_x": False,
                        "mirrored_y": False,
                        "is_mtext": False,
                        "text_mask": True,
                        "text_mask_padding": 0.25,
                        "subtype": "dimension_text",
                    }
                )
            return out

        if et == "LEADER":
            points = geom.get("points")
            if isinstance(points, list):
                clean = [p for p in points if isinstance(p, dict)]
                if len(clean) >= 2:
                    out.append({"kind": "polyline", "points": clean, "closed": False})
                    if bool(geom.get("has_arrowhead", False)):
                        tip = clean[0]
                        toward = clean[1]
                        seg_len = _point_distance(tip, toward)
                        arrow_size_raw = geom.get("arrow_size")
                        if isinstance(arrow_size_raw, (int, float)) and math.isfinite(float(arrow_size_raw)) and float(arrow_size_raw) > 0:
                            arrow_len = max(3.0, min(160.0, float(arrow_size_raw)))
                        else:
                            arrow_len = max(6.0, min(80.0, seg_len * 0.25))
                        arrow_half = arrow_len * 0.5
                        inward = (float(toward["x"]) - float(tip["x"]), float(toward["y"]) - float(tip["y"]))
                        arrow_block = geom.get("arrow_block")
                        arrow_style = _normalize_arrow_style_name(arrow_block)
                        if arrow_style == "archtick":
                            tick_seg = _arrow_marker_archtick_segment(tip, inward, max(arrow_len, 4.0))
                            if tick_seg:
                                out.append(
                                    {
                                        "kind": "line",
                                        "start": tick_seg[0],
                                        "end": tick_seg[1],
                                        "subtype": "leader_arrow_tick",
                                        "arrow_style": arrow_style,
                                        "arrow_block": arrow_block,
                                    }
                                )
                        elif arrow_style == "open":
                            open_lines = _arrow_marker_lines(tip, inward, arrow_len, arrow_half)
                            for line_a, line_b in open_lines:
                                out.append(
                                    {
                                        "kind": "line",
                                        "start": line_a,
                                        "end": line_b,
                                        "subtype": "leader_arrow_open",
                                        "arrow_style": arrow_style,
                                        "arrow_block": arrow_block,
                                    }
                                )
                        else:
                            tri = _arrow_marker_triangle_points(tip, inward, arrow_len, arrow_half)
                            if tri:
                                out.append(
                                    {
                                        "kind": "polygon",
                                        "rings": [tri],
                                        "filled": True,
                                        "pattern_name": "ARROW",
                                        "arrow_fill": True,
                                        "subtype": "leader_arrow_fill",
                                        "arrow_style": arrow_style,
                                        "arrow_block": arrow_block,
                                    }
                                )
            return out

        if et == "WIPEOUT":
            vertices = geom.get("vertices")
            if isinstance(vertices, list):
                clean = [p for p in vertices if isinstance(p, dict)]
                if len(clean) >= 3:
                    out.append({"kind": "polygon", "rings": [clean], "filled": True, "pattern_name": "WIPEOUT", "wipeout": True})
            return out

        return out

    def _entity_with_primitives(self, ent: Dict[str, object]) -> Dict[str, object]:
        geom = ent.get("geom")
        if not isinstance(geom, dict):
            return ent
        out = dict(ent)
        geom_out = dict(geom)
        geom_out["source_type"] = str(geom_out.get("source_type") or str(ent.get("type", "")).upper())
        primitives = self._entity_primitives(ent)
        if primitives:
            geom_out["primitives"] = primitives
        out["geom"] = geom_out
        return out

    def _iter_space_entities(self, session: DwgDocSession, space_id: str):
        return session.entities_by_space.get(space_id, [])

    def _iter_space_block_refs(self, session: DwgDocSession, space_id: str):
        return session.block_refs_by_space.get(space_id, [])

    def _iter_entity_segments(self, ent: Dict[str, object]) -> List[Tuple[Dict[str, float], Dict[str, float]]]:
        segments: List[Tuple[Dict[str, float], Dict[str, float]]] = []
        for primitive in self._entity_primitives(ent):
            kind = str(primitive.get("kind", "")).lower()
            if kind == "line":
                start = primitive.get("start")
                end = primitive.get("end")
                if isinstance(start, dict) and isinstance(end, dict):
                    segments.append((start, end))
                continue
            if kind == "polyline":
                pts = primitive.get("points")
                if not isinstance(pts, list):
                    continue
                clean = [p for p in pts if isinstance(p, dict)]
                if len(clean) < 2:
                    continue
                for i in range(len(clean) - 1):
                    segments.append((clean[i], clean[i + 1]))
                if bool(primitive.get("closed", False)) and len(clean) > 2 and _point_distance(clean[0], clean[-1]) > 1e-6:
                    segments.append((clean[-1], clean[0]))
                continue
            if kind == "polygon":
                rings = primitive.get("rings")
                if not isinstance(rings, list):
                    continue
                for ring in rings:
                    if not isinstance(ring, list):
                        continue
                    clean = [p for p in ring if isinstance(p, dict)]
                    if len(clean) < 2:
                        continue
                    for i in range(len(clean) - 1):
                        segments.append((clean[i], clean[i + 1]))
                    if _point_distance(clean[0], clean[-1]) > 1e-6:
                        segments.append((clean[-1], clean[0]))
                continue
            if kind in ("circle", "arc"):
                center = primitive.get("center")
                radius = primitive.get("radius")
                if not isinstance(center, dict) or not isinstance(radius, (int, float)) or float(radius) <= 0:
                    continue
                sa = float(primitive.get("start_angle", 0.0 if kind == "arc" else 0.0))
                ea = float(primitive.get("end_angle", 360.0 if kind == "arc" else 360.0))
                if kind == "arc" and isinstance(primitive.get("start"), dict) and isinstance(primitive.get("end"), dict):
                    sa = _point_angle_from_center(center, primitive.get("start"))  # type: ignore[arg-type]
                    ea = _point_angle_from_center(center, primitive.get("end"))  # type: ignore[arg-type]
                delta = ((ea - sa) % 360.0 + 360.0) % 360.0
                if kind == "arc" and delta <= 1e-9:
                    delta = 360.0
                steps = max(8, min(256, int(abs(delta) / 12.0) + 1))
                pts: List[Dict[str, float]] = []
                for i in range(steps + 1):
                    t = i / max(1, steps)
                    ang = math.radians(sa + delta * t)
                    pts.append(
                        {
                            "x": float(center["x"]) + float(radius) * math.cos(ang),
                            "y": float(center["y"]) + float(radius) * math.sin(ang),
                            "z": float(center.get("z", 0.0)),
                        }
                    )
                for i in range(len(pts) - 1):
                    segments.append((pts[i], pts[i + 1]))
                continue
            if kind == "ellipse":
                center = primitive.get("center")
                rx = primitive.get("rx")
                ry = primitive.get("ry")
                if isinstance(center, dict) and isinstance(rx, (int, float)) and isinstance(ry, (int, float)):
                    start_a = float(primitive.get("start_angle", 0.0))
                    end_a = float(primitive.get("end_angle", 360.0))
                    rot = math.radians(float(primitive.get("rotation", 0.0)))
                    cos_r = math.cos(rot)
                    sin_r = math.sin(rot)
                    delta = ((end_a - start_a) % 360.0 + 360.0) % 360.0
                    if delta <= 1e-9:
                        delta = 360.0
                    steps = max(8, min(256, int(abs(delta) / 10.0) + 1))
                    pts: List[Dict[str, float]] = []
                    for i in range(steps + 1):
                        t = i / max(1, steps)
                        ang = math.radians(start_a + delta * t)
                        ex = float(rx) * math.cos(ang)
                        ey = float(ry) * math.sin(ang)
                        pts.append(
                            {
                                "x": float(center["x"]) + ex * cos_r - ey * sin_r,
                                "y": float(center["y"]) + ex * sin_r + ey * cos_r,
                                "z": float(center.get("z", 0.0)),
                            }
                        )
                    for i in range(len(pts) - 1):
                        segments.append((pts[i], pts[i + 1]))
        return segments

    def _iter_entity_text_points(self, ent: Dict[str, object]) -> List[Dict[str, float]]:
        points: List[Dict[str, float]] = []
        for primitive in self._entity_primitives(ent):
            if str(primitive.get("kind", "")).lower() != "text":
                continue
            pos = primitive.get("position")
            if isinstance(pos, dict):
                points.append(pos)
        return points

    def pick(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/pick", payload)

        space_id = payload.get("space_id") if isinstance(payload.get("space_id"), str) else session.current_space
        point = payload.get("point") if isinstance(payload.get("point"), dict) else None
        tol = float(payload.get("tolerance", 8.0))
        selection_scope = str(payload.get("selection_scope", "entity") or "entity").strip().lower()
        parent_block_id = payload.get("parent_block_id") if isinstance(payload.get("parent_block_id"), str) else None
        if not point or "x" not in point or "y" not in point:
            return {"doc_id": doc_id, "space_id": space_id, "selection_scope": selection_scope, "picked": []}

        if selection_scope == "block":
            best_block = None
            best_dist = float("inf")
            for block_ref in self._iter_space_block_refs(session, space_id):
                dist = _distance_to_bbox_2d(point, block_ref.get("bbox"))
                if dist is None:
                    continue
                if dist < best_dist:
                    best_dist = dist
                    best_block = block_ref
            picked: List[Dict[str, object]] = []
            if best_block is not None and best_dist <= tol:
                picked.append(
                    {
                        "entity_id": best_block.get("id"),
                        "distance": best_dist,
                        "picked_kind": "block",
                        "parent_block_id": best_block.get("parent_block_id"),
                    }
                )
            return {"doc_id": doc_id, "space_id": space_id, "selection_scope": "block", "picked": picked}

        best = None
        best_dist = float("inf")
        for ent in self._iter_space_entities(session, space_id):
            if parent_block_id is not None and str(ent.get("parent_block_id") or "") != parent_block_id:
                continue
            etype = str(ent.get("type", "")).upper()
            geom = ent.get("geom", {})
            d: Optional[float] = None

            for a, b in self._iter_entity_segments(ent):
                dist, _, _ = _distance_to_segment(point, a, b)
                if d is None or dist < d:
                    d = dist

            if etype == "CIRCLE":
                center = geom.get("center")
                radius = geom.get("radius")
                if isinstance(center, dict) and isinstance(radius, (int, float)):
                    radial = abs(_point_distance(point, center) - float(radius))
                    if d is None or radial < d:
                        d = radial
            elif etype == "ARC":
                center = geom.get("center")
                radius = geom.get("radius")
                if isinstance(center, dict) and isinstance(radius, (int, float)):
                    radial_dist = abs(_point_distance(point, center) - float(radius))
                    start = geom.get("start")
                    end = geom.get("end")
                    start_angle = geom.get("start_angle")
                    end_angle = geom.get("end_angle")
                    if isinstance(start_angle, (int, float)) and isinstance(end_angle, (int, float)):
                        a = _point_angle_from_center(center, point)
                        if not _is_angle_on_arc(a, float(start_angle), float(end_angle)):
                            endpoint_distances = []
                            if isinstance(start, dict):
                                endpoint_distances.append(_point_distance(point, start))
                            if isinstance(end, dict):
                                endpoint_distances.append(_point_distance(point, end))
                            if endpoint_distances:
                                radial_dist = min(radial_dist, min(endpoint_distances))
                    if d is None or radial_dist < d:
                        d = radial_dist
            elif etype == "POINT":
                pos = geom.get("position")
                if isinstance(pos, dict):
                    pt_dist = _point_distance(point, pos)
                    if d is None or pt_dist < d:
                        d = pt_dist

            text_points = self._iter_entity_text_points(ent)
            for text_point in text_points:
                td = _point_distance(point, text_point)
                if d is None or td < d:
                    d = td

            # Text-like entities should be pickable across their rendered extents, not only insertion point.
            if text_points:
                bbox_dist = _distance_to_bbox_2d(point, ent.get("bbox"))
                if bbox_dist is not None and (d is None or bbox_dist < d):
                    d = bbox_dist

            if d is not None and d < best_dist:
                best_dist = d
                best = ent

        picked: List[Dict[str, object]] = []
        if best is not None and best_dist <= tol:
            picked.append(
                {
                    "entity_id": best["id"],
                    "distance": best_dist,
                    "picked_kind": "entity",
                    "parent_block_id": best.get("parent_block_id"),
                }
            )

        return {"doc_id": doc_id, "space_id": space_id, "selection_scope": "entity", "picked": picked}

    def snap(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/snap", payload)

        space_id = payload.get("space_id") if isinstance(payload.get("space_id"), str) else session.current_space
        point = payload.get("point") if isinstance(payload.get("point"), dict) else None
        modes = payload.get("modes") if isinstance(payload.get("modes"), list) else ["endpoint", "midpoint", "center"]
        tol = float(payload.get("tolerance", 10.0))
        if not point or "x" not in point or "y" not in point:
            return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": None, "mode": None}

        candidates: List[Tuple[float, Dict[str, float], str]] = []
        for ent in self._iter_space_entities(session, space_id):
            etype = str(ent.get("type", "")).upper()
            geom = ent.get("geom", {})

            for a, b in self._iter_entity_segments(ent):
                if "endpoint" in modes:
                    candidates.append((_point_distance(point, a), a, "endpoint"))
                    candidates.append((_point_distance(point, b), b, "endpoint"))
                if "midpoint" in modes:
                    mid = {
                        "x": (float(a["x"]) + float(b["x"])) * 0.5,
                        "y": (float(a["y"]) + float(b["y"])) * 0.5,
                        "z": 0.0,
                    }
                    candidates.append((_point_distance(point, mid), mid, "midpoint"))

            if etype == "CIRCLE" and "center" in modes:
                center = geom.get("center")
                if isinstance(center, dict):
                    candidates.append((_point_distance(point, center), center, "center"))
            elif etype == "ARC":
                center = geom.get("center")
                if "center" in modes and isinstance(center, dict):
                    candidates.append((_point_distance(point, center), center, "center"))
                if "endpoint" in modes:
                    start = geom.get("start")
                    end = geom.get("end")
                    if isinstance(start, dict):
                        candidates.append((_point_distance(point, start), start, "endpoint"))
                    if isinstance(end, dict):
                        candidates.append((_point_distance(point, end), end, "endpoint"))
            elif etype == "POINT":
                pos = geom.get("position")
                if "endpoint" in modes and isinstance(pos, dict):
                    candidates.append((_point_distance(point, pos), pos, "endpoint"))

        if not candidates:
            return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": point, "mode": None}

        best = min(candidates, key=lambda x: x[0])
        if best[0] > tol:
            return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": point, "mode": None}
        return {"doc_id": doc_id, "space_id": space_id, "snapped": True, "point": best[1], "mode": best[2]}

    def measure(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/measure", payload)

        measure_type = str(payload.get("type", "distance"))
        if measure_type == "distance":
            p1 = payload.get("p1")
            p2 = payload.get("p2")
            if not isinstance(p1, dict) or not isinstance(p2, dict):
                return {"doc_id": doc_id, "type": "distance", "ok": False, "error": "p1/p2 required"}
            value = _point_distance(p1, p2)
            return {"doc_id": doc_id, "type": "distance", "ok": True, "value": value, "unit": "drawing_unit"}

        if measure_type == "angle":
            p1 = payload.get("p1")
            vertex = payload.get("vertex")
            p2 = payload.get("p2")
            if not isinstance(p1, dict) or not isinstance(vertex, dict) or not isinstance(p2, dict):
                return {"doc_id": doc_id, "type": "angle", "ok": False, "error": "p1/vertex/p2 required"}
            value = _angle_deg(p1, vertex, p2)
            if value is None:
                return {"doc_id": doc_id, "type": "angle", "ok": False, "error": "invalid points"}
            return {"doc_id": doc_id, "type": "angle", "ok": True, "value": value, "unit": "degree"}

        return {"doc_id": doc_id, "type": measure_type, "ok": False, "error": "unsupported measure type"}

    def get_entity(self, doc_id: str, entity_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            entity_path = f"/entity/{urllib_parse.quote(entity_id, safe='')}"
            return self._external_doc_request(session, "GET", entity_path)

        for space_entities in session.entities_by_space.values():
            for ent in space_entities:
                if ent.get("id") == entity_id:
                    return {"doc_id": doc_id, "entity": self._entity_with_primitives(ent)}
        for space_block_refs in session.block_refs_by_space.values():
            for ref in space_block_refs:
                if ref.get("id") == entity_id:
                    return {"doc_id": doc_id, "entity": self._entity_with_primitives(ref)}
        return {"doc_id": doc_id, "entity": None}

    def cleanup_expired(self, max_age_sec: int = 3600) -> int:
        now = time.time()
        remove_ids = [
            doc_id
            for doc_id, sess in self.sessions.items()
            if (now - sess.updated_at) > max_age_sec
        ]
        for doc_id in remove_ids:
            self.sessions.pop(doc_id, None)
        return len(remove_ids)
