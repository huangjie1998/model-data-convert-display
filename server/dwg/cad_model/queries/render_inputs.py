from __future__ import annotations

from typing import Iterable

from server.dwg.cad_model.database import CadDatabase
from server.dwg.cad_model.entities.base import CadEntity


def iter_renderable_entities(database: CadDatabase, space_id: str) -> Iterable[CadEntity]:
    space = database.spaces.get(space_id)
    if not space:
        return []
    return [database.entities[eid] for eid in space.entity_ids if eid in database.entities]
