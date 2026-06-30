from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.document_model.dbobjects.named_object import CadNamedDbObject


@dataclass
class CadLayout(CadNamedDbObject):
    space_id: str = ""
    properties: Dict[str, object] = field(default_factory=dict)
