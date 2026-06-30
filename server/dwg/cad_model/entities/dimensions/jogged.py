from __future__ import annotations

from dataclasses import dataclass

from .radial import CadRadialDimension


@dataclass
class CadJoggedDimension(CadRadialDimension):
    pass
