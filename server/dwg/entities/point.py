from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, finite_float, is_point_dict


def build_point_primitives(geom: Geom) -> List[Primitive]:
    position = geom.get("position")
    if is_point_dict(position):
        return [{"kind": "point", "position": position, "display_size": finite_float(geom.get("display_size"), 6.0)}]
    return []
