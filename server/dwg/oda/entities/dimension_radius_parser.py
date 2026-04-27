from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.dimension_geometry_common import pick_named_point


def apply_radius_dimension_geometry(geometry: Dict[str, object], source: Dict[str, object], context) -> None:
    named_points = source.get("named_points") or {}
    center_ref = source.get("center_pt") or pick_named_point(named_points, "center point", "defpoint")
    radius_ref = (
        source.get("dim_chord_point")
        or pick_named_point(named_points, "chord point", "defpoint4", "defpoint2")
        or geometry.get("ext1")
        or geometry.get("ext2")
    )
    if not (isinstance(center_ref, dict) and isinstance(radius_ref, dict)):
        return

    geometry["line_start"] = center_ref
    geometry["line_end"] = radius_ref
    geometry["ext1"] = center_ref
    geometry["ext2"] = radius_ref
    if not isinstance(geometry.get("dim_pt"), dict):
        geometry["dim_pt"] = radius_ref
    if not isinstance(geometry.get("text_pos"), dict):
        geometry["text_pos"] = {
            "x": (float(center_ref["x"]) + float(radius_ref["x"])) * 0.5,
            "y": (float(center_ref["y"]) + float(radius_ref["y"])) * 0.5,
            "z": float(center_ref.get("z", radius_ref.get("z", 0.0))),
        }
    if geometry.get("bbox") is None:
        pts = [center_ref, radius_ref]
        text_pos = geometry.get("text_pos")
        if isinstance(text_pos, dict):
            pts.append(text_pos)
        geometry["bbox"] = context.bbox_from_points(pts)
