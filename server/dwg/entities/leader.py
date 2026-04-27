from __future__ import annotations

from typing import List, Tuple

from .primitives_common import Geom, Point, Primitive, clean_point_dicts, point_distance
from ..dimension.primitives import arrow_marker_archtick_segment, arrow_marker_lines, arrow_marker_triangle_points, normalize_arrow_style_name, resolve_arrow_length


def build_leader_primitives(geom: Geom) -> List[Primitive]:
    clean = clean_point_dicts(geom.get("points"))
    if len(clean) < 2:
        return []

    out: List[Primitive] = [{"kind": "polyline", "points": clean, "closed": False}]
    if not bool(geom.get("has_arrowhead", False)):
        return out

    tip = clean[0]
    toward = clean[1]
    seg_len = point_distance(tip, toward)
    arrow_len = resolve_arrow_length(geom.get("arrow_size"), seg_len)
    arrow_half = arrow_len * 0.5
    inward = (float(toward["x"]) - float(tip["x"]), float(toward["y"]) - float(tip["y"]))
    arrow_block = geom.get("arrow_block")
    arrow_style = normalize_arrow_style_name(arrow_block)

    if arrow_style == "archtick":
        tick_seg = arrow_marker_archtick_segment(tip, inward, max(arrow_len, 4.0))
        if tick_seg:
            out.append({"kind": "line", "start": tick_seg[0], "end": tick_seg[1], "subtype": "leader_arrow_tick", "arrow_style": arrow_style, "arrow_block": arrow_block})
    elif arrow_style == "open":
        for line_a, line_b in arrow_marker_lines(tip, inward, arrow_len, arrow_half):
            out.append({"kind": "line", "start": line_a, "end": line_b, "subtype": "leader_arrow_open", "arrow_style": arrow_style, "arrow_block": arrow_block})
    else:
        triangle = arrow_marker_triangle_points(tip, inward, arrow_len, arrow_half)
        if triangle:
            out.append({"kind": "polygon", "rings": [triangle], "filled": True, "pattern_name": "ARROW", "arrow_fill": True, "subtype": "leader_arrow_fill", "arrow_style": arrow_style, "arrow_block": arrow_block})
    return out
