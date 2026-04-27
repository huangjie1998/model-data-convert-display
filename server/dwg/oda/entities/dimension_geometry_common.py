from __future__ import annotations

from typing import Dict, Optional


def pick_named_point(named_points: Dict[str, object], *keys: str) -> Optional[Dict[str, float]]:
    for key in keys:
        point = named_points.get(key)
        if isinstance(point, dict):
            return point
    return None


def point_key(point: Dict[str, float]) -> tuple[float, float, float]:
    return (
        float(point.get("x", 0.0)),
        float(point.get("y", 0.0)),
        float(point.get("z", 0.0)),
    )
