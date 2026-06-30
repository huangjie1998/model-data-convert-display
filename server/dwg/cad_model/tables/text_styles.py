from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadTextStyleTableRecord(CadSymbolTableRecord):
    font_name: str = ""
    bigfont_name: str = ""
    font_key: str = ""
    bigfont_key: str = ""
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadTextStyleTable(CadSymbolTable):
    name: str = "text_styles"
    records: Dict[str, CadTextStyleTableRecord] = field(default_factory=dict)
