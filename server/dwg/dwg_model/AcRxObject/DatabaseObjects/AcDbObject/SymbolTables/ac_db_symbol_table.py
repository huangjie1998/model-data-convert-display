from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, Optional

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords import AcDbSymbolTableRecord


@dataclass
class AcDbSymbolTable:
    name: str
    records: Dict[str, AcDbSymbolTableRecord] = field(default_factory=dict)

    def add(self, record: AcDbSymbolTableRecord) -> None:
        self.records[record.name] = record

    def get(self, name: str) -> Optional[AcDbSymbolTableRecord]:
        return self.records.get(name)

    def values(self) -> Iterable[AcDbSymbolTableRecord]:
        return self.records.values()

    def __iter__(self) -> Iterator[AcDbSymbolTableRecord]:
        return iter(self.records.values())
