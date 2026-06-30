from __future__ import annotations

from dataclasses import dataclass

from server.dwg.document_model.entities.base import UnsupportedCadEntity


@dataclass
class CadProxyEntity(UnsupportedCadEntity):
    unsupported_reason: str = "proxy_entity"
