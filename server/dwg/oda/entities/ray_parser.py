from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_ray_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    et = state.get("et")
    if et not in ("acdbxline", "acdbray"):
        return NOT_HANDLED

    start = state.get("origin_pt") or state.get("start_pt")
    u_axis_pt = state.get("u_axis_pt")
    end_pt = state.get("end_pt")
    direction_pt = None
    if isinstance(u_axis_pt, dict):
        direction_pt = {
            "x": float(start["x"]) + float(u_axis_pt.get("x", 0.0)),
            "y": float(start["y"]) + float(u_axis_pt.get("y", 0.0)),
            "z": float(start.get("z", 0.0)),
        } if isinstance(start, dict) else None
    if not isinstance(start, dict):
        return None
    if not isinstance(direction_pt, dict):
        direction_pt = end_pt
    if not isinstance(direction_pt, dict):
        return None
    dx = float(direction_pt["x"]) - float(start["x"])
    dy = float(direction_pt["y"]) - float(start["y"])
    dn = math.hypot(dx, dy)
    if dn <= 1e-9:
        return None
    dx /= dn
    dy /= dn
    span = 20000.0
    bbox = state.get("bbox")
    if bbox and isinstance(bbox.get("min"), dict) and isinstance(bbox.get("max"), dict):
        bx = abs(float(bbox["max"]["x"]) - float(bbox["min"]["x"]))
        by = abs(float(bbox["max"]["y"]) - float(bbox["min"]["y"]))
        span = max(span, math.hypot(bx, by) * 2.0)
    if et == "acdbxline":
        p1 = {"x": float(start["x"]) - dx * span, "y": float(start["y"]) - dy * span, "z": float(start.get("z", 0.0))}
        p2 = {"x": float(start["x"]) + dx * span, "y": float(start["y"]) + dy * span, "z": float(start.get("z", 0.0))}
    else:
        p1 = dict(start)
        p2 = {"x": float(start["x"]) + dx * span, "y": float(start["y"]) + dy * span, "z": float(start.get("z", 0.0))}
    if bbox is None:
        bbox = context.bbox_from_points([p1, p2])
    return {
        "id": state.get("handle"),
        "type": "LINE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": {"start": p1, "end": p2, "source_type": str(et).upper()},
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
