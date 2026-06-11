"""Hatch geometry helpers for DWG parsing."""
from __future__ import annotations

import math
from typing import Dict, List, Optional

from server.dwg.common.geometry import _normalize_angle_deg, _point_angle_from_center, _point_distance


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


__all__ = ["_build_hatch_loop_points_from_edges"]
