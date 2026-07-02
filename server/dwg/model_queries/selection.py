from __future__ import annotations

from server.dwg.dwg_model.AcRxObject.DatabaseReleated import AcDbDatabase
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


def get_object_by_id(database: AcDbDatabase, object_id: str) -> AcDbObject | None:
    return database.get_object(object_id)
