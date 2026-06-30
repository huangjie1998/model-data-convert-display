from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CadTextIntent:
    text: str
    payload: Dict[str, object] = field(default_factory=dict)
