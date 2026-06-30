from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from .symbol_table import CadSymbolTable, CadSymbolTableRecord


@dataclass
class CadBlockTableRecord(CadSymbolTableRecord):
    origin: Dict[str, object] = field(default_factory=dict)
    entity_ids: List[str] = field(default_factory=list)
    properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class CadBlockTable(CadSymbolTable):
    name: str = "blocks"
    records: Dict[str, CadBlockTableRecord] = field(default_factory=dict)
