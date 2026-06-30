from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.cad_model.dbobjects.base import CadDbObject


@dataclass
class CadViewport(CadDbObject):
    space_id: str = ""
    properties: Dict[str, object] = field(default_factory=dict)
