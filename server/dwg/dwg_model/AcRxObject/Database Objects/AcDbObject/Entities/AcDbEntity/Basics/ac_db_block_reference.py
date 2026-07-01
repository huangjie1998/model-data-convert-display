from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model import AcDbEntity


@dataclass
class AcDbBlockReference(AcDbEntity):
    block_name: str = ""
    transform: Dict[str, object] = field(default_factory=dict)
