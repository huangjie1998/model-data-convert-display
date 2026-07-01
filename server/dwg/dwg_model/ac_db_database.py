from __future__ import annotations

import importlib

_module = importlib.import_module("server.dwg.dwg_model.AcRxObject.Database Releated.ac_db_database")
AcDbDatabase = _module.AcDbDatabase

__all__ = ["AcDbDatabase"]
