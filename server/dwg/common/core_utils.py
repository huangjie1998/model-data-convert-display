"""Backward-compatible re-export shim.

Functions have moved into dedicated sub-modules:
- geometry.py, colors.py, fonts.py, affine.py, dimension_utils.py
- parse_utils.py, hatch_utils.py, block_utils.py, constants.py
- stroke_font.py (in server/dwg/)
"""
from __future__ import annotations

from server.dwg.common.affine import (
    Affine2D,
    _affine_scales,
    _apply_affine,
    _apply_bbox_affine,
    _apply_linear,
    _compose_affine,
)
from server.dwg.common.block_utils import _block_ref_id_from_instance_path, _space_from_block_name
from server.dwg.common.colors import (
    _aci_to_rgb_decimal,
    _parse_aci_from_color_name,
    _parse_true_rgb_decimal,
    _resolve_rgb_color_decimal,
)
from server.dwg.common.constants import DEFAULT_LINEWEIGHT_MM, DWG_CORE_PARSER_REV, TEXT_ENTITY_TYPES
from server.dwg.common.dimension_utils import (
    _dimension_line_endpoints,
    _dimension_subtype_from_kind,
    _normalize_dimension_kind,
    _normalize_dim_var_label,
    _normalize_dim_var_map,
    _normalize_dimblk_name,
    _parse_dim_var_value,
    _resolve_arrow_length,
    _resolve_dimension_display_text,
    _resolve_dimension_text_color,
    _resolve_dimension_text_mask_color,
    _resolve_dimension_text_mask_mode,
    _resolve_entity_text_color,
)
from server.dwg.common.fonts import (
    _detect_font_kind,
    _font_family_from_name,
    _normalize_entity_instance_key,
    _normalize_font_token,
    _sanitize_font_key,
)
from server.dwg.common.geometry import (
    _angle_deg,
    _bbox_from_points,
    _distance_to_bbox_2d,
    _distance_to_segment,
    _is_angle_on_arc,
    _line_intersection_2d,
    _line_segment_from_bbox,
    _line_segment_from_bbox_and_origin,
    _point_angle_from_center,
    _point_distance,
    _point_on_ray,
)
from server.dwg.common.hatch_utils import _build_hatch_loop_points_from_edges
from server.dwg.common.parse_utils import (
    _ENTITY_START_RE,
    _VECTORIZE_ENTITY_END_RE,
    _VECTORIZE_ENTITY_START_RE,
    _VECTORIZE_VERTEX_RE,
    _clean_oda_text_value,
    _is_text_entity_type,
    _lineweight_to_mm,
    _parse_float_value,
    _parse_int_value,
    _parse_label_value,
    _parse_point_value,
)
from server.dwg.stroke_font import _shx_char_strokes

__all__ = [
    "Affine2D",
    "DWG_CORE_PARSER_REV",
    "DEFAULT_LINEWEIGHT_MM",
    "TEXT_ENTITY_TYPES",
    "_ENTITY_START_RE",
    "_VECTORIZE_ENTITY_END_RE",
    "_VECTORIZE_ENTITY_START_RE",
    "_VECTORIZE_VERTEX_RE",
    "_aci_to_rgb_decimal",
    "_affine_scales",
    "_angle_deg",
    "_apply_affine",
    "_apply_bbox_affine",
    "_apply_linear",
    "_bbox_from_points",
    "_block_ref_id_from_instance_path",
    "_build_hatch_loop_points_from_edges",
    "_clean_oda_text_value",
    "_compose_affine",
    "_detect_font_kind",
    "_dimension_line_endpoints",
    "_dimension_subtype_from_kind",
    "_distance_to_bbox_2d",
    "_distance_to_segment",
    "_font_family_from_name",
    "_is_angle_on_arc",
    "_is_text_entity_type",
    "_line_intersection_2d",
    "_line_segment_from_bbox",
    "_line_segment_from_bbox_and_origin",
    "_lineweight_to_mm",
    "_normalize_dimension_kind",
    "_normalize_dim_var_label",
    "_normalize_dim_var_map",
    "_normalize_dimblk_name",
    "_normalize_entity_instance_key",
    "_normalize_font_token",
    "_parse_aci_from_color_name",
    "_parse_dim_var_value",
    "_parse_float_value",
    "_parse_int_value",
    "_parse_label_value",
    "_parse_point_value",
    "_parse_true_rgb_decimal",
    "_point_angle_from_center",
    "_point_distance",
    "_point_on_ray",
    "_resolve_arrow_length",
    "_resolve_dimension_display_text",
    "_resolve_dimension_text_color",
    "_resolve_dimension_text_mask_color",
    "_resolve_dimension_text_mask_mode",
    "_resolve_entity_text_color",
    "_resolve_rgb_color_decimal",
    "_sanitize_font_key",
    "_shx_char_strokes",
    "_space_from_block_name",
]
