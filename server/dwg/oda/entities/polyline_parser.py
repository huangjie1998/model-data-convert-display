from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


POLYLINE_ODA_TYPES = ("acdbpolyline", "acdb2dpolyline", "acdb3dpolyline", "acdblwpolyline")


def build_polyline_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") not in POLYLINE_ODA_TYPES:
        return NOT_HANDLED

    vertices = state.get("vertices") or []
    if len(vertices) < 2:
        return None

    vertex_segment_kinds = state.get("vertex_segment_kinds") or []
    if bool(state.get("poly_closed_seen")):
        is_closed = bool(state.get("poly_closed_flag"))
    else:
        first_v = vertices[0]
        last_v = vertices[-1]
        is_closed = context.point_distance(first_v, last_v) <= 1e-6
        if not is_closed and vertex_segment_kinds:
            tail = str(vertex_segment_kinds[-1]).lower()
            if "coincident" in tail:
                is_closed = True
        if not is_closed and vertex_segment_kinds and len(vertex_segment_kinds) == len(vertices):
            tail = str(vertex_segment_kinds[-1]).strip().lower()
            if tail and tail not in ("kpoint", "point", "kcoincident", "coincident"):
                is_closed = True

    bbox = state.get("bbox")
    if bbox is None:
        bbox = context.bbox_from_points(vertices)
    poly_geom: Dict[str, object] = {"vertices": vertices, "closed": is_closed}
    for state_key, geom_key in (
        ("poly_start_width", "start_width"),
        ("poly_end_width", "end_width"),
        ("poly_global_width", "global_width"),
    ):
        width = state.get(state_key)
        if isinstance(width, float) and math.isfinite(width) and width > 0:
            poly_geom[geom_key] = float(width)
    return {
        "id": state.get("handle"),
        "type": "POLYLINE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": poly_geom,
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
