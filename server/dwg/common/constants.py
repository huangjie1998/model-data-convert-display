"""Constants for DWG service core."""
from __future__ import annotations

from typing import Dict, Tuple

Affine2D = Tuple[float, float, float, float, float, float]
DWG_CORE_PARSER_REV = "2026-04-27-r27"
DEFAULT_LINEWEIGHT_MM = 0.25
TEXT_ENTITY_TYPES: set[str] = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}

__all__ = ["Affine2D", "DWG_CORE_PARSER_REV", "DEFAULT_LINEWEIGHT_MM", "TEXT_ENTITY_TYPES"]
