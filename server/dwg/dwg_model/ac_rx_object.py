from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class AcRxObject:
    raw_properties: Dict[str, object] = field(default_factory=dict)
