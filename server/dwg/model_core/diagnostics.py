from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CadDiagnostic:
    code: str
    message: str
    severity: str = "warning"
    object_id: str = ""
    details: Dict[str, object] = field(default_factory=dict)


def diagnostic(code: str, message: str, *, severity: str = "warning", object_id: str = "", **details: object) -> CadDiagnostic:
    return CadDiagnostic(code=code, message=message, severity=severity, object_id=object_id, details=dict(details))
