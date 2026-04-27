from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, clean_point_dicts


def build_spline_primitives(geom: Geom) -> List[Primitive]:
    clean = clean_point_dicts(geom.get("points"))
    if len(clean) >= 2:
        return [{"kind": "polyline", "points": clean, "closed": bool(geom.get("closed", False))}]
    return []
