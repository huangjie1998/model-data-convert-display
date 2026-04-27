from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_spline_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbspline":
        return NOT_HANDLED

    points = list(state.get("spline_points") or [])
    start_pt = state.get("start_pt")
    end_pt = state.get("end_pt")
    if len(points) < 2:
        if isinstance(start_pt, dict):
            points.append(start_pt)
        if isinstance(end_pt, dict):
            points.append(end_pt)
    if len(points) < 2:
        return None
    bbox = state.get("bbox")
    if bbox is None:
        bbox = context.bbox_from_points(points)
    return {
        "id": state.get("handle"),
        "type": "SPLINE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"points": points},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
