from __future__ import annotations

from typing import Any

from server.dwg.dwg_model.ac_rx_object import AcRxObject

_EXPORTS = {
    "AcDbObject": ("server.dwg.dwg_model.AcRxObject.DatabaseObjects", "AcDbObject"),
}


def __getattr__(name: str) -> Any:
    if name in _EXPORTS:
        import importlib

        module_name, attr_name = _EXPORTS[name]
        value = getattr(importlib.import_module(module_name), attr_name)
        globals()[name] = value
        return value
    raise AttributeError(name)


__all__ = ["AcRxObject", "AcDbObject"]

import sys as _sys
_sys.modules[__package__.rsplit(".", 1)[0]].AcRxObject = AcRxObject
