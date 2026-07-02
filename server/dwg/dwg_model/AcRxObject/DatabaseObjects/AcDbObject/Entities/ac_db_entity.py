from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class AcDbEntity(AcDbObject):
    entity_type: str = "UNKNOWN"
    owner_space_id: str = ""
    layer: str = "0"
    bbox: Dict[str, object] = field(default_factory=dict)
    geometry: Dict[str, object] = field(default_factory=dict)
    style: Dict[str, object] = field(default_factory=dict)
    resolved: Dict[str, object] = field(default_factory=dict)
    semantic_type: str = "unknown"
    semantic_subtype: str = "UNKNOWN"
    source_acdb_type: str = ""
    raw_entity: Dict[str, object] = field(default_factory=dict)
