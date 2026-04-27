from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.dimension_linear_parser import resolve_linear_dimension_text_position


def build_dimension_payload(values: Dict[str, object], context) -> Dict[str, object]:
    ext1 = values.get("ext1")
    ext2 = values.get("ext2")
    dim_pt = values.get("dim_pt")
    text_pos = values.get("text_pos")
    line_start = values.get("line_start")
    line_end = values.get("line_end")
    dim_kind = values.get("dim_kind")
    dim_effective_vars = values.get("dim_effective_vars") if isinstance(values.get("dim_effective_vars"), dict) else {}
    text_pos_is_implicit = bool(values.get("text_pos_is_implicit"))
    dimension_measurement = values.get("dimension_measurement")

    measurement_value = dimension_measurement
    if not isinstance(measurement_value, (int, float)) or not math.isfinite(float(measurement_value)):
        measurement_value = context.point_distance(ext1, ext2)

    text_pos, line_dir_angle_deg = resolve_linear_dimension_text_position(
        dim_kind=str(dim_kind or ""),
        line_start=line_start,
        line_end=line_end,
        text_pos=text_pos,
        text_pos_is_implicit=text_pos_is_implicit,
        dim_effective_vars=dim_effective_vars,
    )

    text_rotation_deg = values.get("text_rotation_deg")
    rotation_deg = values.get("rotation_deg")
    if text_rotation_deg is not None:
        resolved_rotation = float(text_rotation_deg)
    elif line_dir_angle_deg is not None:
        resolved_rotation = float(line_dir_angle_deg)
    else:
        resolved_rotation = float(rotation_deg or 0.0)

    style_key = values.get("style_key")
    dim_text_style = values.get("dim_text_style")
    dimblk = values.get("dimblk")
    dimblk1 = values.get("dimblk1")
    dimblk2 = values.get("dimblk2")
    dim_text_mask = values.get("dim_text_mask")
    dim_default_vars = values.get("dim_default_vars") if isinstance(values.get("dim_default_vars"), dict) else {}
    dim_style_vars = values.get("dim_style_vars") if isinstance(values.get("dim_style_vars"), dict) else {}
    dim_entity_override_vars = values.get("dim_entity_override_vars") if isinstance(values.get("dim_entity_override_vars"), dict) else {}
    dim_value_source_map = values.get("dim_value_source_map") if isinstance(values.get("dim_value_source_map"), dict) else {}

    geom_dim: Dict[str, object] = {
        "ext1": ext1,
        "ext2": ext2,
        "dim_line_point": dim_pt,
        "line_start": line_start,
        "line_end": line_end,
        "measurement": float(measurement_value),
        "rotation": resolved_rotation,
        "text": values.get("text_value"),
        "text_position": text_pos,
        "dim_kind": dim_kind,
        "dimension_style": style_key or None,
        "style_name": dim_text_style,
        "text_style": dim_text_style,
        "arrow_block": dimblk or None,
        "arrow_block1": dimblk1 or None,
        "arrow_block2": dimblk2 or None,
        "text_mask": bool(dim_text_mask),
        "text_mask_padding": 0.25,
        "dim_style_vars": dim_effective_vars,
        "dim_style_sources": {
            "defaults": dim_default_vars,
            "style": dim_style_vars,
            "entity_overrides": dim_entity_override_vars,
        },
        "dim_value_source_map": dim_value_source_map,
    }
    _append_optional_dimension_payload_fields(geom_dim, values, context)

    et = str(values.get("et") or "")
    dim_kind_value = str(dim_kind or "")
    return {
        "id": values.get("handle"),
        "type": "DIMENSION",
        "layer": values.get("layer"),
        "space_id": values.get("space_id"),
        "semantic_type": "dimension",
        "semantic_subtype": context.dimension_subtype_from_kind(dim_kind_value),
        "source_acdb_type": et.upper(),
        "geom": geom_dim,
        "style": values.get("style_obj"),
        "bbox": values.get("bbox"),
    }


def _append_optional_dimension_payload_fields(geom_dim: Dict[str, object], values: Dict[str, object], context) -> None:
    dimension_block_name = values.get("dimension_block_name")
    dimension_block_position = values.get("dimension_block_position")
    dimension_block_rotation = values.get("dimension_block_rotation")
    dimension_block_scale = values.get("dimension_block_scale")
    dim_text_color = values.get("dim_text_color")
    dim_text_mask = values.get("dim_text_mask")
    dim_text_mask_mode = values.get("dim_text_mask_mode")
    dim_text_mask_color = values.get("dim_text_mask_color")
    dimtxt = values.get("dimtxt")
    dimasz = values.get("dimasz")

    if dimension_block_name:
        geom_dim["dimension_block_name"] = dimension_block_name
    if isinstance(dimension_block_position, dict):
        geom_dim["dimension_block_position"] = dimension_block_position
    if isinstance(dimension_block_rotation, (int, float)) and math.isfinite(float(dimension_block_rotation)):
        geom_dim["dimension_block_rotation"] = float(dimension_block_rotation)
    if isinstance(dimension_block_scale, dict):
        geom_dim["dimension_block_scale"] = {
            "x": float(dimension_block_scale.get("x", 1.0)),
            "y": float(dimension_block_scale.get("y", 1.0)),
            "z": float(dimension_block_scale.get("z", 1.0)),
        }
    if dim_text_color:
        geom_dim["text_color"] = dim_text_color
    if dim_text_mask:
        if dim_text_mask_mode == 1:
            geom_dim["text_mask_use_canvas_bg"] = True
        elif dim_text_mask_color:
            geom_dim["text_mask_color"] = dim_text_mask_color
    for payload_key, source_key in (
        ("arc_point", "dim_arc_point"),
        ("ext1_start", "dim_ext1_start"),
        ("ext1_end", "dim_ext1_end"),
        ("ext2_start", "dim_ext2_start"),
        ("ext2_end", "dim_ext2_end"),
        ("chord_point", "dim_chord_point"),
        ("far_chord_point", "dim_far_chord_point"),
        ("leader_end_point", "dim_leader_end_point"),
    ):
        source_value = values.get(source_key)
        if isinstance(source_value, dict):
            geom_dim[payload_key] = source_value
    angular_vertex = values.get("angular_vertex")
    center_pt = values.get("center_pt")
    if isinstance(angular_vertex, dict):
        geom_dim["center"] = angular_vertex
    elif isinstance(center_pt, dict):
        geom_dim["center"] = center_pt
    formatted_measurement = values.get("formatted_measurement")
    if formatted_measurement:
        cleaned_formatted = context.clean_oda_text_value(formatted_measurement)
        if cleaned_formatted:
            geom_dim["formatted_measurement"] = cleaned_formatted
    if isinstance(dimtxt, (int, float)) and math.isfinite(float(dimtxt)) and float(dimtxt) > 0:
        geom_dim["text_height"] = float(dimtxt)
    if isinstance(dimasz, (int, float)) and math.isfinite(float(dimasz)) and float(dimasz) > 0:
        geom_dim["arrow_size"] = float(dimasz)
