from __future__ import annotations

import math
from typing import Dict, Optional


def resolve_linear_dimension_text_position(
    *,
    dim_kind: str,
    line_start: object,
    line_end: object,
    text_pos: object,
    text_pos_is_implicit: bool,
    dim_effective_vars: Dict[str, object],
) -> tuple[object, Optional[float]]:
    line_dir_angle_deg: Optional[float] = None
    if (
        dim_kind in ("rotated", "aligned", "dimension")
        and isinstance(line_start, dict)
        and isinstance(line_end, dict)
    ):
        dx = float(line_end.get("x", 0.0)) - float(line_start.get("x", 0.0))
        dy = float(line_end.get("y", 0.0)) - float(line_start.get("y", 0.0))
        length = math.hypot(dx, dy)
        if length > 1e-9:
            line_dir_angle_deg = math.degrees(math.atan2(dy, dx))
            if text_pos_is_implicit:
                nx = -dy / length
                ny = dx / length
                gap = dim_effective_vars.get("dimgap")
                tad = dim_effective_vars.get("dimtad")
                try:
                    gap_val = float(gap) if gap is not None else 0.0
                except (TypeError, ValueError):
                    gap_val = 0.0
                try:
                    tad_val = int(tad) if tad is not None else 0
                except (TypeError, ValueError):
                    tad_val = 0
                sign = 1.0 if tad_val > 0 else (-1.0 if tad_val < 0 else 0.0)
                mid_x = (float(line_start.get("x", 0.0)) + float(line_end.get("x", 0.0))) * 0.5
                mid_y = (float(line_start.get("y", 0.0)) + float(line_end.get("y", 0.0))) * 0.5
                text_pos = {
                    "x": mid_x + nx * gap_val * sign,
                    "y": mid_y + ny * gap_val * sign,
                    "z": float(line_start.get("z", line_end.get("z", 0.0))),
                }
    return text_pos, line_dir_angle_deg
