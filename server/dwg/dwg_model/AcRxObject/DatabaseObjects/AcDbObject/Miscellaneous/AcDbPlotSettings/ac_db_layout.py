from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.model_core.named_object import NamedDbObjectMixin


@dataclass
class AcDbLayout(NamedDbObjectMixin):
    space_id: str = ""
    properties: Dict[str, object] = field(default_factory=dict)
