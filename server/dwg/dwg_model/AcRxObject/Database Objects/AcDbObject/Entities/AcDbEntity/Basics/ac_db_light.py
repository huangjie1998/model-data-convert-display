from __future__ import annotations

from dataclasses import dataclass

from server.dwg.dwg_model import AcDbEntity


@dataclass
class AcDbLight(AcDbEntity):
    pass
