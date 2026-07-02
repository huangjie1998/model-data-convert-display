from __future__ import annotations

from typing import Any

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject

_EXPORTS = {
    "AcDbEntity": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities", "AcDbEntity"),
    "AcDbSymbolTable": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTables", "AcDbSymbolTable"),
    "AcDbSymbolTableRecord": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords", "AcDbSymbolTableRecord"),
    "AcDbDataTable": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbDataTable"),
    "AcDbDictionary": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbDictionary"),
    "AcDbDictionaryEntry": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbDictionaryEntry"),
    "AcDbDictionaryWithDefault": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbDictionaryWithDefault"),
    "AcDbGroup": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbGroup"),
    "AcDbLinkedData": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbLinkedData"),
    "AcDbMaterial": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbMaterial"),
    "AcDbMLeaderStyle": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbMLeaderStyle"),
    "AcDbMlineStyle": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbMlineStyle"),
    "AcDbTableStyle": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbTableStyle"),
    "AcDbXrecord": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Miscellaneous", "AcDbXrecord"),
}


def __getattr__(name: str) -> Any:
    if name in _EXPORTS:
        import importlib

        module_name, attr_name = _EXPORTS[name]
        value = getattr(importlib.import_module(module_name), attr_name)
        globals()[name] = value
        return value
    raise AttributeError(name)


__all__ = ["AcDbObject", *_EXPORTS]

import sys as _sys
_sys.modules[__package__.rsplit(".", 1)[0]].AcDbObject = AcDbObject
