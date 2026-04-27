from __future__ import annotations

import math
import re
from typing import Dict, List, Tuple

from server.dwg.oda.entities.common import NOT_HANDLED


def build_leader_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    et = str(state.get("et") or "")
    if et != "acdbleader":
        return NOT_HANDLED

    vertices = state.get("vertices") or []
    named_points = state.get("named_points") or {}
    start_pt = state.get("start_pt")
    end_pt = state.get("end_pt")
    bbox = state.get("bbox")
    header_dim_defaults = state.get("header_dim_defaults") or {}
    leader_arrow_block = state.get("leader_arrow_block")
    leader_arrow_size = state.get("leader_arrow_size")
    leader_points = [p for p in vertices if isinstance(p, dict)]
    if len(leader_points) < 2:
        by_index: List[Tuple[int, Dict[str, float]]] = []
        for key, point in named_points.items():
            match = re.match(r"^vertex\s+(\d+)$", key)
            if not match:
                continue
            by_index.append((int(match.group(1)), point))
        by_index.sort(key=lambda item: item[0])
        leader_points = [point for _, point in by_index]
    if len(leader_points) < 2 and isinstance(start_pt, dict) and isinstance(end_pt, dict):
        leader_points = [start_pt, end_pt]
    if len(leader_points) < 2:
        return None
    if bbox is None:
        bbox = context.bbox_from_points(leader_points)
    resolved_leader_arrow_block = (
        leader_arrow_block
        or context.normalize_dimblk_name(header_dim_defaults.get("dimldrblk"))
        or context.normalize_dimblk_name(header_dim_defaults.get("dimblk"))
    )
    resolved_leader_arrow_size = leader_arrow_size
    if (
        not isinstance(resolved_leader_arrow_size, (int, float))
        or not math.isfinite(float(resolved_leader_arrow_size))
        or float(resolved_leader_arrow_size) <= 0
    ):
        default_dimasz = header_dim_defaults.get("dimasz")
        if isinstance(default_dimasz, (int, float)) and math.isfinite(float(default_dimasz)) and float(default_dimasz) > 0:
            resolved_leader_arrow_size = float(default_dimasz)
    geom_leader: Dict[str, object] = {
        "points": leader_points,
        "has_arrowhead": bool(state.get("leader_has_arrowhead")),
        "splined": bool(state.get("leader_splined")),
        "arrow_block": resolved_leader_arrow_block,
    }
    if isinstance(resolved_leader_arrow_size, (int, float)) and math.isfinite(float(resolved_leader_arrow_size)) and float(resolved_leader_arrow_size) > 0:
        geom_leader["arrow_size"] = float(resolved_leader_arrow_size)
    return {
        "id": state.get("handle"),
        "type": "LEADER",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": geom_leader,
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
