from __future__ import annotations

from dataclasses import dataclass

from .base import CadTextEntity


@dataclass
class CadAttribute(CadTextEntity):
    tag: str = ""
