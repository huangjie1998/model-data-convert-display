from __future__ import annotations

from dataclasses import dataclass

from server.dwg.document_model.entities.base import CadEntity


@dataclass
class CadDimension(CadEntity):
    dim_kind: str = ""
    dim_style: str = ""
