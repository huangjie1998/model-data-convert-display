from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class AcDbDataTable(AcDbObject):
    name: str = ""
    columns: List[Dict[str, object]] = field(default_factory=list)
    rows: List[Dict[str, object]] = field(default_factory=list)
    properties: Dict[str, object] = field(default_factory=dict)
