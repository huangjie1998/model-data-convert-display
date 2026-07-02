from __future__ import annotations

from dataclasses import dataclass

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class NamedDbObjectMixin(AcDbObject):
    name: str = ""
