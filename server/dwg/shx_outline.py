#!/usr/bin/env python3
"""Stateless SHX outline primitive builder.

Extracted from DwgServiceCore because it is a pure computation with no
session state dependency. Used as the fallback when ODA vectorization is
unavailable.
"""
from __future__ import annotations

import math
from typing import Dict, List

from server.dwg.stroke_font import _shx_char_strokes


def build_shx_outline_primitives(geom: Dict[str, object]) -> List[Dict[str, object]]:
    text = str(geom.get("text", ""))
    if not text:
        return []
    position = geom.get("position")
    if not isinstance(position, dict):
        return []
    lines = text.replace("\r", "").split("\n")
    if not lines:
        return []

    is_mtext = bool(geom.get("is_mtext", False))
    text_vertical = bool(geom.get("text_vertical", False))
    height_source = geom.get("height") if is_mtext or text_vertical else geom.get("actual_height", geom.get("height", 100.0))
    try:
        height = float(height_source)
    except Exception:
        height = 100.0
    if not math.isfinite(height) or height <= 1e-9:
        return []
    try:
        width_factor = float(geom.get("width_factor", 1.0))
    except Exception:
        width_factor = 1.0
    if not math.isfinite(width_factor) or width_factor <= 0:
        width_factor = 1.0
    try:
        oblique_deg = float(geom.get("oblique", 0.0))
    except Exception:
        oblique_deg = 0.0
    try:
        rotation_deg = float(geom.get("rotation", 0.0))
    except Exception:
        rotation_deg = 0.0
    mirrored_x = bool(geom.get("mirrored_x", False))
    mirrored_y = bool(geom.get("mirrored_y", False))
    shear = math.tan(math.radians(oblique_deg))
    rot_rad = math.radians(rotation_deg)
    cos_r = math.cos(rot_rad)
    sin_r = math.sin(rot_rad)

    base_x = float(position.get("x", 0.0))
    base_y = float(position.get("y", 0.0))
    base_z = float(position.get("z", 0.0))

    line_gap = height * (1.22 if is_mtext else 1.0)
    char_w = height * 0.62 * width_factor
    advance = height * 0.72 * width_factor
    try:
        target_width = float(geom.get("actual_width", 0.0))
    except Exception:
        target_width = 0.0
    max_line_len = max((len(line) for line in lines), default=0)
    natural_width = max(0.0, max_line_len * advance)
    fit_x_scale = 1.0
    if (
        not text_vertical
        and abs(math.sin(rot_rad)) < 0.985
        and math.isfinite(target_width)
        and target_width > 1e-9
        and math.isfinite(natural_width)
        and natural_width > 1e-9
        and str(geom.get("text_extents_source") or "").strip().lower() in ("oda_bbox", "oda_actual_width")
    ):
        fit_x_scale = max(1e-6, min(1000.0, target_width / natural_width))

    outlines: List[Dict[str, object]] = []
    for line_index, line in enumerate(lines):
        x_cursor = 0.0
        y_offset = -line_index * line_gap
        for char_index, ch in enumerate(line):
            glyph = _shx_char_strokes(ch)
            if glyph is None:
                glyph = _shx_char_strokes("□")  # □ replacement glyph
            if glyph:
                for stroke in glyph:
                    if len(stroke) < 2:
                        continue
                    points: List[Dict[str, float]] = []
                    for px, py in stroke:
                        x_local = x_cursor + px * char_w
                        y_local = y_offset + py * height
                        if text_vertical:
                            x_local = line_index * line_gap + px * char_w
                            y_local = -(char_index * line_gap) + py * height
                        x_local *= fit_x_scale
                        if mirrored_x:
                            x_local = -x_local
                        if mirrored_y:
                            y_local = -y_local
                        x_sheared = x_local + shear * y_local
                        y_sheared = y_local
                        xr = x_sheared * cos_r - y_sheared * sin_r
                        yr = x_sheared * sin_r + y_sheared * cos_r
                        points.append({"x": base_x + xr, "y": base_y + yr, "z": base_z})
                    if len(points) >= 2:
                        outlines.append(
                            {
                                "kind": "polyline",
                                "points": points,
                                "closed": False,
                                "subtype": "shx_outline",
                            }
                        )
            if not text_vertical:
                x_cursor += advance
    return outlines
