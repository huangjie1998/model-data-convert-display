from __future__ import annotations

import re
from typing import Dict, List, Tuple

from server.dwg.oda.entities.common import NOT_HANDLED


def build_wipeout_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbwipeout":
        return NOT_HANDLED

    named_points = state.get("named_points") or {}
    bbox = state.get("bbox")
    frame_pts: List[Tuple[int, Dict[str, float]]] = []
    for key, point in named_points.items():
        match = re.match(r"^frame vertex\s+(\d+)$", key)
        if not match:
            continue
        frame_pts.append((int(match.group(1)), point))
    frame_pts.sort(key=lambda item: item[0])
    vertices_out = [point for _, point in frame_pts]
    if len(vertices_out) < 3:
        return None
    if context.point_distance(vertices_out[0], vertices_out[-1]) > 1e-6:
        vertices_out.append(dict(vertices_out[0]))
    if bbox is None:
        bbox = context.bbox_from_points(vertices_out)
    return {
        "id": state.get("handle"),
        "type": "WIPEOUT",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"vertices": vertices_out, "closed": True},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
