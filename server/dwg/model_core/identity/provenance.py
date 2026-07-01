from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CadSourceProvenance:
    source: str = "oda_dump"
    section: str = ""
    line_start: int | None = None
    line_end: int | None = None
    raw: Dict[str, object] = field(default_factory=dict)
