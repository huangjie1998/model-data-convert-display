from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.dimension_geometry_common import pick_named_point


def apply_ordinate_dimension_geometry(geometry: Dict[str, object], source: Dict[str, object], context) -> None:
    named_points = source.get("named_points") or {}
    feature_pt = geometry.get("ext1") or pick_named_point(named_points, "feature location point", "defpoint2")
    leader_end = source.get("dim_leader_end_point") or geometry.get("ext2") or pick_named_point(named_points, "leader end point", "defpoint3")
    if not (isinstance(feature_pt, dict) and isinstance(leader_end, dict)):
        return

    geometry["line_start"] = feature_pt
    geometry["line_end"] = leader_end
    geometry["ext1"] = feature_pt
    geometry["ext2"] = leader_end
    if not isinstance(geometry.get("dim_pt"), dict):
        geometry["dim_pt"] = leader_end
    if not isinstance(geometry.get("text_pos"), dict):
        geometry["text_pos"] = leader_end
    if geometry.get("bbox") is None:
        pts = [feature_pt, leader_end]
        text_pos = geometry.get("text_pos")
        if isinstance(text_pos, dict):
            pts.append(text_pos)
        geometry["bbox"] = context.bbox_from_points(pts)
