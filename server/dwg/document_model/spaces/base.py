from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from server.dwg.document_model.dbobjects.named_object import CadNamedDbObject


@dataclass
class CadSpace(CadNamedDbObject):
    kind: str = "model"
    display_name: str = ""
    entity_ids: List[str] = field(default_factory=list)
    block_reference_ids: List[str] = field(default_factory=list)
