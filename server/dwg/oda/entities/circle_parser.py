from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_circle_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbcircle":
        return NOT_HANDLED

    center_pt = state.get("center_pt")
    radius = state.get("radius")
    if center_pt is None or radius is None:
        return None
    bbox = state.get("bbox")
    if bbox is None:
        bbox = {
            "min": {"x": center_pt["x"] - radius, "y": center_pt["y"] - radius, "z": center_pt.get("z", 0.0)},
            "max": {"x": center_pt["x"] + radius, "y": center_pt["y"] + radius, "z": center_pt.get("z", 0.0)},
        }
    return {
        "id": state.get("handle"),
        "type": "CIRCLE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"center": center_pt, "radius": radius},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
