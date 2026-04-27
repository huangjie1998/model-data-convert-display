from __future__ import annotations

from typing import Dict, List

from server.dwg.dimension.primitives import build_dimension_primitives
from server.dwg.entities.arc import build_arc_primitives
from server.dwg.entities.circle import build_circle_primitives
from server.dwg.entities.ellipse import build_ellipse_primitives
from server.dwg.entities.hatch import build_hatch_primitives
from server.dwg.entities.leader import build_leader_primitives
from server.dwg.entities.line import build_line_primitives
from server.dwg.entities.mtext import build_mtext_primitives
from server.dwg.entities.point import build_point_primitives
from server.dwg.entities.polyline import build_polyline_primitives
from server.dwg.entities.primitives_common import Entity, Primitive, PrimitiveBuildContext, is_text_entity_type
from server.dwg.entities.spline import build_spline_primitives
from server.dwg.entities.surface import build_surface_primitives, build_wipeout_primitives
from server.dwg.entities.text import build_text_primitives


def build_entity_primitives(ent: Entity, context: PrimitiveBuildContext) -> List[Primitive]:
    geom = ent.get("geom", {}) if isinstance(ent.get("geom"), dict) else {}
    existing = geom.get("primitives")
    if isinstance(existing, list) and existing:
        return [p for p in existing if isinstance(p, dict)]

    entity_type = str(ent.get("type", "")).upper()
    if entity_type == "LINE":
        return build_line_primitives(geom)
    if entity_type == "POLYLINE":
        return build_polyline_primitives(geom)
    if entity_type == "SPLINE":
        return build_spline_primitives(geom)
    if entity_type == "CIRCLE":
        return build_circle_primitives(geom)
    if entity_type == "ARC":
        return build_arc_primitives(geom)
    if entity_type == "ELLIPSE":
        return build_ellipse_primitives(geom)
    if is_text_entity_type(entity_type):
        if entity_type == "MTEXT":
            return build_mtext_primitives(ent, geom, context)
        return build_text_primitives(ent, geom, context)
    if entity_type == "POINT":
        return build_point_primitives(geom)
    if entity_type == "HATCH":
        return build_hatch_primitives(geom)
    if entity_type == "DIMENSION":
        return build_dimension_primitives(ent, geom, context)
    if entity_type == "LEADER":
        return build_leader_primitives(geom)
    if entity_type == "WIPEOUT":
        return build_wipeout_primitives(geom)
    if entity_type in ("SOLID", "TRACE", "FACE", "3DFACE"):
        return build_surface_primitives(geom)
    return []
