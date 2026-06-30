from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.cad_model.entities.base import CadEntity


@dataclass
class CadBlockReference(CadEntity):
    block_name: str = ""
    transform: Dict[str, object] = field(default_factory=dict)
