from __future__ import annotations

import math
from typing import Dict, Optional


def resolve_dimension_style_state(
    *,
    dimension_style_name: object,
    dim_styles: Optional[Dict[str, Dict[str, object]]],
    header_dim_defaults: Optional[Dict[str, object]],
    dimension_entity_vars: Dict[str, object],
    style_obj: Dict[str, object],
    text_style_name: object,
    dimension_arrow_block: object,
    dimension_arrow_block1: object,
    dimension_arrow_block2: object,
    dimension_arrow_size: object,
    text_height: object,
    dimension_text_color_raw: object,
    dimension_text_mask_mode: object,
    dimension_text_mask_color_raw: object,
    context,
) -> Dict[str, object]:
    style_key = (dimension_style_name or "").strip()
    style_rec = (dim_styles or {}).get(style_key, {}) if style_key else {}
    dim_defaults = header_dim_defaults or {}
    dim_default_vars = context.normalize_dim_var_map(dim_defaults if isinstance(dim_defaults, dict) else {})
    dim_style_vars = context.normalize_dim_var_map(style_rec if isinstance(style_rec, dict) else {})
    dim_entity_override_vars = context.normalize_dim_var_map(dimension_entity_vars)
    dim_effective_vars: Dict[str, object] = {}
    dim_value_source_map: Dict[str, str] = {}
    dim_effective_vars.update(dim_default_vars)
    for key in dim_default_vars.keys():
        dim_value_source_map[key] = "header_defaults"
    dim_effective_vars.update(dim_style_vars)
    for key in dim_style_vars.keys():
        dim_value_source_map[key] = "dim_style"
    dim_effective_vars.update(dim_entity_override_vars)
    for key in dim_entity_override_vars.keys():
        dim_value_source_map[key] = "entity_override"

    entity_dimtxsty = str(dim_entity_override_vars.get("dimtxsty") or "").strip() or None
    entity_dimblk = context.normalize_dimblk_name(dim_entity_override_vars.get("dimblk"))
    entity_dimblk1 = context.normalize_dimblk_name(dim_entity_override_vars.get("dimblk1"))
    entity_dimblk2 = context.normalize_dimblk_name(dim_entity_override_vars.get("dimblk2"))
    entity_dimasz = dim_entity_override_vars.get("dimasz")
    entity_dimtxt = dim_entity_override_vars.get("dimtxt")

    dim_text_style = str(
        text_style_name
        or style_obj.get("text_style")
        or entity_dimtxsty
        or style_rec.get("dimtxsty")
        or dim_defaults.get("dimtxsty")
        or ""
    ).strip() or None
    if dim_text_style:
        style_obj["text_style"] = dim_text_style

    dimblk = (
        dimension_arrow_block
        or entity_dimblk
        or context.normalize_dimblk_name(style_rec.get("dimblk"))
        or context.normalize_dimblk_name(dim_defaults.get("dimblk"))
    )
    dimblk1 = (
        dimension_arrow_block1
        or entity_dimblk1
        or context.normalize_dimblk_name(style_rec.get("dimblk1"))
        or context.normalize_dimblk_name(dim_defaults.get("dimblk1"))
    )
    dimblk2 = (
        dimension_arrow_block2
        or entity_dimblk2
        or context.normalize_dimblk_name(style_rec.get("dimblk2"))
        or context.normalize_dimblk_name(dim_defaults.get("dimblk2"))
    )
    if not dimblk1:
        dimblk1 = dimblk
    if not dimblk2:
        dimblk2 = dimblk

    dimasz = _first_positive_number(
        dimension_arrow_size,
        entity_dimasz,
        style_rec.get("dimasz") if isinstance(style_rec, dict) else None,
        dim_defaults.get("dimasz") if isinstance(dim_defaults, dict) else None,
    )
    dimtxt = _first_positive_number(
        text_height,
        entity_dimtxt,
        style_rec.get("dimtxt") if isinstance(style_rec, dict) else None,
        dim_defaults.get("dimtxt") if isinstance(dim_defaults, dict) else None,
    )

    if dimension_text_color_raw is None and dim_entity_override_vars.get("dimclrt") is not None:
        dimension_text_color_raw = dim_entity_override_vars.get("dimclrt")
    if dimension_text_mask_mode is None:
        parsed_entity_fill = context.parse_int_value(dim_entity_override_vars.get("dimtfill"))
        if parsed_entity_fill is not None:
            dimension_text_mask_mode = parsed_entity_fill
    if dimension_text_mask_color_raw is None and dim_entity_override_vars.get("dimtfillclr") is not None:
        dimension_text_mask_color_raw = dim_entity_override_vars.get("dimtfillclr")

    dim_text_color = context.resolve_dimension_text_color(
        override_raw=dimension_text_color_raw,
        style_rec=style_rec if isinstance(style_rec, dict) else {},
        dim_defaults=dim_defaults if isinstance(dim_defaults, dict) else {},
        style_obj=style_obj if isinstance(style_obj, dict) else {},
    )
    dim_text_mask_mode = context.resolve_dimension_text_mask_mode(
        override_raw=dimension_text_mask_mode,
        style_rec=style_rec if isinstance(style_rec, dict) else {},
        dim_defaults=dim_defaults if isinstance(dim_defaults, dict) else {},
    )
    dim_text_mask = dim_text_mask_mode > 0
    dim_text_mask_color = context.resolve_dimension_text_mask_color(
        override_raw=dimension_text_mask_color_raw,
        style_rec=style_rec if isinstance(style_rec, dict) else {},
        dim_defaults=dim_defaults if isinstance(dim_defaults, dict) else {},
        style_obj=style_obj if isinstance(style_obj, dict) else {},
    )

    _mark_resolved_style_values(
        dim_effective_vars=dim_effective_vars,
        dim_value_source_map=dim_value_source_map,
        dim_text_style=dim_text_style,
        dimblk=dimblk,
        dimblk1=dimblk1,
        dimblk2=dimblk2,
        dimasz=dimasz,
        dimtxt=dimtxt,
        dimension_text_color_raw=dimension_text_color_raw,
        dimension_text_mask_mode=dimension_text_mask_mode,
        dimension_text_mask_color_raw=dimension_text_mask_color_raw,
        dim_text_color=dim_text_color,
        dim_text_mask_color=dim_text_mask_color,
    )

    return {
        "style_key": style_key,
        "style_rec": style_rec,
        "dim_defaults": dim_defaults,
        "dim_default_vars": dim_default_vars,
        "dim_style_vars": dim_style_vars,
        "dim_entity_override_vars": dim_entity_override_vars,
        "dim_effective_vars": dim_effective_vars,
        "dim_value_source_map": dim_value_source_map,
        "dim_text_style": dim_text_style,
        "dimblk": dimblk,
        "dimblk1": dimblk1,
        "dimblk2": dimblk2,
        "dimasz": dimasz,
        "dimtxt": dimtxt,
        "dimension_text_color_raw": dimension_text_color_raw,
        "dimension_text_mask_mode": dimension_text_mask_mode,
        "dimension_text_mask_color_raw": dimension_text_mask_color_raw,
        "dim_text_color": dim_text_color,
        "dim_text_mask_mode": dim_text_mask_mode,
        "dim_text_mask": dim_text_mask,
        "dim_text_mask_color": dim_text_mask_color,
    }


def _first_positive_number(*values: object) -> object:
    for value in values:
        if isinstance(value, (int, float)) and math.isfinite(float(value)) and float(value) > 0:
            return float(value)
    return values[0] if values else None


def _mark_resolved_style_values(
    *,
    dim_effective_vars: Dict[str, object],
    dim_value_source_map: Dict[str, str],
    dim_text_style: object,
    dimblk: object,
    dimblk1: object,
    dimblk2: object,
    dimasz: object,
    dimtxt: object,
    dimension_text_color_raw: object,
    dimension_text_mask_mode: object,
    dimension_text_mask_color_raw: object,
    dim_text_color: object,
    dim_text_mask_color: object,
) -> None:
    if dim_text_style:
        dim_effective_vars["dimtxsty"] = dim_text_style
        dim_value_source_map["dimtxsty"] = "resolved"
    if dimblk:
        dim_effective_vars["dimblk"] = dimblk
        dim_value_source_map["dimblk"] = "resolved"
    if dimblk1:
        dim_effective_vars["dimblk1"] = dimblk1
        dim_value_source_map["dimblk1"] = "resolved"
    if dimblk2:
        dim_effective_vars["dimblk2"] = dimblk2
        dim_value_source_map["dimblk2"] = "resolved"
    if isinstance(dimasz, (int, float)) and math.isfinite(float(dimasz)) and float(dimasz) > 0:
        dim_effective_vars["dimasz"] = float(dimasz)
        dim_value_source_map["dimasz"] = "resolved"
    if isinstance(dimtxt, (int, float)) and math.isfinite(float(dimtxt)) and float(dimtxt) > 0:
        dim_effective_vars["dimtxt"] = float(dimtxt)
        dim_value_source_map["dimtxt"] = "resolved"
    if dimension_text_color_raw is not None:
        dim_effective_vars["dimclrt"] = dimension_text_color_raw
        dim_value_source_map["dimclrt"] = "resolved"
    if dimension_text_mask_mode is not None:
        dim_effective_vars["dimtfill"] = int(dimension_text_mask_mode)
        dim_value_source_map["dimtfill"] = "resolved"
    if dimension_text_mask_color_raw is not None:
        dim_effective_vars["dimtfillclr"] = dimension_text_mask_color_raw
        dim_value_source_map["dimtfillclr"] = "resolved"
    if dim_text_color:
        dim_effective_vars["dimclrt_resolved"] = dim_text_color
        dim_value_source_map["dimclrt_resolved"] = "resolved"
    if dim_text_mask_color:
        dim_effective_vars["dimtfillclr_resolved"] = dim_text_mask_color
        dim_value_source_map["dimtfillclr_resolved"] = "resolved"
