from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_single_line_text_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbtext":
        return NOT_HANDLED

    text = state.get("text_string") or ""
    pos = state.get("origin_pt")
    min_pt = state.get("min_pt")
    max_pt = state.get("max_pt")
    bbox = state.get("bbox")
    text_height = state.get("text_height")
    text_width = state.get("text_width")
    background_fill_on = state.get("mtext_background_fill_on")
    background_fill_color_raw = state.get("mtext_background_fill_color_raw")
    background_scale_factor = state.get("mtext_background_scale_factor")
    if pos is None:
        if min_pt and max_pt:
            pos = {"x": (min_pt["x"] + max_pt["x"]) * 0.5, "y": (min_pt["y"] + max_pt["y"]) * 0.5, "z": min_pt.get("z", 0.0)}
        else:
            return None
    if bbox is None:
        height = float(text_height or 100.0)
        width = float(text_width or max(height * 0.5, len(str(text)) * height * 0.55))
        bbox = {"min": {"x": pos["x"], "y": pos["y"] - height, "z": pos.get("z", 0.0)}, "max": {"x": pos["x"] + width, "y": pos["y"], "z": pos.get("z", 0.0)}}
    return {
        "id": state.get("handle"),
        "type": "TEXT",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "semantic_type": "text",
        "semantic_subtype": "TEXT",
        "source_acdb_type": "ACDBTEXT",
        "geom": {
            "text": context.clean_oda_text_value(text),
            "position": pos,
            "height": float(text_height or 100.0),
            "rotation": float(state.get("rotation_deg") or 0.0),
            "width": float(text_width or 0.0),
            "width_factor": float(state.get("width_factor") or 1.0),
            "is_mtext": False,
            "style_name": state.get("text_style_name"),
            "horizontal_mode": state.get("horizontal_mode"),
            "vertical_mode": state.get("vertical_mode"),
            "attachment": state.get("attachment_mode"),
            "oblique": float(state.get("oblique_angle") or 0.0),
            "actual_height": float(state.get("actual_height") or text_height or 0.0),
            "mirrored_x": bool(state.get("mirrored_x")),
            "mirrored_y": bool(state.get("mirrored_y")),
            "is_attribute": False,
            "attribute_kind": "",
            "text_mask": bool(background_fill_on) if background_fill_on is not None else False,
            "text_mask_padding": (
                float(background_scale_factor)
                if isinstance(background_scale_factor, (int, float))
                and math.isfinite(float(background_scale_factor))
                and float(background_scale_factor) > 0
                else 0.25
            ),
            "text_mask_color": context.resolve_rgb_color_decimal(background_fill_color_raw) if background_fill_color_raw is not None else None,
        },
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
