from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.model_core.named_object import NamedDbObjectMixin


@dataclass
class AcDbDictionaryEntry:
    name: str
    object_id: str
    hard_owned: bool = False
    raw_properties: Dict[str, object] = field(default_factory=dict)


@dataclass
class AcDbDictionary(NamedDbObjectMixin):
    entries: Dict[str, AcDbDictionaryEntry] = field(default_factory=dict)


@dataclass
class AcDbDictionaryWithDefault(AcDbDictionary):
    default_entry_name: str = ""
