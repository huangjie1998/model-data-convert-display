from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class AcDbGroup(AcDbObject):
    name: str = ""
    description: str = ""
    selectable: bool = True
    entity_ids: List[str] = field(default_factory=list)
    properties: Dict[str, object] = field(default_factory=dict)
