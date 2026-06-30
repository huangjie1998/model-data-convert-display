from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadDimStyleTableRecord(CadSymbolTableRecord):
    variables: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadDimStyleTable(CadSymbolTable):
    name: str = "dim_styles"
    records: Dict[str, CadDimStyleTableRecord] = field(default_factory=dict)
