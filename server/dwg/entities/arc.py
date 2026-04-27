from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, is_point_dict, positive_float


def build_arc_primitives(geom: Geom) -> List[Primitive]:
    center = geom.get("center")
    radius = positive_float(geom.get("radius"))
    if not is_point_dict(center) or radius is None:
        return []

    obj: Primitive = {"kind": "arc", "center": center, "radius": radius}
    if is_point_dict(geom.get("start")):
        obj["start"] = geom.get("start")
    if is_point_dict(geom.get("end")):
        obj["end"] = geom.get("end")
    if isinstance(geom.get("start_angle"), (int, float)):
        obj["start_angle"] = float(geom.get("start_angle"))  # type: ignore[arg-type]
    if isinstance(geom.get("end_angle"), (int, float)):
        obj["end_angle"] = float(geom.get("end_angle"))  # type: ignore[arg-type]
    return [obj]
