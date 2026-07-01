from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class CadRenderDiagnostic:
    owner_object_id: str
    code: str
    message: str
    severity: str = "warning"


@dataclass
class CadRenderResult:
    ok: bool
    owner_object_id: str
    primitives: List[Dict[str, object]] = field(default_factory=list)
    diagnostics: List[CadRenderDiagnostic] = field(default_factory=list)
