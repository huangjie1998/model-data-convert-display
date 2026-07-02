from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.ac_db_object import AcDbObject


@dataclass
class AcDbMaterial(AcDbObject):
    name: str = ""
    diffuse_color: str = ""
    ambient_color: str = ""
    specular_color: str = ""
    opacity: float | None = None
    properties: Dict[str, object] = field(default_factory=dict)
