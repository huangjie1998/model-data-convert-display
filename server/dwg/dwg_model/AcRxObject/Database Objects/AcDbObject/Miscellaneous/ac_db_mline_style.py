from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from server.dwg.dwg_model import AcDbObject


@dataclass
class AcDbMlineStyle(AcDbObject):
    name: str = ""
    description: str = ""
    elements: List[Dict[str, object]] = field(default_factory=list)
    properties: Dict[str, object] = field(default_factory=dict)
