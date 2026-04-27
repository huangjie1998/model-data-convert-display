"""Shared low-level helpers for DWG service core.

These functions are intentionally side-effect free and are imported by
``dwg_service_core`` for API/session orchestration.
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

Affine2D = Tuple[float, float, float, float, float, float]
DWG_CORE_PARSER_REV = "2026-04-27-r27"
DEFAULT_LINEWEIGHT_MM = 0.25
TEXT_ENTITY_TYPES = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}


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


def _is_text_entity_type(ent_type: object) -> bool:
    return str(ent_type or "").strip().upper() in TEXT_ENTITY_TYPES


def _normalize_dimension_kind(dim_kind: object) -> str:
    raw = str(dim_kind or "").strip().lower()
    if raw in ("aligned", "rotated", "angular", "radius", "diameter", "ordinate", "arc_length"):
        return raw
    return "dimension"


def _dimension_subtype_from_kind(dim_kind: object) -> str:
    kind = _normalize_dimension_kind(dim_kind)
    if kind == "dimension":
        return "DIM_GENERIC"
    return f"DIM_{kind.upper()}"


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


def _normalize_dimblk_token(raw: object) -> str:
    s = str(raw or "").strip().lower()
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]+", "", s)


def _normalize_arrow_style_name(raw: object) -> str:
    s = str(raw or "").strip().lower()
    token = _normalize_dimblk_token(raw)
    if not s or s in ("null", "none"):
        return "closed_filled"
    if token in ("none", "_none", "non"):
        return "none"
    if "none" in token and "open" not in token:
        return "none"
    if "archtick" in s or "architecturaltick" in token or "tick" in s or "oblique" in s:
        return "archtick"
    if "slash" in token:
        return "archtick"
    if "integral" in token:
        return "archtick"
    if "tshape" in token or token == "t":
        return "archtick"
    if "origin" in token or "dot" in token:
        return "dot"
    if "circle" in token:
        return "dot"
    if "box" in token or "square" in token or "diamond" in token:
        if "open" in token or "blank" in token:
            return "closed_blank"
        return "closed_filled"
    if "datumtriangle" in token:
        if "filled" in token:
            return "closed_filled"
        return "closed_blank"
    if "rightangle" in token:
        return "open"
    if "closedblank" in token or "blank" in token:
        return "closed_blank"
    if "open" in s and "filled" not in s:
        return "open"
    return "closed_filled"


def _clean_oda_text_value(raw: object) -> str:
    s = str(raw or "")
    if s == '""':
        return ""

    def _decode_unicode_escape(match: re.Match[str]) -> str:
        code_hex = match.group(1)
        try:
            cp = int(code_hex, 16)
            if 0 <= cp <= 0x10FFFF:
                return chr(cp)
        except Exception:
            pass
        return ""

    def _decode_stacked_text(match: re.Match[str]) -> str:
        token = str(match.group(1) or "").strip()
        if not token:
            return ""
        sep_match = re.search(r"[\^#/]", token)
        if not sep_match:
            return token
        sep = sep_match.group(0)
        idx = token.find(sep)
        if idx <= 0 or idx >= len(token) - 1:
            return token
        top = token[:idx].strip()
        bottom = token[idx + 1 :].strip()
        if not top and not bottom:
            return ""
        if not bottom:
            return top
        if not top:
            return bottom
        return f"{top}/{bottom}"

    s = re.sub(r"\\U\+([0-9A-Fa-f]{4,8})", _decode_unicode_escape, s)
    s = re.sub(r"\\S([^;]*);", _decode_stacked_text, s, flags=re.IGNORECASE)
    s = s.replace("\\P", "\n").replace("\\p", "\n")
    s = re.sub(r"%%c", "⌀", s, flags=re.IGNORECASE)
    s = re.sub(r"%%d", "°", s, flags=re.IGNORECASE)
    s = re.sub(r"%%p", "±", s, flags=re.IGNORECASE)
    # Remove most ODA/CAD inline controls (keep \P and \S which are handled above).
    s = re.sub(r"\\(?![Pp]|[Ss]|U\+)[A-Za-z][^;]*;", "", s)
    # Common ODA residue: "\<>" or "\123.45" after control stripping.
    s = re.sub(r"\\(?=[<>0-9+\-\.])", "", s)
    s = s.replace("\\~", " ")
    s = s.replace("{", "").replace("}", "")
    s = s.replace("\r", "")
    s = s.replace("\\\\", "\\")
    return s.strip().strip('"')


def _format_dimension_measurement_text(value: object) -> str:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return f"{float(value):.4f}"
    return ""


def _resolve_dimension_display_text(geom: Dict[str, object]) -> str:
    fallback_measure = _format_dimension_measurement_text(geom.get("measurement"))
    for key in (
        "text",
        "formatted_measurement",
        "display_text",
        "override_text",
        "contents",
        "plain_text",
        "value",
        "user_text",
        "text_override",
    ):
        cleaned = _clean_oda_text_value(geom.get(key))
        if not cleaned:
            continue
        normalized = cleaned.replace("<>", fallback_measure) if fallback_measure else cleaned
        compact = re.sub(r"\s+", "", normalized)
        if not compact or compact == "<>":
            continue
        return normalized
    return fallback_measure


def _resolve_dimension_text_color(
    *,
    override_raw: object,
    style_rec: Dict[str, object],
    dim_defaults: Dict[str, object],
    style_obj: Dict[str, object],
) -> Optional[str]:
    preferred_candidates = [
        override_raw,
        style_rec.get("dimclrt"),
        dim_defaults.get("dimclrt"),
    ]
    inherited_candidates = [
        style_obj.get("effective_color_rgb"),
        style_obj.get("effective_color"),
        style_obj.get("color"),
        style_obj.get("effective_color_index"),
        style_obj.get("color_index"),
    ]
    for candidate in preferred_candidates:
        if isinstance(candidate, (int, float)) and math.isfinite(float(candidate)):
            n = int(candidate)
            if n in (0, 256):
                continue
        if isinstance(candidate, str):
            token = candidate.strip().lower()
            if token in ("", "bylayer", "byblock", "default", "foreground"):
                continue
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    for candidate in inherited_candidates:
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    return None


def _resolve_dimension_text_mask_color(
    *,
    override_raw: object,
    style_rec: Dict[str, object],
    dim_defaults: Dict[str, object],
    style_obj: Dict[str, object],
) -> Optional[str]:
    preferred_candidates = [
        override_raw,
        style_rec.get("dimtfillclr"),
        dim_defaults.get("dimtfillclr"),
    ]
    inherited_candidates = [
        style_obj.get("effective_color_rgb"),
        style_obj.get("effective_color"),
        style_obj.get("color"),
        style_obj.get("effective_color_index"),
        style_obj.get("color_index"),
    ]
    for candidate in preferred_candidates:
        if isinstance(candidate, (int, float)) and math.isfinite(float(candidate)):
            n = int(candidate)
            if n in (0, 256):
                continue
        if isinstance(candidate, str):
            token = candidate.strip().lower()
            if token in ("", "bylayer", "byblock", "default", "foreground"):
                continue
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    for candidate in inherited_candidates:
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    return str(_aci_to_rgb_decimal(7))


def _resolve_dimension_text_mask_mode(
    *,
    override_raw: object,
    style_rec: Dict[str, object],
    dim_defaults: Dict[str, object],
) -> int:
    for candidate in (override_raw, style_rec.get("dimtfill"), dim_defaults.get("dimtfill")):
        parsed = _parse_int_value(candidate)
        if parsed is not None:
            return max(0, parsed)
    return 0


def _resolve_entity_text_color(ent: Dict[str, object], geom: Dict[str, object]) -> Optional[str]:
    style_obj = ent.get("style", {}) if isinstance(ent.get("style"), dict) else {}
    candidates = [
        geom.get("text_color"),
        geom.get("color"),
        style_obj.get("text_color"),
        style_obj.get("effective_color_rgb"),
        style_obj.get("effective_color"),
        style_obj.get("color"),
        style_obj.get("effective_color_index"),
        style_obj.get("color_index"),
    ]
    for candidate in candidates:
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    return None


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


def _line_intersection_2d(
    a1: Dict[str, float],
    a2: Dict[str, float],
    b1: Dict[str, float],
    b2: Dict[str, float],
) -> Optional[Dict[str, float]]:
    ax1 = float(a1.get("x", 0.0))
    ay1 = float(a1.get("y", 0.0))
    ax2 = float(a2.get("x", 0.0))
    ay2 = float(a2.get("y", 0.0))
    bx1 = float(b1.get("x", 0.0))
    by1 = float(b1.get("y", 0.0))
    bx2 = float(b2.get("x", 0.0))
    by2 = float(b2.get("y", 0.0))
    da_x = ax2 - ax1
    da_y = ay2 - ay1
    db_x = bx2 - bx1
    db_y = by2 - by1
    den = da_x * db_y - da_y * db_x
    if abs(den) <= 1e-9:
        return None
    dx = bx1 - ax1
    dy = by1 - ay1
    t = (dx * db_y - dy * db_x) / den
    return {
        "x": ax1 + da_x * t,
        "y": ay1 + da_y * t,
        "z": float(a1.get("z", b1.get("z", 0.0))),
    }


def _point_on_ray(origin: Dict[str, float], through: Dict[str, float], length: float) -> Dict[str, float]:
    ox = float(origin.get("x", 0.0))
    oy = float(origin.get("y", 0.0))
    tx = float(through.get("x", 0.0))
    ty = float(through.get("y", 0.0))
    dx = tx - ox
    dy = ty - oy
    dn = math.hypot(dx, dy)
    if dn <= 1e-9:
        return {"x": ox, "y": oy, "z": float(origin.get("z", 0.0))}
    scale = float(length) / dn
    return {
        "x": ox + dx * scale,
        "y": oy + dy * scale,
        "z": float(origin.get("z", through.get("z", 0.0))),
    }


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


def _resolve_arrow_length(raw_size: object, base_len: float) -> float:
    base = float(base_len) if isinstance(base_len, (int, float)) and math.isfinite(float(base_len)) else 0.0
    base = max(0.0, base)
    # Keep very small drawings readable while respecting CAD-provided dimasz.
    soft_min = max(1e-6, base * 0.005)
    # Prevent arrows from swallowing the whole segment.
    soft_max = max(soft_min * 4.0, base * 0.45) if base > 1e-6 else 1e9
    if isinstance(raw_size, (int, float)) and math.isfinite(float(raw_size)) and float(raw_size) > 0:
        wanted = float(raw_size)
        return max(soft_min, min(soft_max, wanted))
    if base > 1e-6:
        return max(soft_min, min(soft_max, base * 0.03))
    return 1.0


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


def _parse_true_rgb_decimal(value: object) -> Optional[str]:
    s = str(value or "").strip()
    if not s:
        return None
    m = re.search(
        r"\br\s*[:=]?\s*([0-9]{1,3})\D+\bg\s*[:=]?\s*([0-9]{1,3})\D+\bb\s*[:=]?\s*([0-9]{1,3})",
        s,
        flags=re.IGNORECASE,
    )
    if not m:
        m = re.search(
            r"\br\s*([0-9]{1,3})\s*[,; ]+\s*g\s*([0-9]{1,3})\s*[,; ]+\s*b\s*([0-9]{1,3})",
            s,
            flags=re.IGNORECASE,
        )
    if not m:
        m = re.search(
            r"\br\s*[:=]\s*([0-9]{1,3}).*?\bg\s*[:=]\s*([0-9]{1,3}).*?\bb\s*[:=]\s*([0-9]{1,3})",
            s,
            flags=re.IGNORECASE,
        )
    if not m:
        return None
    try:
        r = max(0, min(255, int(m.group(1))))
        g = max(0, min(255, int(m.group(2))))
        b = max(0, min(255, int(m.group(3))))
    except Exception:
        return None
    return str((r << 16) | (g << 8) | b)


def _parse_int_value(value: object) -> Optional[int]:
    s = str(value or "").strip()
    if not s:
        return None
    if re.fullmatch(r"[-+]?\d+", s):
        try:
            return int(s)
        except Exception:
            return None
    try:
        v = float(s)
    except Exception:
        return None
    if not math.isfinite(v):
        return None
    return int(v)


def _normalize_dim_var_label(label: object) -> Optional[str]:
    raw = re.sub(r"[^a-z0-9]+", "", str(label or "").strip().lower())
    if not raw:
        return None

    alias: Dict[str, str] = {
        "textstyle": "dimtxsty",
        "dimensiontextcolor": "dimclrt",
        "backgroundtextcolor": "dimtfillclr",
        "backgroundtextflags": "dimtfill",
        "backgroundfillflags": "dimtfill",
        "backgroundfillcolor": "dimtfillclr",
        # Arrow / symbol aliases
        "arrow1": "dimblk1",
        "arrow2": "dimblk2",
        "arrowblock1": "dimblk1",
        "arrowblock2": "dimblk2",
        "firstarrow": "dimblk1",
        "secondarrow": "dimblk2",
        "firstarrowhead": "dimblk1",
        "secondarrowhead": "dimblk2",
        # Linetype aliases
        "dimensionlinetype": "dimltype",
        "dimensionlinelinetype": "dimltype",
        "extensionline1linetype": "dimltex1",
        "extensionline2linetype": "dimltex2",
        "extensionlineonelinetype": "dimltex1",
        "extensionlinetwolinetype": "dimltex2",
        # Fixed extension line aliases
        "fixedextensionline": "dimfxlenon",
        "fixedextensionlines": "dimfxlenon",
        "fixedextensionlinelength": "dimfxlen",
        "fixedlengthofextensionlines": "dimfxlen",
        # Text behavior aliases
        "textmovement": "dimtmove",
        "textmove": "dimtmove",
        "movetext": "dimtmove",
        "textdirection": "dimtxtdirection",
        "textviewdirection": "dimtxtdirection",
        "textorientation": "dimtxtdirection",
        "fractiontype": "dimfrac",
        "fractionformat": "dimfrac",
    }
    if raw in alias:
        return alias[raw]

    if raw in ("dimensionstyle", "dimstyle"):
        return None
    if raw.startswith("dim") and len(raw) > 3:
        return raw
    return None


def _parse_dim_var_value(key: str, value: object) -> Optional[object]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if key in ("dimblk", "dimblk1", "dimblk2", "dimldrblk"):
        return _normalize_dimblk_name(raw)
    if key in ("dimtxsty",):
        return raw

    lower = raw.lower()
    if lower in ("true", "yes", "on", "ktrue"):
        return True
    if lower in ("false", "no", "off", "kfalse"):
        return False

    parsed_int = _parse_int_value(raw)
    if parsed_int is not None and re.fullmatch(r"[-+]?\d+", raw):
        return parsed_int

    parsed_float = _parse_float_value(raw)
    if isinstance(parsed_float, float) and math.isfinite(parsed_float):
        return parsed_float

    return raw


def _normalize_dim_var_map(source: object) -> Dict[str, object]:
    if not isinstance(source, dict):
        return {}
    out: Dict[str, object] = {}
    for k, v in source.items():
        nk = _normalize_dim_var_label(k)
        if not nk:
            continue
        parsed = _parse_dim_var_value(nk, v)
        if parsed is None:
            continue
        out[nk] = parsed
    return out


def _aci_to_rgb_decimal(aci: int) -> int:
    idx = int(aci)
    if idx in (0, 256):
        idx = 7
    if idx < 0:
        idx = 7
    basic = {
        1: 0xFF0000,
        2: 0xFFFF00,
        3: 0x00FF00,
        4: 0x00FFFF,
        5: 0x0000FF,
        6: 0xFF00FF,
        7: 0xFFFFFF,
        8: 0x7F7F7F,
        9: 0xC0C0C0,
    }
    return basic.get(idx, 0xCCCCCC)


def _resolve_rgb_color_decimal(raw: object, fallback_aci: Optional[int] = None) -> Optional[str]:
    if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
        n = int(raw)
        if 0 <= n <= 256:
            return str(_aci_to_rgb_decimal(n))
        if n < 0:
            return str(_aci_to_rgb_decimal(7))
        return str(max(0, min(0xFFFFFF, n)))

    s = str(raw or "").strip()
    if s:
        sl = s.lower()
        true_rgb = _parse_true_rgb_decimal(s)
        if true_rgb:
            return true_rgb
        if sl.startswith("#"):
            try:
                return str(max(0, min(0xFFFFFF, int(sl[1:], 16))))
            except Exception:
                pass
        if sl.startswith("0x"):
            try:
                return str(max(0, min(0xFFFFFF, int(sl[2:], 16))))
            except Exception:
                pass
        if re.fullmatch(r"\d+", s):
            try:
                n = int(s)
                if 0 <= n <= 256:
                    return str(_aci_to_rgb_decimal(n))
                return str(max(0, min(0xFFFFFF, n)))
            except Exception:
                pass
        aci = _parse_aci_from_color_name(s)
        if aci is not None:
            return str(_aci_to_rgb_decimal(aci))

    if fallback_aci is not None:
        return str(_aci_to_rgb_decimal(fallback_aci))
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

__all__ = [
    name
    for name in globals()
    if (name.startswith("_") and not name.startswith("__"))
    or name in {"Affine2D", "DWG_CORE_PARSER_REV", "DEFAULT_LINEWEIGHT_MM", "TEXT_ENTITY_TYPES"}
]
