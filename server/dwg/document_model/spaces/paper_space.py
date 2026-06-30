from __future__ import annotations

from dataclasses import dataclass

from .base import CadSpace


@dataclass
class CadPaperSpace(CadSpace):
    kind: str = "layout"
