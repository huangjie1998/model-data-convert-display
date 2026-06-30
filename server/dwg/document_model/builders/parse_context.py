from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CadParseContext:
    doc_id: str
    source: str = "oda_cli"
    metadata: Dict[str, object] = field(default_factory=dict)
