from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class CadAttributeCollection:
    attribute_ids: List[str] = field(default_factory=list)
