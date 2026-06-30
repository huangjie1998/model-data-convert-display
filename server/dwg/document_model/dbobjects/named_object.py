from __future__ import annotations

from dataclasses import dataclass

from .base import CadDbObject


@dataclass
class CadNamedDbObject(CadDbObject):
    name: str = ""
