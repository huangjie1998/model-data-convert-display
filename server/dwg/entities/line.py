from __future__ import annotations

from typing import List

from .primitives_common import Geom, Primitive, is_point_dict


def build_line_primitives(geom: Geom) -> List[Primitive]:
    start = geom.get("start")
    end = geom.get("end")
    if is_point_dict(start) and is_point_dict(end):
        return [{"kind": "line", "start": start, "end": end}]
    return []
