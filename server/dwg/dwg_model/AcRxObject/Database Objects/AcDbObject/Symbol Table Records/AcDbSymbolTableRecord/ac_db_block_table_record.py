from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from ..ac_db_symbol_table_record import AcDbSymbolTableRecord


@dataclass
class AcDbBlockTableRecord(AcDbSymbolTableRecord):
    origin: Dict[str, object] = field(default_factory=dict)
    entity_ids: List[str] = field(default_factory=list)
    block_reference_ids: List[str] = field(default_factory=list)
    is_model_space: bool = False
    is_paper_space: bool = False
    layout_id: str = ""
    display_name: str = ""
    properties: Dict[str, object] = field(default_factory=dict)

    @property
    def kind(self) -> str:
        return "model" if self.is_model_space else "layout"
