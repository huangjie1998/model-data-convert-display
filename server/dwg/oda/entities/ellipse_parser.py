from __future__ import annotations

import math
from typing import Dict

from server.dwg.oda.entities.common import NOT_HANDLED


def build_ellipse_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    if state.get("et") != "acdbellipse":
        return NOT_HANDLED

    center_pt = state.get("center_pt")
    if center_pt is None:
        return None
    major_axis_vec = state.get("major_axis_vec")
    minor_axis_vec = state.get("minor_axis_vec")
    major_radius = state.get("major_radius")
    minor_radius = state.get("minor_radius")
    radius = state.get("radius")
    rotation_deg = state.get("rotation_deg")
    if major_radius is None and isinstance(major_axis_vec, dict):
        major_radius = math.hypot(float(major_axis_vec.get("x", 0.0)), float(major_axis_vec.get("y", 0.0)))
    if minor_radius is None and isinstance(minor_axis_vec, dict):
        minor_radius = math.hypot(float(minor_axis_vec.get("x", 0.0)), float(minor_axis_vec.get("y", 0.0)))
    if major_radius is None:
        major_radius = radius
    if major_radius is None or major_radius <= 0:
        return None
    if minor_radius is None or minor_radius <= 0:
        minor_radius = major_radius
    if rotation_deg is None and isinstance(major_axis_vec, dict):
        rotation_deg = math.degrees(math.atan2(float(major_axis_vec.get("y", 0.0)), float(major_axis_vec.get("x", 0.0))))
    rotation = float(rotation_deg or 0.0)
    bbox = state.get("bbox")
    if bbox is None:
        rx = abs(float(major_radius))
        ry = abs(float(minor_radius))
        bbox = {
            "min": {"x": center_pt["x"] - rx, "y": center_pt["y"] - ry, "z": center_pt.get("z", 0.0)},
            "max": {"x": center_pt["x"] + rx, "y": center_pt["y"] + ry, "z": center_pt.get("z", 0.0)},
        }
    geom_ellipse: Dict[str, object] = {"center": center_pt, "rx": float(major_radius), "ry": float(minor_radius), "rotation": rotation}
    start_angle = state.get("start_angle")
    end_angle = state.get("end_angle")
    start_pt = state.get("start_pt")
    end_pt = state.get("end_pt")
    if isinstance(start_angle, (int, float)):
        geom_ellipse["start_angle"] = float(start_angle)
    if isinstance(end_angle, (int, float)):
        geom_ellipse["end_angle"] = float(end_angle)
    if isinstance(start_pt, dict):
        geom_ellipse["start"] = start_pt
    if isinstance(end_pt, dict):
        geom_ellipse["end"] = end_pt
    if isinstance(major_axis_vec, dict):
        geom_ellipse["major_axis"] = major_axis_vec
    if isinstance(minor_axis_vec, dict):
        geom_ellipse["minor_axis"] = minor_axis_vec
    return {
        "id": state.get("handle"),
        "type": "ELLIPSE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": geom_ellipse,
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
