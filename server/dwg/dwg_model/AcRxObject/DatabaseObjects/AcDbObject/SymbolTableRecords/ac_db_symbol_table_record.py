from __future__ import annotations

from dataclasses import dataclass

from server.dwg.model_core.named_object import NamedDbObjectMixin


@dataclass
class AcDbSymbolTableRecord(NamedDbObjectMixin):
    table_name: str = ""
