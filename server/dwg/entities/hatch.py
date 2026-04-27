from __future__ import annotations

from typing import Dict, List

from .primitives_common import Geom, Point, Primitive


def build_hatch_primitives(geom: Geom) -> List[Primitive]:
    loops = geom.get("loops")
    if not isinstance(loops, list):
        return []

    rings: List[List[Point]] = []
    for loop in loops:
        pts = loop.get("points") if isinstance(loop, dict) else None
        if not isinstance(pts, list):
            continue
        clean = [p for p in pts if isinstance(p, dict)]
        if len(clean) >= 2:
            rings.append(clean)  # type: ignore[arg-type]

    if not rings:
        return []

    out: List[Primitive] = [
        {
            "kind": "polygon",
            "rings": rings,
            "filled": bool(geom.get("solid_fill", False)),
            "pattern_name": geom.get("pattern_name", "SOLID"),
            "pattern_angle": geom.get("pattern_angle"),
            "pattern_scale": geom.get("pattern_scale"),
            "pattern_spacing": geom.get("pattern_spacing"),
        }
    ]
    for ring in rings:
        out.append({"kind": "polyline", "points": ring, "closed": True})
    return out
