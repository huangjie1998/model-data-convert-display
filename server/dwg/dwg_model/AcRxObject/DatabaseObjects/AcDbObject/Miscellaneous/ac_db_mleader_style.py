from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class AcDbMLeaderStyle(AcDbObject):
    name: str = ""
    content_type: str = ""
    text_style_id: str = ""
    leader_line_type_id: str = ""
    properties: Dict[str, object] = field(default_factory=dict)
