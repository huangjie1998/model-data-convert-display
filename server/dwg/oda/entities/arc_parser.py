from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_arc_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbarc":
        return NOT_HANDLED

    center_pt = state.get("center_pt")
    radius = state.get("radius")
    if center_pt is None or radius is None:
        return None

    start_pt = state.get("start_pt")
    end_pt = state.get("end_pt")
    start_angle = state.get("start_angle")
    end_angle = state.get("end_angle")
    if start_pt is None and start_angle is not None:
        rad = math.radians(start_angle)
        start_pt = {"x": center_pt["x"] + radius * math.cos(rad), "y": center_pt["y"] + radius * math.sin(rad), "z": center_pt.get("z", 0.0)}
    if end_pt is None and end_angle is not None:
        rad = math.radians(end_angle)
        end_pt = {"x": center_pt["x"] + radius * math.cos(rad), "y": center_pt["y"] + radius * math.sin(rad), "z": center_pt.get("z", 0.0)}

    bbox = state.get("bbox")
    if bbox is None:
        pts = [center_pt]
        if start_pt:
            pts.append(start_pt)
        if end_pt:
            pts.append(end_pt)
        bbox = context.bbox_from_points(pts)

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
        "id": state.get("handle"),
        "type": "ARC",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": geom,
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
