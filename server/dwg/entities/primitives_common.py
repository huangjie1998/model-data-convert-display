from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional


Primitive = Dict[str, object]
Geom = Dict[str, object]
Entity = Dict[str, object]
Point = Dict[str, float]

TEXT_ENTITY_TYPES = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}


@dataclass(frozen=True)
class PrimitiveBuildContext:
    enable_shx_outline: bool
    build_shx_outline_primitives: Callable[[Geom], List[Primitive]]
    resolve_entity_text_color: Callable[[Entity, Geom], Optional[str]]
    entity_semantic_subtype: Callable[[object, Optional[Geom], object], str]
    resolve_dimension_display_text: Callable[[Geom], str]


def is_text_entity_type(ent_type: object) -> bool:
    return str(ent_type or "").strip().upper() in TEXT_ENTITY_TYPES


def is_point_dict(value: object) -> bool:
    return isinstance(value, dict) and isinstance(value.get("x"), (int, float)) and isinstance(value.get("y"), (int, float))


def clean_point_dicts(value: object) -> List[Point]:
    if not isinstance(value, list):
        return []
    return [p for p in value if isinstance(p, dict)]  # type: ignore[list-item]


def finite_float(value: object, fallback: float) -> float:
    if isinstance(value, (int, float)):
        parsed = float(value)
        if math.isfinite(parsed):
            return parsed
    return fallback


def positive_float(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        parsed = float(value)
        if math.isfinite(parsed) and parsed > 0:
            return parsed
    return None


def point_distance(a: Point, b: Point) -> float:
    return math.hypot(float(a.get("x", 0.0)) - float(b.get("x", 0.0)), float(a.get("y", 0.0)) - float(b.get("y", 0.0)))
