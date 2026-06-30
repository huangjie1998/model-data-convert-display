from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class CadEntityRenderIntent:
    owner_object_id: str
    entity_type: str
    kind: str
    payload: Dict[str, object] = field(default_factory=dict)
    diagnostics: List[str] = field(default_factory=list)


@dataclass
class CadRenderIntent:
    doc_id: str
    space_id: str
    entities: List[CadEntityRenderIntent] = field(default_factory=list)
