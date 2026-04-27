from __future__ import annotations

from typing import Dict, List

from server.dwg.oda.entities.dimension_geometry_common import point_key


def finalize_dimension_geometry_points(
    geometry: Dict[str, object],
    source: Dict[str, object],
    context,
) -> bool:
    ext1 = geometry.get("ext1")
    ext2 = geometry.get("ext2")
    dim_pt = geometry.get("dim_pt")
    text_pos = geometry.get("text_pos")
    line_start = geometry.get("line_start")
    line_end = geometry.get("line_end")
    bbox = geometry.get("bbox")
    named_points = source.get("named_points") or {}
    min_pt = source.get("min_pt")
    max_pt = source.get("max_pt")

    if not isinstance(ext1, dict) or not isinstance(ext2, dict):
        fallback_pts = _collect_fallback_points(named_points)
        if len(fallback_pts) < 2 and isinstance(min_pt, dict) and isinstance(max_pt, dict):
            fallback_pts = [min_pt, max_pt]
        if not isinstance(ext1, dict) and len(fallback_pts) >= 1:
            ext1 = fallback_pts[0]
        if not isinstance(ext2, dict) and len(fallback_pts) >= 2:
            ext2 = fallback_pts[1]

    if not isinstance(ext1, dict) or not isinstance(ext2, dict):
        return False
    if not isinstance(dim_pt, dict):
        dim_pt = dict(ext2)
    if not isinstance(line_start, dict) or not isinstance(line_end, dict):
        line_start, line_end = context.dimension_line_endpoints(ext1, ext2, dim_pt)
    if not isinstance(text_pos, dict):
        text_pos = dict(dim_pt)

    if bbox is None:
        pts_for_bbox = [ext1, ext2, dim_pt, line_start, line_end]
        if isinstance(text_pos, dict):
            pts_for_bbox.append(text_pos)
        bbox = context.bbox_from_points(pts_for_bbox)

    geometry["ext1"] = ext1
    geometry["ext2"] = ext2
    geometry["dim_pt"] = dim_pt
    geometry["text_pos"] = text_pos
    geometry["line_start"] = line_start
    geometry["line_end"] = line_end
    geometry["bbox"] = bbox
    return True


def _collect_fallback_points(named_points: Dict[str, object]) -> List[Dict[str, float]]:
    point_keys = [
        "defpoint2",
        "defpoint3",
        "defpoint4",
        "xline1 point",
        "xline2 point",
        "line start point",
        "line end point",
        "first extension line origin",
        "second extension line origin",
    ]
    fallback_pts: List[Dict[str, float]] = []
    seen = set()
    for key_name in point_keys:
        point = named_points.get(key_name)
        if not isinstance(point, dict):
            continue
        key = point_key(point)
        if key in seen:
            continue
        seen.add(key)
        fallback_pts.append(point)
    if len(fallback_pts) < 2:
        for point in named_points.values():
            if not isinstance(point, dict):
                continue
            key = point_key(point)
            if key in seen:
                continue
            seen.add(key)
            fallback_pts.append(point)
            if len(fallback_pts) >= 2:
                break
    return fallback_pts
