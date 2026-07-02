from __future__ import annotations

from dataclasses import dataclass

from ..ac_db_text import AcDbText


@dataclass
class AcDbAttribute(AcDbText):
    tag: str = ""
