from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class AcDbDate:
    value: Optional[str] = None
