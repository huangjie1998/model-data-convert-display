from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadLayerTableRecord(CadSymbolTableRecord):
    color_index: int | None = None
    color_rgb: str = ""
    linetype: str = ""
    lineweight_mm: float | None = None
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadLayerTable(CadSymbolTable):
    name: str = "layers"
    records: Dict[str, CadLayerTableRecord] = field(default_factory=dict)
