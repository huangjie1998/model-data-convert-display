from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from server.dwg.dwg_model import AcDbObject


@dataclass
class AcDbXrecord(AcDbObject):
    values: List[object] = field(default_factory=list)
    typed_values: List[Dict[str, object]] = field(default_factory=list)
