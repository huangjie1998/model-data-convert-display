from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CadObjectId:
    value: str
    handle: str = ""

    def __str__(self) -> str:
        return self.value


def cad_object_id(value: object, *, handle: object = "") -> CadObjectId:
    token = str(value or "").strip()
    handle_token = str(handle or "").strip()
    return CadObjectId(value=token or handle_token or "unknown", handle=handle_token)
