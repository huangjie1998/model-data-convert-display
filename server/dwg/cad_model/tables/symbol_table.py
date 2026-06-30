from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, Optional

from server.dwg.cad_model.dbobjects.named_object import CadNamedDbObject


@dataclass
class CadSymbolTableRecord(CadNamedDbObject):
    table_name: str = ""


@dataclass
class CadSymbolTable:
    name: str
    records: Dict[str, CadSymbolTableRecord] = field(default_factory=dict)

    def add(self, record: CadSymbolTableRecord) -> None:
        self.records[record.name] = record

    def get(self, name: str) -> Optional[CadSymbolTableRecord]:
        return self.records.get(name)

    def values(self) -> Iterable[CadSymbolTableRecord]:
        return self.records.values()

    def __iter__(self) -> Iterator[CadSymbolTableRecord]:
        return iter(self.records.values())
