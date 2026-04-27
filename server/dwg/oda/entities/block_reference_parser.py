from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_block_reference_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    et = str(state.get("et") or "")
    if et != "acdbblockreference":
        return NOT_HANDLED
    block_name = state.get("block_name")
    if not block_name:
        return None
    origin_pt = state.get("origin_pt")
    scale_factors = state.get("scale_factors")
    rotation_deg = state.get("rotation_deg")
    position = origin_pt or {"x": 0.0, "y": 0.0, "z": 0.0}
    sx = float(scale_factors.get("x", 1.0)) if isinstance(scale_factors, dict) else 1.0
    sy = float(scale_factors.get("y", 1.0)) if isinstance(scale_factors, dict) else 1.0
    sz = float(scale_factors.get("z", 1.0)) if isinstance(scale_factors, dict) else 1.0
    return {
        "id": state.get("handle"),
        "type": "INSERT",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"block_name": block_name, "position": position, "rotation": float(rotation_deg or 0.0), "scale": {"x": sx, "y": sy, "z": sz}},
        "style": state.get("style_obj"),
        "bbox": state.get("bbox"),
    }
