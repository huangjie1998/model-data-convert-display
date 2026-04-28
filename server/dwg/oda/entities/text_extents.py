from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple


def _finite_float(value: object) -> Optional[float]:
    try:
        result = float(value)
    except Exception:
        return None
    return result if math.isfinite(result) else None


def _bbox_min_max(bbox: object) -> Optional[Tuple[float, float, float, float]]:
    if not isinstance(bbox, dict) or not isinstance(bbox.get("min"), dict) or not isinstance(bbox.get("max"), dict):
        return None
    bmin = bbox["min"]
    bmax = bbox["max"]
    min_x = _finite_float(bmin.get("x"))
    min_y = _finite_float(bmin.get("y"))
    max_x = _finite_float(bmax.get("x"))
    max_y = _finite_float(bmax.get("y"))
    if min_x is None or min_y is None or max_x is None or max_y is None:
        return None
    return min(min_x, max_x), min(min_y, max_y), max(min_x, max_x), max(min_y, max_y)


def _project_bbox_to_text_axes(bbox: object, rotation_deg: object = 0.0) -> Tuple[Optional[float], Optional[float]]:
    mm = _bbox_min_max(bbox)
    if mm is None:
        return None, None
    min_x, min_y, max_x, max_y = mm
    try:
        rotation = math.radians(float(rotation_deg or 0.0))
    except Exception:
        rotation = 0.0
    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)
    local_x_values: List[float] = []
    local_y_values: List[float] = []
    for x, y in ((min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y)):
        local_x_values.append(x * cos_r + y * sin_r)
        local_y_values.append(-x * sin_r + y * cos_r)
    width = max(local_x_values) - min(local_x_values)
    height = max(local_y_values) - min(local_y_values)
    if width is None or not math.isfinite(width) or width <= 1e-9:
        width = None
    if height is None or not math.isfinite(height) or height <= 1e-9:
        height = None
    return width, height


def text_extents_from_bbox(
    bbox: object,
    *,
    rotation_deg: object = 0.0,
    declared_height: object = None,
    is_mtext: object = False,
    text_vertical: object = False,
) -> Tuple[Optional[float], Optional[float]]:
    mm = _bbox_min_max(bbox)
    if mm is None:
        return None, None
    min_x, min_y, max_x, max_y = mm
    bbox_width = max_x - min_x
    bbox_height = max_y - min_y
    projected_width, projected_height = _project_bbox_to_text_axes(bbox, rotation_deg)
    width = projected_width if projected_width is not None else bbox_width
    height = projected_height if projected_height is not None else bbox_height
    try:
        rotation = math.radians(float(rotation_deg or 0.0))
    except Exception:
        rotation = 0.0
    cos_r = abs(math.cos(rotation))
    sin_r = abs(math.sin(rotation))
    try:
        text_height = float(declared_height)
    except Exception:
        text_height = 0.0
    is_multi_line = bool(is_mtext)
    is_vertical = bool(text_vertical)
    if not is_multi_line and not is_vertical and math.isfinite(text_height) and text_height > 1e-9:
        candidates = []
        if cos_r > 1e-6:
            candidates.append((bbox_width - text_height * sin_r) / cos_r)
        if sin_r > 1e-6:
            candidates.append((bbox_height - text_height * cos_r) / sin_r)
        clean = [c for c in candidates if math.isfinite(c) and c > 1e-9]
        if clean:
            width = max(clean)
            height = text_height
    elif is_vertical and math.isfinite(text_height) and text_height > 1e-9:
        width = min(width, text_height) if width is not None and width > 1e-9 else text_height
    if width is None or not math.isfinite(width) or width <= 1e-9:
        width = None
    if height is None or not math.isfinite(height) or height <= 1e-9:
        height = None
    return width, height


def apply_text_extents_to_geom(geom: Dict[str, object], bbox: object, *, source: str) -> None:
    is_mtext = bool(geom.get("is_mtext", False))
    text_vertical = bool(geom.get("text_vertical", False))
    width, height = text_extents_from_bbox(
        bbox,
        rotation_deg=geom.get("rotation"),
        declared_height=geom.get("height") or geom.get("actual_height"),
        is_mtext=is_mtext,
        text_vertical=text_vertical,
    )
    if width is not None:
        geom["actual_width"] = width
        geom["bbox_width"] = width
    if height is not None:
        geom["bbox_height"] = height
    if height is not None and not is_mtext and not text_vertical:
        geom["actual_height"] = height
    if width is not None or height is not None:
        geom["text_extents_source"] = source
