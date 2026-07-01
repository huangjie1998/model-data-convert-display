from __future__ import annotations

from dataclasses import dataclass

from server.dwg.dwg_model import AcDbObject


@dataclass
class NamedDbObjectMixin(AcDbObject):
    name: str = ""
