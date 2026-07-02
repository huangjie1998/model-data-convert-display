from __future__ import annotations

from .ac_db_symbol_table import AcDbSymbolTable

__all__ = ["AcDbSymbolTable"]
import importlib as _importlib
import sys as _sys
import types as _types

_CLASS_EXPORTS = {'AcDbSymbolTable': ('server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTables.ac_db_symbol_table', 'AcDbSymbolTable')}

class _LayerModule(_types.ModuleType):
    def __getattribute__(self, name: str):
        exports = _types.ModuleType.__getattribute__(self, "__dict__").get("_CLASS_EXPORTS", {})
        if name in exports:
            current = _types.ModuleType.__getattribute__(self, "__dict__").get(name)
            if isinstance(current, _types.ModuleType):
                module_name, attr_name = exports[name]
                value = getattr(_importlib.import_module(module_name), attr_name)
                _types.ModuleType.__getattribute__(self, "__dict__")[name] = value
                return value
        return _types.ModuleType.__getattribute__(self, name)

_sys.modules[__name__].__class__ = _LayerModule
