from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.dimension_geometry_common import pick_named_point


def apply_diameter_dimension_geometry(geometry: Dict[str, object], source: Dict[str, object], context) -> None:
    named_points = source.get("named_points") or {}
    center_pt = source.get("center_pt")
    p1 = source.get("dim_chord_point") or geometry.get("ext1") or pick_named_point(named_points, "chord point", "defpoint2")
    p2 = source.get("dim_far_chord_point") or geometry.get("ext2") or pick_named_point(named_points, "far chord point", "farchord point", "defpoint3")
    if not isinstance(p2, dict) and isinstance(center_pt, dict) and isinstance(p1, dict):
        p2 = {
            "x": float(center_pt["x"]) * 2.0 - float(p1["x"]),
            "y": float(center_pt["y"]) * 2.0 - float(p1["y"]),
            "z": float(center_pt.get("z", p1.get("z", 0.0))),
        }
    if not (isinstance(p1, dict) and isinstance(p2, dict)):
        return

    geometry["line_start"] = p1
    geometry["line_end"] = p2
    geometry["ext1"] = p1
    geometry["ext2"] = p2
    if not isinstance(geometry.get("dim_pt"), dict):
        geometry["dim_pt"] = {
            "x": (float(p1["x"]) + float(p2["x"])) * 0.5,
            "y": (float(p1["y"]) + float(p2["y"])) * 0.5,
            "z": float(p1.get("z", p2.get("z", 0.0))),
        }
    if not isinstance(geometry.get("text_pos"), dict):
        geometry["text_pos"] = geometry.get("dim_pt")
    if geometry.get("bbox") is None:
        pts = [p1, p2]
        text_pos = geometry.get("text_pos")
        if isinstance(text_pos, dict):
            pts.append(text_pos)
        geometry["bbox"] = context.bbox_from_points(pts)
