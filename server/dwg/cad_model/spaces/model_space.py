from __future__ import annotations

from dataclasses import dataclass

from .base import CadSpace


@dataclass
class CadModelSpace(CadSpace):
    kind: str = "model"
