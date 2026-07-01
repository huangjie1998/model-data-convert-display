from __future__ import annotations

from dataclasses import dataclass

from server.dwg.dwg_model import AcDbEntity


@dataclass
class AcDbDimension(AcDbEntity):
    dim_kind: str = ""
    dim_style: str = ""
