from __future__ import annotations

from dataclasses import dataclass

from .insert import CadBlockReference


@dataclass
class CadViewRepBlockReference(CadBlockReference):
    pass
