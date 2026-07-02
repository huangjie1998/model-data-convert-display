from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class AcDbLinkedData(AcDbObject):
    data: Dict[str, object] = field(default_factory=dict)
    properties: Dict[str, object] = field(default_factory=dict)
