from __future__ import annotations

from typing import Dict, Iterable

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import AcDbBlockTableRecord
from server.dwg.model_core.identity.object_id import cad_object_id


def build_spaces(raw_spaces: Iterable[Dict[str, object]]) -> Dict[str, AcDbBlockTableRecord]:
    spaces: Dict[str, AcDbBlockTableRecord] = {}
    for rec in raw_spaces:
        sid = str(rec.get("id") or "model")
        kind = str(rec.get("kind") or ("model" if sid == "model" else "layout"))
        is_model_space = kind.lower() == "model"
        spaces[sid] = AcDbBlockTableRecord(
            object_id=cad_object_id(f"space:{sid}"),
            object_type="AcDbBlockTableRecord",
            name=sid,
            table_name="BLOCK",
            is_model_space=is_model_space,
            is_paper_space=not is_model_space,
            display_name=str(rec.get("display_name") or sid),
            raw_properties=dict(rec),
            normalized_properties=dict(rec),
            properties=dict(rec),
        )
    if "model" not in spaces:
        spaces["model"] = AcDbBlockTableRecord(
            object_id=cad_object_id("space:model"),
            object_type="AcDbBlockTableRecord",
            name="model",
            table_name="BLOCK",
            is_model_space=True,
            display_name="Model",
        )
    return spaces
