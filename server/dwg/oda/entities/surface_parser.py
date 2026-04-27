from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED
from server.dwg.oda.entities.hatch_parser import build_hatch_entity
from server.dwg.oda.entities.solid_parser import build_solid_entity
from server.dwg.oda.entities.wipeout_parser import build_wipeout_entity


def build_surface_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    for builder in (
        build_hatch_entity,
        build_wipeout_entity,
        build_solid_entity,
    ):
        result = builder(state, context)
        if result is not NOT_HANDLED:
            return result
    return NOT_HANDLED
