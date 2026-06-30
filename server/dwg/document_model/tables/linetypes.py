from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadLinetypeTableRecord(CadSymbolTableRecord):
    pattern: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadLinetypeTable(CadSymbolTable):
    name: str = "linetypes"
    records: Dict[str, CadLinetypeTableRecord] = field(default_factory=dict)
