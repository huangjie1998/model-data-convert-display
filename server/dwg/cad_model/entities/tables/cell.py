from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CadTableCell:
    row: int = 0
    column: int = 0
    text: str = ""
    properties: Dict[str, object] = field(default_factory=dict)
