from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class CadDimensionPrimitives:
    primitive_ids: List[str] = field(default_factory=list)
    metadata: Dict[str, object] = field(default_factory=dict)
