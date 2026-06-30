from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadAbstractViewTableRecord(CadSymbolTableRecord):
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadViewTableRecord(CadAbstractViewTableRecord):
    pass


@dataclass
class CadViewportTableRecord(CadAbstractViewTableRecord):
    pass


@dataclass
class CadAbstractViewTable(CadSymbolTable):
    records: Dict[str, CadAbstractViewTableRecord] = field(default_factory=dict)


@dataclass
class CadViewTable(CadAbstractViewTable):
    name: str = "views"
    records: Dict[str, CadViewTableRecord] = field(default_factory=dict)


@dataclass
class CadViewportTable(CadAbstractViewTable):
    name: str = "viewports"
    records: Dict[str, CadViewportTableRecord] = field(default_factory=dict)
