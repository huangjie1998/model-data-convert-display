from __future__ import annotations

from typing import Dict


def apply_arc_length_dimension_geometry(geometry: Dict[str, object], source: Dict[str, object], context) -> None:
    ext1 = geometry.get("ext1")
    ext2 = geometry.get("ext2")
    dim_pt = geometry.get("dim_pt")
    dim_arc_point = source.get("dim_arc_point")

    if not isinstance(dim_pt, dict) and isinstance(dim_arc_point, dict):
        geometry["dim_pt"] = dim_arc_point
        dim_pt = dim_arc_point
    if not (isinstance(ext1, dict) and isinstance(ext2, dict) and isinstance(dim_pt, dict)):
        return

    if not (isinstance(geometry.get("line_start"), dict) and isinstance(geometry.get("line_end"), dict)):
        line_start, line_end = context.dimension_line_endpoints(ext1, ext2, dim_pt)
        geometry["line_start"] = line_start
        geometry["line_end"] = line_end

    if geometry.get("bbox") is None:
        pts = [ext1, ext2, dim_pt]
        line_start = geometry.get("line_start")
        line_end = geometry.get("line_end")
        text_pos = geometry.get("text_pos")
        if isinstance(line_start, dict):
            pts.append(line_start)
        if isinstance(line_end, dict):
            pts.append(line_end)
        if isinstance(text_pos, dict):
            pts.append(text_pos)
        geometry["bbox"] = context.bbox_from_points(pts)
