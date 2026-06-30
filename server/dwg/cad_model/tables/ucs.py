from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadUcsTableRecord(CadSymbolTableRecord):
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadUcsTable(CadSymbolTable):
    name: str = "ucs"
    records: Dict[str, CadUcsTableRecord] = field(default_factory=dict)
