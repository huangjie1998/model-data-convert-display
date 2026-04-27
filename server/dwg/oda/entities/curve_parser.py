from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.arc_parser import build_arc_entity
from server.dwg.oda.entities.circle_parser import build_circle_entity
from server.dwg.oda.entities.common import NOT_HANDLED
from server.dwg.oda.entities.ellipse_parser import build_ellipse_entity
from server.dwg.oda.entities.line_parser import build_line_entity
from server.dwg.oda.entities.polyline_parser import build_polyline_entity
from server.dwg.oda.entities.ray_parser import build_ray_entity
from server.dwg.oda.entities.spline_parser import build_spline_entity


def build_curve_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    for builder in (
        build_line_entity,
        build_polyline_entity,
        build_circle_entity,
        build_arc_entity,
        build_ray_entity,
        build_ellipse_entity,
        build_spline_entity,
    ):
        result = builder(state, context)
        if result is not NOT_HANDLED:
            return result
    return NOT_HANDLED
