from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.cad_model.dbobjects.base import CadDbObject


@dataclass
class CadEntity(CadDbObject):
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


@dataclass
class UnsupportedCadEntity(CadEntity):
    unsupported_reason: str = "unsupported_entity_type"
