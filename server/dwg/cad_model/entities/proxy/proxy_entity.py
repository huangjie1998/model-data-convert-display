from __future__ import annotations

from dataclasses import dataclass

from server.dwg.cad_model.entities.base import UnsupportedCadEntity


@dataclass
class CadProxyEntity(UnsupportedCadEntity):
    unsupported_reason: str = "proxy_entity"
