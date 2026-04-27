from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class DimensionParseState:
    et: str
    handle: object
    layer: object
    space_id: object
    style_obj: object
    bbox: object
    min_pt: object
    max_pt: object
    origin_pt: object
    center_pt: object
    rotation_deg: object
    text_string: object
    text_height: object
    text_style_name: object
    named_points: Dict[str, object]
    dimension_line_point: object
    ext_line1_point: object
    ext_line2_point: object
    dimension_measurement: object
    formatted_measurement: object
    dimension_style_name: object
    dimension_arrow_block: object
    dimension_arrow_block1: object
    dimension_arrow_block2: object
    dimension_arrow_size: object
    dimension_text_color_raw: object
    dimension_text_mask_mode: object
    dimension_text_mask_color_raw: object
    dimension_block_name: object
    dimension_block_position: object
    dimension_block_rotation: object
    dimension_block_scale: object
    dimension_entity_vars: Dict[str, object]
    text_position_point: object
    text_rotation_deg: object
    dim_arc_point: object
    dim_ext1_start: object
    dim_ext1_end: object
    dim_ext2_start: object
    dim_ext2_end: object
    dim_chord_point: object
    dim_far_chord_point: object
    dim_leader_end_point: object


def collect_dimension_parse_state(state: Dict[str, object]) -> DimensionParseState:
    return DimensionParseState(
        et=str(state.get("et") or ""),
        handle=state.get("handle"),
        layer=state.get("layer"),
        space_id=state.get("space_id"),
        style_obj=state.get("style_obj"),
        bbox=state.get("bbox"),
        min_pt=state.get("min_pt"),
        max_pt=state.get("max_pt"),
        origin_pt=state.get("origin_pt"),
        center_pt=state.get("center_pt"),
        rotation_deg=state.get("rotation_deg"),
        text_string=state.get("text_string"),
        text_height=state.get("text_height"),
        text_style_name=state.get("text_style_name"),
        named_points=state.get("named_points") if isinstance(state.get("named_points"), dict) else {},
        dimension_line_point=state.get("dimension_line_point"),
        ext_line1_point=state.get("ext_line1_point"),
        ext_line2_point=state.get("ext_line2_point"),
        dimension_measurement=state.get("dimension_measurement"),
        formatted_measurement=state.get("formatted_measurement"),
        dimension_style_name=state.get("dimension_style_name"),
        dimension_arrow_block=state.get("dimension_arrow_block"),
        dimension_arrow_block1=state.get("dimension_arrow_block1"),
        dimension_arrow_block2=state.get("dimension_arrow_block2"),
        dimension_arrow_size=state.get("dimension_arrow_size"),
        dimension_text_color_raw=state.get("dimension_text_color_raw"),
        dimension_text_mask_mode=state.get("dimension_text_mask_mode"),
        dimension_text_mask_color_raw=state.get("dimension_text_mask_color_raw"),
        dimension_block_name=state.get("dimension_block_name"),
        dimension_block_position=state.get("dimension_block_position"),
        dimension_block_rotation=state.get("dimension_block_rotation"),
        dimension_block_scale=state.get("dimension_block_scale"),
        dimension_entity_vars=state.get("dimension_entity_vars") if isinstance(state.get("dimension_entity_vars"), dict) else {},
        text_position_point=state.get("text_position_point"),
        text_rotation_deg=state.get("text_rotation_deg"),
        dim_arc_point=state.get("dim_arc_point"),
        dim_ext1_start=state.get("dim_ext1_start"),
        dim_ext1_end=state.get("dim_ext1_end"),
        dim_ext2_start=state.get("dim_ext2_start"),
        dim_ext2_end=state.get("dim_ext2_end"),
        dim_chord_point=state.get("dim_chord_point"),
        dim_far_chord_point=state.get("dim_far_chord_point"),
        dim_leader_end_point=state.get("dim_leader_end_point"),
    )
