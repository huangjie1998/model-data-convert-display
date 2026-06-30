from __future__ import annotations

from server.dwg.cad_model.database import CadDatabase
from server.dwg.cad_model.dbobjects.base import CadDbObject


def get_object_by_id(database: CadDatabase, object_id: str) -> CadDbObject | None:
    return database.get_object(object_id)
