from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import AcDbLayerTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbLayerTable(AcDbSymbolTable):
    name: str = "layers"
    records: Dict[str, AcDbLayerTableRecord] = field(default_factory=dict)
