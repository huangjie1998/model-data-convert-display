from __future__ import annotations

from dataclasses import dataclass

from server.dwg.document_model.entities.base import CadEntity


@dataclass
class CadTextEntity(CadEntity):
    text: str = ""
    text_style: str = ""
