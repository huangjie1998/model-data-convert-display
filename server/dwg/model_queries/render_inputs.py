from __future__ import annotations

from typing import Iterable

from server.dwg.dwg_model.ac_db_database import AcDbDatabase
from server.dwg.dwg_model import AcDbEntity


def iter_renderable_entities(database: AcDbDatabase, space_id: str) -> Iterable[AcDbEntity]:
    space = database.spaces.get(space_id)
    if not space:
        return []
    return [database.entities[eid] for eid in space.entity_ids if eid in database.entities]
