from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model import AcDbEntity


@dataclass
class AcDbViewport(AcDbEntity):
    view_properties: Dict[str, object] = field(default_factory=dict)
