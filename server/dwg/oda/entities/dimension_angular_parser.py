from __future__ import annotations

import math
from typing import Dict, Optional

from server.dwg.oda.entities.dimension_geometry_common import pick_named_point


def apply_angular_dimension_geometry(geometry: Dict[str, object], source: Dict[str, object], context) -> None:
    named_points = source.get("named_points") or {}
    dim_ext1_start = source.get("dim_ext1_start")
    dim_ext1_end = source.get("dim_ext1_end")
    dim_ext2_start = source.get("dim_ext2_start")
    dim_ext2_end = source.get("dim_ext2_end")
    dim_arc_point = source.get("dim_arc_point")

    ray1_a = dim_ext1_start or pick_named_point(named_points, "extension line 1 start")
    ray1_b = dim_ext1_end or pick_named_point(named_points, "extension line 1 end")
    ray2_a = dim_ext2_start or pick_named_point(named_points, "extension line 2 start")
    ray2_b = dim_ext2_end or pick_named_point(named_points, "extension line 2 end")
    arc_pt = dim_arc_point or pick_named_point(named_points, "arc point")

    vertex: Optional[Dict[str, float]] = None
    if isinstance(ray1_a, dict) and isinstance(ray1_b, dict) and isinstance(ray2_a, dict) and isinstance(ray2_b, dict):
        vertex = context.line_intersection_2d(ray1_a, ray1_b, ray2_a, ray2_b)
        if vertex is None:
            for p1 in (ray1_a, ray1_b):
                for p2 in (ray2_a, ray2_b):
                    if context.point_distance(p1, p2) <= 1e-6:
                        vertex = {"x": float(p1["x"]), "y": float(p1["y"]), "z": float(p1.get("z", 0.0))}
                        break
                if isinstance(vertex, dict):
                    break
    if not isinstance(vertex, dict):
        vertex = pick_named_point(named_points, "center point", "vertex point", "defpoint", "defpoint10")
    if not isinstance(vertex, dict):
        dim_pt = geometry.get("dim_pt")
        vertex = dim_pt if isinstance(dim_pt, dict) else None
    if isinstance(vertex, dict):
        geometry["angular_vertex"] = dict(vertex)

    if not isinstance(vertex, dict):
        return

    ext1 = geometry.get("ext1")
    ext2 = geometry.get("ext2")
    ray1_ref = _pick_ray_ref(context, vertex, ray1_a, ray1_b, ext1 if isinstance(ext1, dict) else None)
    ray2_ref = _pick_ray_ref(context, vertex, ray2_a, ray2_b, ext2 if isinstance(ext2, dict) else None)
    if not (isinstance(ray1_ref, dict) and isinstance(ray2_ref, dict)):
        return

    if not isinstance(arc_pt, dict):
        dim_pt = geometry.get("dim_pt")
        text_pos = geometry.get("text_pos")
        arc_pt = dict(dim_pt) if isinstance(dim_pt, dict) else dict(text_pos) if isinstance(text_pos, dict) else None
    radius_val = context.point_distance(vertex, arc_pt) if isinstance(arc_pt, dict) else 0.0
    if not math.isfinite(radius_val) or radius_val <= 1e-9:
        radius_val = min(context.point_distance(vertex, ray1_ref), context.point_distance(vertex, ray2_ref)) * 0.42
    radius_val = max(radius_val, 1e-6)
    line_start = context.point_on_ray(vertex, ray1_ref, radius_val)
    line_end = context.point_on_ray(vertex, ray2_ref, radius_val)
    geometry["line_start"] = line_start
    geometry["line_end"] = line_end
    geometry["ext1"] = ray1_ref
    geometry["ext2"] = ray2_ref
    geometry["dim_pt"] = arc_pt if isinstance(arc_pt, dict) else dict(line_start)
    if not isinstance(geometry.get("text_pos"), dict):
        geometry["text_pos"] = geometry["dim_pt"]
    if geometry.get("bbox") is None:
        pts = [vertex, ray1_ref, ray2_ref, line_start, line_end]
        dim_pt = geometry.get("dim_pt")
        text_pos = geometry.get("text_pos")
        if isinstance(dim_pt, dict):
            pts.append(dim_pt)
        if isinstance(text_pos, dict):
            pts.append(text_pos)
        geometry["bbox"] = context.bbox_from_points(pts)


def _pick_ray_ref(
    context,
    vertex: Dict[str, float],
    first: Optional[Dict[str, float]],
    second: Optional[Dict[str, float]],
    fallback: Optional[Dict[str, float]],
) -> Optional[Dict[str, float]]:
    best = fallback if isinstance(fallback, dict) else None
    best_dist = context.point_distance(vertex, best) if isinstance(best, dict) else -1.0
    for candidate in (first, second):
        if not isinstance(candidate, dict):
            continue
        distance = context.point_distance(vertex, candidate)
        if distance > best_dist + 1e-9:
            best = candidate
            best_dist = distance
    return best
