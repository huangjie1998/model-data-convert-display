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
    vertex_start_widths = state.get("vertex_start_widths")
    vertex_end_widths = state.get("vertex_end_widths")
    entity_start_width = state.get("poly_start_width")
    entity_end_width = state.get("poly_end_width")
    segment_widths = []
    if isinstance(vertex_start_widths, list) or isinstance(vertex_end_widths, list):
        segment_count = len(vertices) if is_closed else max(0, len(vertices) - 1)
        for idx in range(segment_count):
            start_w = vertex_start_widths[idx] if isinstance(vertex_start_widths, list) and idx < len(vertex_start_widths) else None
            end_w = vertex_end_widths[idx] if isinstance(vertex_end_widths, list) and idx < len(vertex_end_widths) else None
            explicit_start = isinstance(start_w, (int, float)) and math.isfinite(float(start_w)) and float(start_w) >= 0
            explicit_end = isinstance(end_w, (int, float)) and math.isfinite(float(end_w)) and float(end_w) >= 0
            if not explicit_start and idx == 0 and isinstance(entity_start_width, float) and math.isfinite(entity_start_width) and entity_start_width >= 0:
                start_w = entity_start_width
                explicit_start = True
            if not isinstance(end_w, (int, float)) or not math.isfinite(float(end_w)) or float(end_w) < 0:
                if (
                    not is_closed
                    and idx == segment_count - 1
                    and isinstance(entity_end_width, float)
                    and math.isfinite(entity_end_width)
                    and entity_end_width >= 0
                ):
                    end_w = entity_end_width
                else:
                    next_idx = (idx + 1) % len(vertices)
                    end_w = (
                        vertex_start_widths[next_idx]
                        if isinstance(vertex_start_widths, list) and next_idx < len(vertex_start_widths)
                        else start_w
                    )
                explicit_end = isinstance(end_w, (int, float)) and math.isfinite(float(end_w)) and float(end_w) >= 0
            clean_start = float(start_w) if isinstance(start_w, (int, float)) and math.isfinite(float(start_w)) and float(start_w) >= 0 else 0.0
            clean_end = float(end_w) if isinstance(end_w, (int, float)) and math.isfinite(float(end_w)) and float(end_w) >= 0 else clean_start
            if explicit_start or explicit_end:
                segment_widths.append({"segment": idx, "start_width": clean_start, "end_width": clean_end})
    if segment_widths:
        poly_geom["segment_widths"] = segment_widths
    for state_key, geom_key in (
        ("poly_start_width", "start_width"),
        ("poly_end_width", "end_width"),
        ("poly_global_width", "global_width"),
    ):
        width = state.get(state_key)
        if isinstance(width, float) and math.isfinite(width) and width >= 0:
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
