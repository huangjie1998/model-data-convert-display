from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any

_DWG_MODEL_ROOT = Path(__file__).resolve().parent

_EXPORTS = {
    "AcDbObject": ("server.dwg.dwg_model.AcRxObject.Database Objects.ac_db_object", "AcDbObject"),
    "AcDbEntity": ("server.dwg.dwg_model.AcRxObject.Database Objects.AcDbObject.Entities.ac_db_entity", "AcDbEntity"),
    "AcDbDatabase": ("server.dwg.dwg_model.AcRxObject.Database Releated.ac_db_database", "AcDbDatabase"),
}


def __getattr__(name: str) -> Any:
    if name in _EXPORTS:
        module_name, attr_name = _EXPORTS[name]
        value = getattr(importlib.import_module(module_name), attr_name)
        globals()[name] = value
        return value
    raise AttributeError(name)


__all__ = [
    "AcDbObject",
    "AcDbEntity",
    "AcDbDatabase",
]
