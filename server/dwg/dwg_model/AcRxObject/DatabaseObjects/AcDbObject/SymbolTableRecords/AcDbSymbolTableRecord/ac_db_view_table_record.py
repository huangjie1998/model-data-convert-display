from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from ..ac_db_symbol_table_record import AcDbSymbolTableRecord


@dataclass
class AcDbAbstractViewTableRecord(AcDbSymbolTableRecord):
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class AcDbViewTableRecord(AcDbAbstractViewTableRecord):
    pass


@dataclass
class AcDbViewportTableRecord(AcDbAbstractViewTableRecord):
    pass
