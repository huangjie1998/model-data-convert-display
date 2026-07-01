from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model import AcDbObject


@dataclass
class AcDbTableStyle(AcDbObject):
    name: str = ""
    text_style_id: str = ""
    cell_styles: Dict[str, Dict[str, object]] = field(default_factory=dict)
    properties: Dict[str, object] = field(default_factory=dict)
