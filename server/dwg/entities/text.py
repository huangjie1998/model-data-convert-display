from __future__ import annotations

from typing import List

from .primitives_common import Entity, Geom, Primitive, PrimitiveBuildContext, finite_float, is_point_dict


def build_text_primitives(ent: Entity, geom: Geom, context: PrimitiveBuildContext) -> List[Primitive]:
    font_kind = str(geom.get("font_kind", "")).strip().lower()
    if context.enable_shx_outline and font_kind == "shx":
        oda_outlines = geom.get("oda_outline_primitives")
        if isinstance(oda_outlines, list):
            clean_oda = [p for p in oda_outlines if isinstance(p, dict)]
            if clean_oda:
                return clean_oda
        shx_outlines = context.build_shx_outline_primitives(geom)
        if shx_outlines:
            return shx_outlines

    position = geom.get("position")
    if not is_point_dict(position):
        return []

    text_color = context.resolve_entity_text_color(ent, geom)
    subtype = str(context.entity_semantic_subtype(ent.get("type"), geom, ent.get("source_acdb_type"))).lower()
    primitive: Primitive = {
        "kind": "text",
        "text": str(geom.get("text", "")),
        "position": position,
        "height": finite_float(geom.get("height"), 100.0),
        "width": finite_float(geom.get("width"), 0.0),
        "rotation": finite_float(geom.get("rotation"), 0.0),
        "width_factor": finite_float(geom.get("width_factor"), 1.0),
        "oblique": finite_float(geom.get("oblique"), 0.0),
        "actual_height": finite_float(geom.get("actual_height"), finite_float(geom.get("height"), 100.0)),
        "horizontal_mode": geom.get("horizontal_mode"),
        "vertical_mode": geom.get("vertical_mode"),
        "attachment": geom.get("attachment"),
        "mirrored_x": bool(geom.get("mirrored_x", False)),
        "mirrored_y": bool(geom.get("mirrored_y", False)),
        "is_mtext": bool(geom.get("is_mtext", False)),
        "font_key": geom.get("font_key"),
        "font_style_name": geom.get("font_style_name"),
        "font_name": geom.get("font_name"),
        "font_family": geom.get("font_family"),
        "font_kind": geom.get("font_kind"),
        "font_source": geom.get("font_source"),
        "subtype": subtype,
        "text_mask": bool(geom.get("text_mask", False)),
        "text_mask_padding": finite_float(geom.get("text_mask_padding"), 0.25),
        "text_mask_color": geom.get("text_mask_color"),
    }
    if text_color:
        primitive["color"] = text_color
    return [primitive]
