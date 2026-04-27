from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_line_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbline":
        return NOT_HANDLED

    start = state.get("start_pt")
    end = state.get("end_pt")
    min_pt = state.get("min_pt")
    max_pt = state.get("max_pt")
    origin_pt = state.get("origin_pt")
    u_axis_pt = state.get("u_axis_pt")
    bbox = state.get("bbox")

    if (start is None or end is None) and min_pt and max_pt and origin_pt and u_axis_pt:
        bbox_dx = abs(float(min_pt["x"]) - float(max_pt["x"]))
        bbox_dy = abs(float(min_pt["y"]) - float(max_pt["y"]))
        bbox_span = math.hypot(bbox_dx, bbox_dy)
        longer = max(bbox_dx, bbox_dy)
        shorter = min(bbox_dx, bbox_dy)
        slanted_ratio = (shorter / longer) if longer > 1e-12 else 0.0
        ux = float(u_axis_pt.get("x", 0.0))
        uy = float(u_axis_pt.get("y", 0.0))
        un = math.hypot(ux, uy)
        if un > 1e-12:
            ux /= un
            uy /= un
        axis_like = (abs(abs(ux) - 1.0) <= 1e-6 and abs(uy) <= 1e-6) or (abs(abs(uy) - 1.0) <= 1e-6 and abs(ux) <= 1e-6)
        allow_u_axis_infer = not (axis_like and slanted_ratio > 1e-3)
        if allow_u_axis_infer:
            inferred = context.line_segment_from_bbox(origin_pt, u_axis_pt, min_pt, max_pt)
            if inferred:
                inf_start, inf_end = inferred
                inferred_len = context.point_distance(inf_start, inf_end)
                if inferred_len > 1e-9 or bbox_span <= 1e-9:
                    start, end = inf_start, inf_end
    if (start is None or end is None) and min_pt and max_pt and origin_pt:
        inferred_from_origin = context.line_segment_from_bbox_and_origin(origin_pt, min_pt, max_pt)
        if inferred_from_origin:
            start, end = inferred_from_origin
    if (start is None or end is None) and min_pt and max_pt:
        start = dict(min_pt)
        end = dict(max_pt)
    if start is None or end is None:
        return None
    if bbox is None:
        bbox = context.bbox_from_points([start, end])
    return {
        "id": state.get("handle"),
        "type": "LINE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"start": start, "end": end},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
