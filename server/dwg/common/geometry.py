"""Geometry helpers for DWG parsing."""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple


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


__all__ = [
    "_angle_deg",
    "_bbox_from_points",
    "_distance_to_bbox_2d",
    "_distance_to_segment",
    "_is_angle_on_arc",
    "_line_intersection_2d",
    "_line_segment_from_bbox",
    "_line_segment_from_bbox_and_origin",
    "_point_angle_from_center",
    "_point_distance",
    "_point_on_ray",
]
