from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, finite_float, is_point_dict


def build_ellipse_primitives(geom: Geom) -> List[Primitive]:
    center = geom.get("center")
    rx = geom.get("rx")
    ry = geom.get("ry")
    if not is_point_dict(center) or not isinstance(rx, (int, float)) or not isinstance(ry, (int, float)):
        return []

    obj: Primitive = {
        "kind": "ellipse",
        "center": center,
        "rx": float(rx),
        "ry": float(ry),
        "rotation": finite_float(geom.get("rotation"), 0.0),
        "start_angle": finite_float(geom.get("start_angle"), 0.0),
        "end_angle": finite_float(geom.get("end_angle"), 360.0),
    }
    if is_point_dict(geom.get("start")):
        obj["start"] = geom.get("start")
    if is_point_dict(geom.get("end")):
        obj["end"] = geom.get("end")
    return [obj]
