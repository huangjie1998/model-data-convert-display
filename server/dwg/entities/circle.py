from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, is_point_dict, positive_float


def build_circle_primitives(geom: Geom) -> List[Primitive]:
    center = geom.get("center")
    radius = positive_float(geom.get("radius"))
    if is_point_dict(center) and radius is not None:
        return [{"kind": "circle", "center": center, "radius": radius}]
    return []
