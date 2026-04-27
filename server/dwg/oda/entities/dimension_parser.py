from __future__ import annotations
from typing import Dict, Optional

from server.dwg.oda.entities.common import NOT_HANDLED
from server.dwg.oda.entities.dimension_angular_parser import apply_angular_dimension_geometry
from server.dwg.oda.entities.dimension_arc_length_parser import apply_arc_length_dimension_geometry
from server.dwg.oda.entities.dimension_diameter_parser import apply_diameter_dimension_geometry
from server.dwg.oda.entities.dimension_fallback_points import finalize_dimension_geometry_points
from server.dwg.oda.entities.dimension_geometry_common import pick_named_point
from server.dwg.oda.entities.dimension_kind_parser import resolve_dimension_kind
from server.dwg.oda.entities.dimension_linear_parser import resolve_linear_dimension_text_position
from server.dwg.oda.entities.dimension_ordinate_parser import apply_ordinate_dimension_geometry
from server.dwg.oda.entities.dimension_payload_builder import build_dimension_payload
from server.dwg.oda.entities.dimension_radius_parser import apply_radius_dimension_geometry
from server.dwg.oda.entities.dimension_state import collect_dimension_parse_state
from server.dwg.oda.entities.dimension_style_resolver import resolve_dimension_style_state


def build_dimension_entity(
    state: Dict[str, object],
    context,
    *,
    dim_styles: Optional[Dict[str, Dict[str, object]]] = None,
    header_dim_defaults: Optional[Dict[str, object]] = None,
) -> Dict[str, object] | None | object:
    dimension_state = collect_dimension_parse_state(state)
    et = dimension_state.et
    if not (et in ("acdbaligneddimension", "acdbrotateddimension") or (et.startswith("acdb") and et.endswith("dimension"))):
        return NOT_HANDLED

    handle = dimension_state.handle
    layer = dimension_state.layer
    space_id = dimension_state.space_id
    style_obj = dimension_state.style_obj
    bbox = dimension_state.bbox
    min_pt = dimension_state.min_pt
    max_pt = dimension_state.max_pt
    origin_pt = dimension_state.origin_pt
    center_pt = dimension_state.center_pt
    rotation_deg = dimension_state.rotation_deg
    text_string = dimension_state.text_string
    text_height = dimension_state.text_height
    text_style_name = dimension_state.text_style_name
    named_points = dimension_state.named_points
    dimension_line_point = dimension_state.dimension_line_point
    ext_line1_point = dimension_state.ext_line1_point
    ext_line2_point = dimension_state.ext_line2_point
    dimension_measurement = dimension_state.dimension_measurement
    formatted_measurement = dimension_state.formatted_measurement
    dimension_style_name = dimension_state.dimension_style_name
    dimension_arrow_block = dimension_state.dimension_arrow_block
    dimension_arrow_block1 = dimension_state.dimension_arrow_block1
    dimension_arrow_block2 = dimension_state.dimension_arrow_block2
    dimension_arrow_size = dimension_state.dimension_arrow_size
    dimension_text_color_raw = dimension_state.dimension_text_color_raw
    dimension_text_mask_mode = dimension_state.dimension_text_mask_mode
    dimension_text_mask_color_raw = dimension_state.dimension_text_mask_color_raw
    dimension_block_name = dimension_state.dimension_block_name
    dimension_block_position = dimension_state.dimension_block_position
    dimension_block_rotation = dimension_state.dimension_block_rotation
    dimension_block_scale = dimension_state.dimension_block_scale
    dimension_entity_vars = dimension_state.dimension_entity_vars
    text_position_point = dimension_state.text_position_point
    text_rotation_deg = dimension_state.text_rotation_deg
    dim_arc_point = dimension_state.dim_arc_point
    dim_ext1_start = dimension_state.dim_ext1_start
    dim_ext1_end = dimension_state.dim_ext1_end
    dim_ext2_start = dimension_state.dim_ext2_start
    dim_ext2_end = dimension_state.dim_ext2_end
    dim_chord_point = dimension_state.dim_chord_point
    dim_far_chord_point = dimension_state.dim_far_chord_point
    dim_leader_end_point = dimension_state.dim_leader_end_point

    def _pick_named_point(*keys: str) -> Optional[Dict[str, float]]:
        return pick_named_point(named_points, *keys)

    ext1 = ext_line1_point or _pick_named_point("extension line 1 point", "xline1 point", "x line 1 point", "defpoint2")
    ext2 = ext_line2_point or _pick_named_point("extension line 2 point", "xline2 point", "x line 2 point", "defpoint3")
    line_start_hint = _pick_named_point("line start point", "dim line start", "dimension line start point")
    line_end_hint = _pick_named_point("line end point", "dim line end", "dimension line end point")
    if not isinstance(ext1, dict) and isinstance(line_start_hint, dict):
        ext1 = line_start_hint
    if not isinstance(ext2, dict) and isinstance(line_end_hint, dict):
        ext2 = line_end_hint

    dim_kind = resolve_dimension_kind(et)

    dim_pt = (
        dimension_line_point
        or _pick_named_point("dimension line point", "dim line point", "defpoint4")
        or origin_pt
    )
    explicit_text_pos = text_position_point or _pick_named_point("text position", "text midpoint", "text mid point")
    text_pos = explicit_text_pos if isinstance(explicit_text_pos, dict) else dim_pt
    text_pos_is_implicit = not isinstance(explicit_text_pos, dict)
    line_start: Optional[Dict[str, float]] = None
    line_end: Optional[Dict[str, float]] = None
    angular_vertex: Optional[Dict[str, float]] = None
    geometry_state: Dict[str, object] = {
        "ext1": ext1,
        "ext2": ext2,
        "dim_pt": dim_pt,
        "text_pos": text_pos,
        "line_start": line_start,
        "line_end": line_end,
        "angular_vertex": angular_vertex,
        "bbox": bbox,
    }
    geometry_source: Dict[str, object] = {
        "named_points": named_points,
        "center_pt": center_pt,
        "dim_arc_point": dim_arc_point,
        "dim_chord_point": dim_chord_point,
        "dim_far_chord_point": dim_far_chord_point,
        "dim_leader_end_point": dim_leader_end_point,
        "dim_ext1_start": dim_ext1_start,
        "dim_ext1_end": dim_ext1_end,
        "dim_ext2_start": dim_ext2_start,
        "dim_ext2_end": dim_ext2_end,
        "min_pt": min_pt,
        "max_pt": max_pt,
    }

    if dim_kind == "angular":
        apply_angular_dimension_geometry(geometry_state, geometry_source, context)

    elif dim_kind == "arc_length":
        apply_arc_length_dimension_geometry(geometry_state, geometry_source, context)

    elif dim_kind == "radius":
        apply_radius_dimension_geometry(geometry_state, geometry_source, context)

    elif dim_kind == "diameter":
        apply_diameter_dimension_geometry(geometry_state, geometry_source, context)

    elif dim_kind == "ordinate":
        apply_ordinate_dimension_geometry(geometry_state, geometry_source, context)

    if not finalize_dimension_geometry_points(geometry_state, geometry_source, context):
        return None
    ext1 = geometry_state.get("ext1")
    ext2 = geometry_state.get("ext2")
    dim_pt = geometry_state.get("dim_pt")
    text_pos = geometry_state.get("text_pos")
    line_start = geometry_state.get("line_start")
    line_end = geometry_state.get("line_end")
    angular_vertex = geometry_state.get("angular_vertex")
    bbox = geometry_state.get("bbox")

    text_value = context.clean_oda_text_value(text_string)
    if not text_value:
        text_value = context.clean_oda_text_value(formatted_measurement)

    resolved_style = resolve_dimension_style_state(
        dimension_style_name=dimension_style_name,
        dim_styles=dim_styles,
        header_dim_defaults=header_dim_defaults,
        dimension_entity_vars=dimension_entity_vars,
        style_obj=style_obj,
        text_style_name=text_style_name,
        dimension_arrow_block=dimension_arrow_block,
        dimension_arrow_block1=dimension_arrow_block1,
        dimension_arrow_block2=dimension_arrow_block2,
        dimension_arrow_size=dimension_arrow_size,
        text_height=text_height,
        dimension_text_color_raw=dimension_text_color_raw,
        dimension_text_mask_mode=dimension_text_mask_mode,
        dimension_text_mask_color_raw=dimension_text_mask_color_raw,
        context=context,
    )
    payload_values: Dict[str, object] = {
        "et": et,
        "handle": handle,
        "layer": layer,
        "space_id": space_id,
        "style_obj": style_obj,
        "bbox": bbox,
        "ext1": ext1,
        "ext2": ext2,
        "dim_pt": dim_pt,
        "text_pos": text_pos,
        "line_start": line_start,
        "line_end": line_end,
        "dim_kind": dim_kind,
        "text_pos_is_implicit": text_pos_is_implicit,
        "dimension_measurement": dimension_measurement,
        "text_rotation_deg": text_rotation_deg,
        "rotation_deg": rotation_deg,
        "text_value": text_value,
        "formatted_measurement": formatted_measurement,
        "dimension_block_name": dimension_block_name,
        "dimension_block_position": dimension_block_position,
        "dimension_block_rotation": dimension_block_rotation,
        "dimension_block_scale": dimension_block_scale,
        "dim_arc_point": dim_arc_point,
        "dim_ext1_start": dim_ext1_start,
        "dim_ext1_end": dim_ext1_end,
        "dim_ext2_start": dim_ext2_start,
        "dim_ext2_end": dim_ext2_end,
        "dim_chord_point": dim_chord_point,
        "dim_far_chord_point": dim_far_chord_point,
        "dim_leader_end_point": dim_leader_end_point,
        "angular_vertex": angular_vertex,
        "center_pt": center_pt,
        **resolved_style,
    }
    return build_dimension_payload(payload_values, context)
