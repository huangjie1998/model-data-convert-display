from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import (
    AcDbAbstractViewTableRecord,
    AcDbViewTableRecord,
    AcDbViewportTableRecord,
)

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbAbstractViewTable(AcDbSymbolTable):
    records: Dict[str, AcDbAbstractViewTableRecord] = field(default_factory=dict)


@dataclass
class AcDbViewTable(AcDbAbstractViewTable):
    name: str = "views"
    records: Dict[str, AcDbViewTableRecord] = field(default_factory=dict)


@dataclass
class AcDbViewportTable(AcDbAbstractViewTable):
    name: str = "viewports"
    records: Dict[str, AcDbViewportTableRecord] = field(default_factory=dict)
