from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CadObjectReference:
    target_id: str
    kind: str = "soft"
    name: str = ""
