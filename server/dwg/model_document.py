from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from server.dwg.dwg_model import AcDbDatabase
from server.dwg.model_core.diagnostics import CadDiagnostic


@dataclass
class CadDocument:
    doc_id: str
    database: AcDbDatabase = field(default_factory=AcDbDatabase)
    source: str = "oda_cli"
    warnings: List[str] = field(default_factory=list)
    diagnostics: List[CadDiagnostic] = field(default_factory=list)
    metadata: Dict[str, object] = field(default_factory=dict)
