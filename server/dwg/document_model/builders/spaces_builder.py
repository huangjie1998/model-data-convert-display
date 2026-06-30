from __future__ import annotations

from typing import Dict, Iterable

from server.dwg.document_model.identity.object_id import cad_object_id
from server.dwg.document_model.spaces.base import CadSpace
from server.dwg.document_model.spaces.model_space import CadModelSpace
from server.dwg.document_model.spaces.paper_space import CadPaperSpace


def build_spaces(raw_spaces: Iterable[Dict[str, object]]) -> Dict[str, CadSpace]:
    spaces: Dict[str, CadSpace] = {}
    for rec in raw_spaces:
        sid = str(rec.get("id") or "model")
        kind = str(rec.get("kind") or ("model" if sid == "model" else "layout"))
        cls = CadModelSpace if kind.lower() == "model" else CadPaperSpace
        spaces[sid] = cls(
            object_id=cad_object_id(f"space:{sid}"),
            object_type="SPACE",
            name=sid,
            kind=kind,
            display_name=str(rec.get("display_name") or sid),
            raw_properties=dict(rec),
            normalized_properties=dict(rec),
        )
    if "model" not in spaces:
        spaces["model"] = CadModelSpace(
            object_id=cad_object_id("space:model"),
            object_type="SPACE",
            name="model",
            kind="model",
            display_name="Model",
        )
    return spaces
