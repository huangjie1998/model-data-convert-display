from __future__ import annotations

from typing import Dict, Optional

from server.dwg.oda.entities.common import NOT_HANDLED
from server.dwg.oda.entities.block_reference_parser import build_block_reference_entity
from server.dwg.oda.entities.curve_parser import build_curve_entity
from server.dwg.oda.entities.leader_parser import build_leader_entity
from server.dwg.oda.entities.point_parser import build_point_entity
from server.dwg.oda.entities.surface_parser import build_surface_entity
from server.dwg.oda.entities.text_parser import build_text_entity

def build_non_dimension_entity(state: Dict[str, object], context) -> Optional[Dict[str, object]] | object:
    for builder in (
        build_curve_entity,
        build_block_reference_entity,
        build_text_entity,
        build_leader_entity,
        build_point_entity,
        build_surface_entity,
    ):
        result = builder(state, context)
        if result is not NOT_HANDLED:
            return result
    return NOT_HANDLED
