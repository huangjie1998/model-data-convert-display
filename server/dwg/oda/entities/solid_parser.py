from __future__ import annotations

import math
from typing import Dict, List

from server.dwg.oda.entities.common import NOT_HANDLED


SOLID_ODA_TYPES = ("acdbsolid", "acdbtrace", "acdbface", "acdb3dface")


def build_solid_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") not in SOLID_ODA_TYPES:
        return NOT_HANDLED

    named_points = state.get("named_points") or {}
    min_pt = state.get("min_pt")
    max_pt = state.get("max_pt")
    bbox = state.get("bbox")
    ordered_keys = ("first point", "second point", "third point", "fourth point", "point 0", "point 1", "point 2", "point 3")
    pts: List[Dict[str, float]] = []
    degenerate_solid_reconstructed = False
    for key in ordered_keys:
        point = named_points.get(key)
        if isinstance(point, dict) and (not pts or context.point_distance(pts[-1], point) > 1e-6):
            pts.append(point)
    if len(pts) < 3:
        unique_pts: List[Dict[str, float]] = []
        for point in pts:
            if not any(context.point_distance(point, seen) <= 1e-6 for seen in unique_pts):
                unique_pts.append(point)
        if len(unique_pts) < 2 and min_pt and max_pt and context.point_distance(min_pt, max_pt) > 1e-9:
            unique_pts = [min_pt, max_pt]
        if len(unique_pts) < 2:
            return None
        p0 = unique_pts[0]
        p1 = unique_pts[-1]
        dx = float(p1["x"]) - float(p0["x"])
        dy = float(p1["y"]) - float(p0["y"])
        seg_len = math.hypot(dx, dy)
        if seg_len <= 1e-9:
            return None
        half_width = max(seg_len * 0.03, 1e-6)
        nx = -dy / seg_len * half_width
        ny = dx / seg_len * half_width
        z0 = float(p0.get("z", 0.0))
        z1 = float(p1.get("z", z0))
        pts = [
            {"x": float(p0["x"]) + nx, "y": float(p0["y"]) + ny, "z": z0},
            {"x": float(p1["x"]) + nx, "y": float(p1["y"]) + ny, "z": z1},
            {"x": float(p1["x"]) - nx, "y": float(p1["y"]) - ny, "z": z1},
            {"x": float(p0["x"]) - nx, "y": float(p0["y"]) - ny, "z": z0},
            {"x": float(p0["x"]) + nx, "y": float(p0["y"]) + ny, "z": z0},
        ]
        degenerate_solid_reconstructed = True
    if context.point_distance(pts[0], pts[-1]) > 1e-6:
        pts.append(dict(pts[0]))
    if bbox is None:
        bbox = context.bbox_from_points(pts)
    return {
        "id": state.get("handle"),
        "type": "SOLID",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"vertices": pts, "closed": True, "solid_fill": True, "degenerate_reconstructed": degenerate_solid_reconstructed},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
