from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, clean_point_dicts, point_distance


def build_wipeout_primitives(geom: Geom) -> List[Primitive]:
    clean = clean_point_dicts(geom.get("vertices"))
    if len(clean) >= 3:
        return [{"kind": "polygon", "rings": [clean], "filled": True, "pattern_name": "WIPEOUT", "wipeout": True}]
    return []


def build_surface_primitives(geom: Geom) -> List[Primitive]:
    clean = clean_point_dicts(geom.get("vertices"))
    if len(clean) < 3:
        return []
    if point_distance(clean[0], clean[-1]) > 1e-6:
        clean = list(clean) + [dict(clean[0])]
    return [
        {
            "kind": "polygon",
            "rings": [clean],
            "filled": bool(geom.get("solid_fill", True)),
            "pattern_name": "SOLID",
            "subtype": "solid_fill",
            "solid_degenerate_reconstructed": bool(geom.get("degenerate_reconstructed", False)),
        }
    ]
