from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from .database import CadDatabase
from .diagnostics import CadDiagnostic


@dataclass
class CadDocument:
    doc_id: str
    database: CadDatabase = field(default_factory=CadDatabase)
    source: str = "oda_cli"
    warnings: List[str] = field(default_factory=list)
    diagnostics: List[CadDiagnostic] = field(default_factory=list)
