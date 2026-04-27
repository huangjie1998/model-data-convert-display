from __future__ import annotations

import math
from typing import List

from .primitives_common import Geom, Primitive, clean_point_dicts


def build_polyline_primitives(geom: Geom) -> List[Primitive]:
    clean = clean_point_dicts(geom.get("vertices"))
    if len(clean) < 2:
        return []

    poly_obj: Primitive = {"kind": "polyline", "points": clean, "closed": bool(geom.get("closed", False))}
    for source_key, target_key in (
        ("start_width", "start_width"),
        ("end_width", "end_width"),
        ("global_width", "global_width"),
    ):
        value = geom.get(source_key)
        if isinstance(value, (int, float)) and math.isfinite(float(value)) and float(value) > 0:
            poly_obj[target_key] = float(value)
    return [poly_obj]
