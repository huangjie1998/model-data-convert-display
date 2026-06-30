from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadRegAppTableRecord(CadSymbolTableRecord):
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadRegAppTable(CadSymbolTable):
    name: str = "appids"
    records: Dict[str, CadRegAppTableRecord] = field(default_factory=dict)
