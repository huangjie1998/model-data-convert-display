from __future__ import annotations

import math
from typing import Dict, Optional

from server.dwg.oda.entities.common import NOT_HANDLED


def _finite_float(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        parsed = float(value)
        if math.isfinite(parsed):
            return parsed
    return None


def _vector_length(vec: object) -> Optional[float]:
    if not isinstance(vec, dict):
        return None
    length = math.hypot(float(vec.get("x", 0.0)), float(vec.get("y", 0.0)))
    return length if math.isfinite(length) and length > 1e-12 else None


def _axis_from_radius_rotation(radius: float, rotation_deg: float) -> Dict[str, float]:
    rotation_rad = math.radians(rotation_deg)
    return {
        "x": radius * math.cos(rotation_rad),
        "y": radius * math.sin(rotation_rad),
        "z": 0.0,
    }


def _minor_axis_from_major_axis(major_axis: Dict[str, object], minor_radius: float) -> Optional[Dict[str, float]]:
    major_len = _vector_length(major_axis)
    if major_len is None:
        return None
    major_x = float(major_axis.get("x", 0.0))
    major_y = float(major_axis.get("y", 0.0))
    return {
        "x": -major_y / major_len * minor_radius,
        "y": major_x / major_len * minor_radius,
        "z": 0.0,
    }


def _ellipse_bbox(center: Dict[str, float], major_axis: Dict[str, object], minor_axis: Dict[str, object]) -> Optional[Dict[str, Dict[str, float]]]:
    points = []
    for idx in range(128):
        angle = math.tau * idx / 128.0
        cos_t = math.cos(angle)
        sin_t = math.sin(angle)
        points.append(
            {
                "x": float(center["x"]) + float(major_axis.get("x", 0.0)) * cos_t + float(minor_axis.get("x", 0.0)) * sin_t,
                "y": float(center["y"]) + float(major_axis.get("y", 0.0)) * cos_t + float(minor_axis.get("y", 0.0)) * sin_t,
                "z": float(center.get("z", 0.0)),
            }
        )
    if not points:
        return None
    xs = [point["x"] for point in points]
    ys = [point["y"] for point in points]
    zs = [point["z"] for point in points]
    return {
        "min": {"x": min(xs), "y": min(ys), "z": min(zs)},
        "max": {"x": max(xs), "y": max(ys), "z": max(zs)},
    }


def _ellipse_parameter_degrees_from_point(
    point: object,
    center: Dict[str, float],
    major_axis: object,
    minor_axis: object,
) -> Optional[float]:
    major_len = _vector_length(major_axis)
    minor_len = _vector_length(minor_axis)
    if not isinstance(point, dict) or not isinstance(major_axis, dict) or not isinstance(minor_axis, dict) or major_len is None or minor_len is None:
        return None
    rel_x = float(point.get("x", 0.0)) - float(center["x"])
    rel_y = float(point.get("y", 0.0)) - float(center["y"])
    major_x = float(major_axis.get("x", 0.0)) / major_len
    major_y = float(major_axis.get("y", 0.0)) / major_len
    minor_x = float(minor_axis.get("x", 0.0)) / minor_len
    minor_y = float(minor_axis.get("y", 0.0)) / minor_len
    cos_t = (rel_x * major_x + rel_y * major_y) / major_len
    sin_t = (rel_x * minor_x + rel_y * minor_y) / minor_len
    return math.degrees(math.atan2(sin_t, cos_t))


def _ellipse_parameter_degrees(value: object) -> Optional[float]:
    parsed = _finite_float(value)
    if parsed is None:
        return None
    if abs(parsed) <= math.tau + 1e-9:
        return math.degrees(parsed)
    return parsed


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
    radius_ratio = _finite_float(state.get("radius_ratio"))
    rotation_deg = state.get("rotation_deg")

    if isinstance(major_axis_vec, dict):
        major_radius = _vector_length(major_axis_vec) or major_radius
    if isinstance(minor_axis_vec, dict):
        minor_radius = _vector_length(minor_axis_vec) or minor_radius
    if major_radius is None:
        major_radius = radius
    major_radius = _finite_float(major_radius)
    if major_radius is None or major_radius <= 0:
        return None
    minor_radius = _finite_float(minor_radius)
    if (minor_radius is None or minor_radius <= 0) and radius_ratio is not None:
        minor_radius = major_radius * radius_ratio
    if minor_radius is None or minor_radius <= 0:
        minor_radius = major_radius

    if rotation_deg is None and isinstance(major_axis_vec, dict):
        rotation_deg = math.degrees(math.atan2(float(major_axis_vec.get("y", 0.0)), float(major_axis_vec.get("x", 0.0))))
    rotation = float(rotation_deg or 0.0)

    if not isinstance(major_axis_vec, dict):
        major_axis_vec = _axis_from_radius_rotation(float(major_radius), rotation)
    if not isinstance(minor_axis_vec, dict):
        minor_axis_vec = _minor_axis_from_major_axis(major_axis_vec, float(minor_radius))

    bbox = state.get("bbox")
    if bbox is None:
        if isinstance(major_axis_vec, dict) and isinstance(minor_axis_vec, dict):
            bbox = _ellipse_bbox(center_pt, major_axis_vec, minor_axis_vec)
        if bbox is None:
            rx = abs(float(major_radius))
            ry = abs(float(minor_radius))
            bbox = {
                "min": {"x": center_pt["x"] - rx, "y": center_pt["y"] - ry, "z": center_pt.get("z", 0.0)},
                "max": {"x": center_pt["x"] + rx, "y": center_pt["y"] + ry, "z": center_pt.get("z", 0.0)},
            }
    geom_ellipse: Dict[str, object] = {"center": center_pt, "rx": float(major_radius), "ry": float(minor_radius), "rotation": rotation}
    if radius_ratio is not None:
        geom_ellipse["radius_ratio"] = radius_ratio
    start_angle = state.get("start_angle")
    end_angle = state.get("end_angle")
    start_pt = state.get("start_pt")
    end_pt = state.get("end_pt")
    if isinstance(start_pt, dict):
        geom_ellipse["start"] = start_pt
    if isinstance(end_pt, dict):
        geom_ellipse["end"] = end_pt
    if isinstance(major_axis_vec, dict):
        geom_ellipse["major_axis"] = major_axis_vec
    if isinstance(minor_axis_vec, dict):
        geom_ellipse["minor_axis"] = minor_axis_vec
    resolved_start_angle = _ellipse_parameter_degrees_from_point(start_pt, center_pt, major_axis_vec, minor_axis_vec)
    resolved_end_angle = _ellipse_parameter_degrees_from_point(end_pt, center_pt, major_axis_vec, minor_axis_vec)
    if resolved_start_angle is None:
        resolved_start_angle = _ellipse_parameter_degrees(start_angle)
    if resolved_end_angle is None:
        resolved_end_angle = _ellipse_parameter_degrees(end_angle)
    if resolved_start_angle is not None:
        geom_ellipse["start_angle"] = resolved_start_angle
    if resolved_end_angle is not None:
        geom_ellipse["end_angle"] = resolved_end_angle
    return {
        "id": state.get("handle"),
        "type": "ELLIPSE",
        "layer": state.get("layer"),
        "space_id": state.get("space_id"),
        "geom": geom_ellipse,
        "style": state.get("style_obj"),
        "bbox": bbox,
    }
