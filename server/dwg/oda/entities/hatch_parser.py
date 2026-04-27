from __future__ import annotations

from typing import Dict, List

from server.dwg.oda.entities.common import NOT_HANDLED


def build_hatch_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbhatch":
        return NOT_HANDLED

    hatch_loops = state.get("hatch_loops") or []
    min_pt = state.get("min_pt")
    max_pt = state.get("max_pt")
    bbox = state.get("bbox")
    loops_out: List[Dict[str, object]] = []
    for loop in hatch_loops:
        if not isinstance(loop, dict):
            continue
        clean_points = context.build_hatch_loop_points_from_edges(loop)
        if len(clean_points) < 2:
            continue
        if context.point_distance(clean_points[0], clean_points[-1]) > 1e-6:
            clean_points.append(dict(clean_points[0]))
        loops_out.append({"kind": loop.get("kind", "kExternal"), "points": clean_points, "closed": True})
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
        for loop in loops_out:
            pts = loop.get("points")
            if isinstance(pts, list):
                all_pts.extend([point for point in pts if isinstance(point, dict)])
        bbox = context.bbox_from_points(all_pts)
    return {
        "id": state.get("handle"),
        "type": "HATCH",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {
            "loops": loops_out,
            "solid_fill": bool(state.get("hatch_solid_fill")),
            "pattern_name": state.get("hatch_pattern_name") or "SOLID",
            "pattern_angle": state.get("hatch_pattern_angle"),
            "pattern_scale": state.get("hatch_pattern_scale"),
            "pattern_spacing": state.get("hatch_pattern_spacing"),
        },
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
