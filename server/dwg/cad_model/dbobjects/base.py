from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from server.dwg.cad_model.diagnostics import CadDiagnostic
from server.dwg.cad_model.identity.object_id import CadObjectId
from server.dwg.cad_model.identity.provenance import CadSourceProvenance


@dataclass
class CadDbObject:
    object_id: CadObjectId
    object_type: str
    handle: str = ""
    owner_id: str = ""
    raw_properties: Dict[str, object] = field(default_factory=dict)
    normalized_properties: Dict[str, object] = field(default_factory=dict)
    provenance: CadSourceProvenance = field(default_factory=CadSourceProvenance)
    diagnostics: List[CadDiagnostic] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.object_id.value

    def add_diagnostic(self, diagnostic: CadDiagnostic) -> None:
        self.diagnostics.append(diagnostic)
