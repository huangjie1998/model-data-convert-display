from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_point_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    et = str(state.get("et") or "")
    if et != "acdbpoint":
        return NOT_HANDLED

    origin_pt = state.get("origin_pt")
    center_pt = state.get("center_pt")
    min_pt = state.get("min_pt")
    max_pt = state.get("max_pt")
    bbox = state.get("bbox")
    pos = origin_pt or center_pt
    if pos is None and min_pt and max_pt:
        pos = {"x": (min_pt["x"] + max_pt["x"]) * 0.5, "y": (min_pt["y"] + max_pt["y"]) * 0.5, "z": min_pt.get("z", 0.0)}
    if pos is None:
        return None
    if bbox is None:
        bbox = {"min": dict(pos), "max": dict(pos)}
    return {
        "id": state.get("handle"),
        "type": "POINT",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"position": pos, "display_size": 6.0},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
