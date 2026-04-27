from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple


Point = Dict[str, float]
Primitive = Dict[str, object]
Geom = Dict[str, object]


@dataclass(frozen=True)
class DimensionArrowRepairContext:
    point_distance: Callable[[Point, Point], float]
    resolve_arrow_length: Callable[[object, float], float]
    distance_to_segment: Callable[[Point, Point, Point], Tuple[float, Point, float]]
    bbox_from_points: Callable[[List[Point]], Optional[Dict[str, Point]]]
    line_intersection_2d: Callable[[Point, Point, Point, Point], Optional[Point]]


def repair_dimension_block_arrow_precision(
    dim_geom: Geom,
    primitives: List[Primitive],
    context: DimensionArrowRepairContext,
) -> Tuple[List[Primitive], Dict[str, object]]:
    line_start = dim_geom.get("line_start")
    line_end = dim_geom.get("line_end")
    if not isinstance(line_start, dict) or not isinstance(line_end, dict):
        return primitives, {"repaired": False, "reason": "missing_dimension_line_endpoints"}
    original_line_start = line_start
    original_line_end = line_end

    line_len = context.point_distance(line_start, line_end)
    if line_len <= 1e-9:
        return primitives, {"repaired": False, "reason": "zero_dimension_line_length"}

    arrow_size_raw = dim_geom.get("arrow_size")
    arrow_len = context.resolve_arrow_length(arrow_size_raw, line_len)
    if not isinstance(arrow_len, (int, float)) or not math.isfinite(float(arrow_len)) or float(arrow_len) <= 0:
        return primitives, {"repaired": False, "reason": "invalid_arrow_size"}
    arrow_len = float(arrow_len)
    endpoint_tol = max(arrow_len * 2.5, line_len * 0.015, 1e-6)

    dx = float(line_end.get("x", 0.0)) - float(line_start.get("x", 0.0))
    dy = float(line_end.get("y", 0.0)) - float(line_start.get("y", 0.0))
    ux = dx / line_len
    uy = dy / line_len

    def _point_copy(point: Dict[str, float], tx: float = 0.0, ty: float = 0.0) -> Dict[str, float]:
        return {
            "x": float(point.get("x", 0.0)) + tx,
            "y": float(point.get("y", 0.0)) + ty,
            "z": float(point.get("z", 0.0)),
        }

    def _primitive_points(primitive: Dict[str, object]) -> List[Dict[str, float]]:
        kind = str(primitive.get("kind") or "").strip().lower()
        if kind == "line":
            pts = []
            for key in ("start", "end"):
                p = primitive.get(key)
                if isinstance(p, dict):
                    pts.append(p)
            return pts
        if kind == "polyline":
            raw_points = primitive.get("points")
            return [p for p in raw_points if isinstance(p, dict)] if isinstance(raw_points, list) else []
        if kind == "polygon":
            rings = primitive.get("rings")
            if isinstance(rings, list) and rings:
                first_ring = rings[0]
                if isinstance(first_ring, list):
                    return [p for p in first_ring if isinstance(p, dict)]
            raw_points = primitive.get("points")
            return [p for p in raw_points if isinstance(p, dict)] if isinstance(raw_points, list) else []
        return []

    def _centroid(points: List[Dict[str, float]]) -> Optional[Dict[str, float]]:
        clean = [p for p in points if isinstance(p, dict)]
        if not clean:
            return None
        if len(clean) > 1 and context.point_distance(clean[0], clean[-1]) <= 1e-9:
            clean = clean[:-1]
        if not clean:
            return None
        return {
            "x": sum(float(p.get("x", 0.0)) for p in clean) / len(clean),
            "y": sum(float(p.get("y", 0.0)) for p in clean) / len(clean),
            "z": sum(float(p.get("z", 0.0)) for p in clean) / len(clean),
        }

    def _min_distance_to_point(points: List[Dict[str, float]], point: Dict[str, float]) -> float:
        if not points:
            return float("inf")
        return min(context.point_distance(p, point) for p in points)

    def _translate_primitive(primitive: Dict[str, object], tx: float, ty: float) -> Dict[str, object]:
        out_prim = dict(primitive)
        kind = str(out_prim.get("kind") or "").strip().lower()
        if kind == "line":
            for key in ("start", "end"):
                p = out_prim.get(key)
                if isinstance(p, dict):
                    out_prim[key] = _point_copy(p, tx, ty)
            return out_prim
        if kind == "polyline":
            points = out_prim.get("points")
            if isinstance(points, list):
                out_prim["points"] = [_point_copy(p, tx, ty) if isinstance(p, dict) else p for p in points]
            return out_prim
        if kind == "polygon":
            rings = out_prim.get("rings")
            if isinstance(rings, list):
                new_rings: List[object] = []
                for ring in rings:
                    if isinstance(ring, list):
                        new_rings.append([_point_copy(p, tx, ty) if isinstance(p, dict) else p for p in ring])
                    else:
                        new_rings.append(ring)
                out_prim["rings"] = new_rings
            return out_prim
        return out_prim

    def _normalized_vector(vec: Tuple[float, float], fallback: Tuple[float, float]) -> Tuple[float, float]:
        vx, vy = vec
        v_len = math.hypot(vx, vy)
        if v_len <= 1e-9:
            vx, vy = fallback
            v_len = math.hypot(vx, vy)
        if v_len <= 1e-9:
            return 1.0, 0.0
        return vx / v_len, vy / v_len

    def _vector_angle_error_deg(a: Tuple[float, float], b: Tuple[float, float]) -> Optional[float]:
        ax, ay = _normalized_vector(a, (1.0, 0.0))
        bx, by = _normalized_vector(b, (1.0, 0.0))
        dot = max(-1.0, min(1.0, ax * bx + ay * by))
        return math.degrees(math.acos(dot))

    def _triangle_geometry(tip: Dict[str, float], inward: Tuple[float, float]) -> Dict[str, object]:
        in_x, in_y = inward
        in_x, in_y = _normalized_vector((in_x, in_y), (-ux, -uy))
        tip_x = float(tip.get("x", 0.0))
        tip_y = float(tip.get("y", 0.0))
        tip_z = float(tip.get("z", 0.0))
        base_x = tip_x + in_x * arrow_len
        base_y = tip_y + in_y * arrow_len
        # AutoCAD's closed-filled arrow is a sharp wedge.  OdReadEx rounds
        # tiny SOLID vertices to 0.1 drawing units in this sample, which
        # turns the saved acute triangle into a right-looking triangle.
        half_width = arrow_len * 0.18
        px = -in_y
        py = in_x
        tip_point = {"x": tip_x, "y": tip_y, "z": tip_z}
        p1 = {"x": base_x + px * half_width, "y": base_y + py * half_width, "z": tip_z}
        p2 = {"x": base_x - px * half_width, "y": base_y - py * half_width, "z": tip_z}
        base_mid = {"x": base_x, "y": base_y, "z": tip_z}
        return {
            "ring": [tip_point, p1, p2, dict(tip_point)],
            "tip": tip_point,
            "base_mid": base_mid,
            "inward": {"x": in_x, "y": in_y, "z": 0.0},
        }

    def _infer_arrow_tip_from_polygon(
        points: List[Dict[str, float]],
        inward: Tuple[float, float],
        endpoint: Dict[str, float],
    ) -> Tuple[Dict[str, float], Dict[str, object]]:
        unique_points: List[Dict[str, float]] = []
        for point in points:
            if not isinstance(point, dict):
                continue
            if any(context.point_distance(point, existing) <= 1e-9 for existing in unique_points):
                continue
            unique_points.append(point)
        if not unique_points:
            return dict(endpoint), {"tip_source": "arc_endpoint", "tip_reason": "empty_polygon"}
        in_x, in_y = _normalized_vector(inward, (-ux, -uy))
        projections = [
            float(point.get("x", 0.0)) * in_x + float(point.get("y", 0.0)) * in_y
            for point in unique_points
        ]
        min_projection = min(projections)
        max_projection = max(projections)
        projection_span = max_projection - min_projection
        endpoint_distances = [context.point_distance(point, endpoint) for point in unique_points]
        tip_idx = min(
            range(len(unique_points)),
            key=lambda i: endpoint_distances[i] + max(0.0, projections[i] - min_projection),
        )
        inferred_tip = unique_points[tip_idx]
        centroid = _centroid(unique_points)
        orientation_error = None
        if isinstance(centroid, dict):
            inferred_inward = (
                float(centroid.get("x", 0.0)) - float(inferred_tip.get("x", 0.0)),
                float(centroid.get("y", 0.0)) - float(inferred_tip.get("y", 0.0)),
            )
            if math.hypot(inferred_inward[0], inferred_inward[1]) > 1e-9:
                orientation_error = _vector_angle_error_deg(inferred_inward, (in_x, in_y))
        distance_to_endpoint = context.point_distance(inferred_tip, endpoint)
        reliable_projection = projection_span >= max(arrow_len * 0.12, 1e-9)
        reliable_distance = distance_to_endpoint <= max(endpoint_tol, arrow_len * 2.5, 1e-6)
        reliable_orientation = orientation_error is None or orientation_error <= 95.0
        if reliable_projection and reliable_distance and reliable_orientation:
            return dict(inferred_tip), {
                "tip_source": "polygon_projection",
                "tip_endpoint_distance": distance_to_endpoint,
                "tip_projection_span": projection_span,
                "tip_orientation_error_deg": orientation_error,
            }
        return dict(endpoint), {
            "tip_source": "arc_endpoint",
            "tip_endpoint_distance": distance_to_endpoint,
            "tip_projection_span": projection_span,
            "tip_orientation_error_deg": orientation_error,
        }

    def _circle_line_intersections(
        center: Dict[str, float],
        radius: float,
        a: Dict[str, float],
        b: Dict[str, float],
    ) -> List[Dict[str, object]]:
        ax = float(a.get("x", 0.0))
        ay = float(a.get("y", 0.0))
        bx = float(b.get("x", 0.0))
        by = float(b.get("y", 0.0))
        cx = float(center.get("x", 0.0))
        cy = float(center.get("y", 0.0))
        dx = bx - ax
        dy = by - ay
        fx = ax - cx
        fy = ay - cy
        aa = dx * dx + dy * dy
        if aa <= 1e-12:
            return []
        bb = 2.0 * (fx * dx + fy * dy)
        cc = fx * fx + fy * fy - radius * radius
        disc = bb * bb - 4.0 * aa * cc
        if disc < -1e-9:
            return []
        disc = max(0.0, disc)
        root = math.sqrt(disc)
        out: List[Dict[str, object]] = []
        for sign in (-1.0, 1.0):
            t = (-bb + sign * root) / (2.0 * aa)
            point = {
                "x": ax + dx * t,
                "y": ay + dy * t,
                "z": float(a.get("z", b.get("z", center.get("z", 0.0)))),
            }
            out.append({"point": point, "t": t})
            if root <= 1e-12:
                break
        return out

    def _arc_angle_for_point(center: Dict[str, float], point: Dict[str, float]) -> float:
        return math.degrees(
            math.atan2(
                float(point.get("y", 0.0)) - float(center.get("y", 0.0)),
                float(point.get("x", 0.0)) - float(center.get("x", 0.0)),
            )
        )

    def _point_on_circle_from_angle(center: Dict[str, float], radius: float, angle_deg: float) -> Dict[str, float]:
        angle = math.radians(angle_deg)
        return {
            "x": float(center.get("x", 0.0)) + radius * math.cos(angle),
            "y": float(center.get("y", 0.0)) + radius * math.sin(angle),
            "z": float(center.get("z", 0.0)),
        }

    def _canonical_angular_center_radius() -> Optional[Tuple[Dict[str, float], float]]:
        center = dim_geom.get("center")
        if not isinstance(center, dict):
            return None
        radii = [
            context.point_distance(center, original_line_start),
            context.point_distance(center, original_line_end),
        ]
        clean = [r for r in radii if math.isfinite(r) and r > 1e-9]
        if not clean:
            return None
        return dict(center), sum(clean) / len(clean)

    def _inward_for_arc_anchor(
        center: Dict[str, float],
        endpoint: Dict[str, float],
        role: str,
        fallback: Tuple[float, float],
    ) -> Tuple[float, float]:
        radial_x = float(endpoint.get("x", 0.0)) - float(center.get("x", 0.0))
        radial_y = float(endpoint.get("y", 0.0)) - float(center.get("y", 0.0))
        radial_x, radial_y = _normalized_vector((radial_x, radial_y), fallback)
        tangent_ccw = (-radial_y, radial_x)
        if role == "start":
            return _normalized_vector(tangent_ccw, fallback)
        return _normalized_vector((-tangent_ccw[0], -tangent_ccw[1]), fallback)

    def _canonical_angular_anchor(endpoint: Dict[str, float]) -> Tuple[Dict[str, float], Dict[str, object]]:
        start_dist = context.point_distance(endpoint, original_line_start)
        end_dist = context.point_distance(endpoint, original_line_end)
        limit = max(endpoint_tol, arrow_len * 3.0, 1e-6)
        if start_dist <= end_dist and start_dist <= limit:
            return dict(original_line_start), {
                "anchor_source": "angular_geom_line_endpoint",
                "anchor_role": "start",
                "anchor_delta_from_raw": start_dist,
            }
        if end_dist <= limit:
            return dict(original_line_end), {
                "anchor_source": "angular_geom_line_endpoint",
                "anchor_role": "end",
                "anchor_delta_from_raw": end_dist,
            }
        return dict(endpoint), {
            "anchor_source": "arc_endpoint",
            "anchor_role": "raw",
            "anchor_delta_from_raw": 0.0,
        }

    def _canonical_arc_length_anchor(
        arc_idx: int,
        center: Dict[str, float],
        radius: float,
        endpoint: Dict[str, float],
    ) -> Tuple[Dict[str, float], Dict[str, object]]:
        best_point: Optional[Dict[str, float]] = None
        best_segment_idx: Optional[int] = None
        best_score = float("inf")
        for seg_idx, primitive in enumerate(primitives):
            if not isinstance(primitive, dict):
                continue
            segment = _line_segment_from_primitive(seg_idx, primitive)
            if not isinstance(segment, dict):
                continue
            seg_start = segment.get("start")
            seg_end = segment.get("end")
            if not isinstance(seg_start, dict) or not isinstance(seg_end, dict):
                continue
            seg_len = float(segment.get("length", 0.0))
            if seg_len < max(arrow_len * 6.0, endpoint_tol):
                continue
            for hit in _circle_line_intersections(center, radius, seg_start, seg_end):
                point = hit.get("point")
                t_raw = hit.get("t")
                if not isinstance(point, dict) or not isinstance(t_raw, (int, float)):
                    continue
                t = float(t_raw)
                endpoint_distance = context.point_distance(point, endpoint)
                segment_penalty = 0.0 if -0.15 <= t <= 1.15 else min(abs(t), abs(t - 1.0)) * endpoint_tol
                score = endpoint_distance + segment_penalty
                if score < best_score:
                    best_score = score
                    best_point = point
                    best_segment_idx = seg_idx
        limit = max(endpoint_tol, arrow_len * 3.0, 1e-6)
        if isinstance(best_point, dict) and best_score <= limit:
            return dict(best_point), {
                "anchor_source": "arc_length_arc_extension_intersection",
                "anchor_role": "intersection",
                "anchor_delta_from_raw": context.point_distance(best_point, endpoint),
                "extension_primitive_index": best_segment_idx,
                "arc_index": arc_idx,
            }
        return dict(endpoint), {
            "anchor_source": "arc_endpoint",
            "anchor_role": "raw",
            "anchor_delta_from_raw": 0.0,
            "arc_index": arc_idx,
        }

    def _is_small_filled_polygon(primitive: Dict[str, object]) -> bool:
        if str(primitive.get("kind") or "").strip().lower() != "polygon":
            return False
        if primitive.get("dimension_block_conversion") == "wide_polyline":
            return False
        if str(primitive.get("subtype") or "").strip().lower() == "dimension_block_wide_polyline_fill":
            return False
        if primitive.get("filled") is not True and primitive.get("arrow_fill") is not True:
            return False
        points = _primitive_points(primitive)
        if len(points) < 3:
            return False
        bbox = context.bbox_from_points(points)
        if not isinstance(bbox, dict):
            return False
        bmin = bbox.get("min")
        bmax = bbox.get("max")
        if not isinstance(bmin, dict) or not isinstance(bmax, dict):
            return False
        width = abs(float(bmax.get("x", 0.0)) - float(bmin.get("x", 0.0)))
        height = abs(float(bmax.get("y", 0.0)) - float(bmin.get("y", 0.0)))
        return max(width, height) <= max(arrow_len * 2.2, endpoint_tol)

    def _line_segment_from_primitive(
        idx: int,
        primitive: Dict[str, object],
    ) -> Optional[Dict[str, object]]:
        if str(primitive.get("kind") or "").strip().lower() != "line":
            return None
        start = primitive.get("start")
        end = primitive.get("end")
        if not isinstance(start, dict) or not isinstance(end, dict):
            return None
        length = context.point_distance(start, end)
        if length <= 1e-9:
            return None
        return {"idx": idx, "start": start, "end": end, "length": length}

    def _segment_endpoint_distance(segment: Dict[str, object], point: Dict[str, float]) -> float:
        start = segment.get("start")
        end = segment.get("end")
        if not isinstance(start, dict) or not isinstance(end, dict):
            return float("inf")
        return min(context.point_distance(start, point), context.point_distance(end, point))

    def _intersection_segment_score(
        point: Dict[str, float],
        a_start: Dict[str, float],
        a_end: Dict[str, float],
        b_start: Dict[str, float],
        b_end: Dict[str, float],
    ) -> float:
        da, _, ta = context.distance_to_segment(point, a_start, a_end)
        db, _, tb = context.distance_to_segment(point, b_start, b_end)
        outside_penalty = 0.0
        if ta <= 1e-6 or ta >= 1.0 - 1e-6:
            outside_penalty += 0.0
        if tb <= 1e-6 or tb >= 1.0 - 1e-6:
            outside_penalty += 0.0
        return da + db + outside_penalty

    def _derive_arrow_anchors_from_block_lines() -> Tuple[Dict[str, float], Dict[str, float], Dict[str, object]]:
        line_segments: List[Dict[str, object]] = []
        for idx, primitive in enumerate(primitives):
            if not isinstance(primitive, dict):
                continue
            segment = _line_segment_from_primitive(idx, primitive)
            if isinstance(segment, dict):
                line_segments.append(segment)
        if len(line_segments) < 2:
            return original_line_start, original_line_end, {
                "anchor_source": "dimension_geom",
                "anchor_reason": "not_enough_block_lines",
            }

        ext1 = dim_geom.get("ext1")
        ext2 = dim_geom.get("ext2")
        if not isinstance(ext1, dict) or not isinstance(ext2, dict):
            return original_line_start, original_line_end, {
                "anchor_source": "dimension_geom",
                "anchor_reason": "missing_extension_points",
            }

        def _pick_extension_segment(ext_point: Dict[str, float], exclude_idx: Optional[int] = None) -> Optional[Dict[str, object]]:
            best_segment: Optional[Dict[str, object]] = None
            best_score = float("inf")
            for segment in line_segments:
                seg_idx = segment.get("idx")
                if exclude_idx is not None and seg_idx == exclude_idx:
                    continue
                score = _segment_endpoint_distance(segment, ext_point)
                if score < best_score:
                    best_score = score
                    best_segment = segment
            if best_segment is None:
                return None
            if best_score > max(endpoint_tol * 1.5, arrow_len * 3.0):
                return None
            return best_segment

        ext1_segment = _pick_extension_segment(ext1)
        ext2_segment = _pick_extension_segment(ext2, int(ext1_segment.get("idx")) if isinstance(ext1_segment, dict) and isinstance(ext1_segment.get("idx"), int) else None)
        if not isinstance(ext1_segment, dict) or not isinstance(ext2_segment, dict):
            return original_line_start, original_line_end, {
                "anchor_source": "dimension_geom",
                "anchor_reason": "extension_lines_not_identified",
            }

        ext_indices = {ext1_segment.get("idx"), ext2_segment.get("idx")}
        dimension_segments = [segment for segment in line_segments if segment.get("idx") not in ext_indices]
        if not dimension_segments:
            return original_line_start, original_line_end, {
                "anchor_source": "dimension_geom",
                "anchor_reason": "dimension_lines_not_identified",
            }

        def _best_intersection(
            ext_segment: Dict[str, object],
            expected: Dict[str, float],
        ) -> Optional[Dict[str, float]]:
            ext_start = ext_segment.get("start")
            ext_end = ext_segment.get("end")
            if not isinstance(ext_start, dict) or not isinstance(ext_end, dict):
                return None
            best_point: Optional[Dict[str, float]] = None
            best_score = float("inf")
            for dim_segment in dimension_segments:
                dim_start = dim_segment.get("start")
                dim_end = dim_segment.get("end")
                if not isinstance(dim_start, dict) or not isinstance(dim_end, dict):
                    continue
                intersection = context.line_intersection_2d(ext_start, ext_end, dim_start, dim_end)
                if not isinstance(intersection, dict):
                    continue
                segment_score = _intersection_segment_score(intersection, ext_start, ext_end, dim_start, dim_end)
                expected_score = context.point_distance(intersection, expected)
                score = segment_score * 10.0 + min(expected_score, endpoint_tol)
                if score < best_score:
                    best_score = score
                    best_point = intersection
            if best_point is None:
                return None
            best_segment_score = float("inf")
            for dim_segment in dimension_segments:
                dim_start = dim_segment.get("start")
                dim_end = dim_segment.get("end")
                if not isinstance(dim_start, dict) or not isinstance(dim_end, dict):
                    continue
                best_segment_score = min(
                    best_segment_score,
                    _intersection_segment_score(best_point, ext_start, ext_end, dim_start, dim_end),
                )
            if best_segment_score > max(endpoint_tol * 2.0, arrow_len * 2.0):
                return None
            return best_point

        start_anchor = _best_intersection(ext1_segment, original_line_start)
        end_anchor = _best_intersection(ext2_segment, original_line_end)
        if not isinstance(start_anchor, dict) or not isinstance(end_anchor, dict):
            return original_line_start, original_line_end, {
                "anchor_source": "dimension_geom",
                "anchor_reason": "line_intersection_failed",
            }

        dimension_line_anchor_extensions: List[Dict[str, object]] = []
        for segment in dimension_segments:
            seg_idx = segment.get("idx")
            seg_start = segment.get("start")
            seg_end = segment.get("end")
            if not isinstance(seg_idx, int) or not isinstance(seg_start, dict) or not isinstance(seg_end, dict):
                continue
            seg_len_raw = segment.get("length")
            if (
                not isinstance(seg_len_raw, (int, float))
                or not math.isfinite(float(seg_len_raw))
                or float(seg_len_raw) < max(arrow_len * 3.0, endpoint_tol)
            ):
                continue
            start_anchor_distance = min(context.point_distance(seg_start, start_anchor), context.point_distance(seg_end, start_anchor))
            end_anchor_distance = min(context.point_distance(seg_start, end_anchor), context.point_distance(seg_end, end_anchor))
            if start_anchor_distance <= endpoint_tol and start_anchor_distance <= end_anchor_distance:
                dimension_line_anchor_extensions.append({"idx": seg_idx, "anchor": "start", "point": start_anchor})
            elif end_anchor_distance <= endpoint_tol:
                dimension_line_anchor_extensions.append({"idx": seg_idx, "anchor": "end", "point": end_anchor})

        return start_anchor, end_anchor, {
            "anchor_source": "dimension_block_line_intersection",
            "start_anchor": start_anchor,
            "end_anchor": end_anchor,
            "extension_line_indices": [ext1_segment.get("idx"), ext2_segment.get("idx")],
            "dimension_line_indices": [segment.get("idx") for segment in dimension_segments],
            "dimension_line_anchor_extensions": dimension_line_anchor_extensions,
        }

    line_start, line_end, anchor_info = _derive_arrow_anchors_from_block_lines()
    anchor_line_len = context.point_distance(line_start, line_end)
    if anchor_line_len > 1e-9:
        line_len = anchor_line_len
        dx = float(line_end.get("x", 0.0)) - float(line_start.get("x", 0.0))
        dy = float(line_end.get("y", 0.0)) - float(line_start.get("y", 0.0))
        ux = dx / line_len
        uy = dy / line_len

    repaired = False
    repaired_kinds: List[str] = []
    arc_arrow_repair_summaries: List[Dict[str, object]] = []
    out_primitives: List[Dict[str, object]] = []

    start_tick_indices: set[int] = set()
    arrow_polygon_anchor_by_index: Dict[int, str] = {}
    start_triangle_score = float("inf")
    end_triangle_score = float("inf")
    dimension_line_extension_by_index: Dict[int, Dict[str, float]] = {}
    extensions_raw = anchor_info.get("dimension_line_anchor_extensions") if isinstance(anchor_info, dict) else None
    if isinstance(extensions_raw, list):
        for extension in extensions_raw:
            if not isinstance(extension, dict):
                continue
            idx_raw = extension.get("idx")
            point_raw = extension.get("point")
            if isinstance(idx_raw, int) and isinstance(point_raw, dict):
                dimension_line_extension_by_index[idx_raw] = point_raw

    arc_arrow_repair_by_index: Dict[int, Dict[str, object]] = {}
    arc_endpoint_repair_by_key: Dict[Tuple[int, str], Dict[str, float]] = {}

    def _arc_endpoint_candidates() -> List[Dict[str, object]]:
        dim_kind = str(dim_geom.get("dim_kind") or "").strip().lower()
        if dim_kind not in ("angular", "arc_length"):
            return []
        candidates: List[Dict[str, object]] = []
        for arc_idx, primitive in enumerate(primitives):
            if not isinstance(primitive, dict) or str(primitive.get("kind") or "").strip().lower() != "arc":
                continue
            center = primitive.get("center")
            radius_raw = primitive.get("radius")
            if not isinstance(center, dict) or not isinstance(radius_raw, (int, float)) or not math.isfinite(float(radius_raw)):
                continue
            radius = abs(float(radius_raw))
            if radius <= 1e-9:
                continue
            start_point = primitive.get("start") if isinstance(primitive.get("start"), dict) else None
            end_point = primitive.get("end") if isinstance(primitive.get("end"), dict) else None
            if not isinstance(start_point, dict):
                start_angle_raw = primitive.get("start_angle")
                if isinstance(start_angle_raw, (int, float)) and math.isfinite(float(start_angle_raw)):
                    angle = math.radians(float(start_angle_raw))
                    start_point = {
                        "x": float(center.get("x", 0.0)) + radius * math.cos(angle),
                        "y": float(center.get("y", 0.0)) + radius * math.sin(angle),
                        "z": float(center.get("z", 0.0)),
                    }
            if not isinstance(end_point, dict):
                end_angle_raw = primitive.get("end_angle")
                if isinstance(end_angle_raw, (int, float)) and math.isfinite(float(end_angle_raw)):
                    angle = math.radians(float(end_angle_raw))
                    end_point = {
                        "x": float(center.get("x", 0.0)) + radius * math.cos(angle),
                        "y": float(center.get("y", 0.0)) + radius * math.sin(angle),
                        "z": float(center.get("z", 0.0)),
                    }
            for endpoint, role in ((start_point, "start"), (end_point, "end")):
                if not isinstance(endpoint, dict):
                    continue
                radial_x = float(endpoint.get("x", 0.0)) - float(center.get("x", 0.0))
                radial_y = float(endpoint.get("y", 0.0)) - float(center.get("y", 0.0))
                radial_len = math.hypot(radial_x, radial_y)
                if radial_len <= 1e-9:
                    continue
                radial_x /= radial_len
                radial_y /= radial_len
                tangent_ccw = (-radial_y, radial_x)
                inward = tangent_ccw if role == "start" else (-tangent_ccw[0], -tangent_ccw[1])
                tip = {
                    "x": float(endpoint.get("x", 0.0)),
                    "y": float(endpoint.get("y", 0.0)),
                    "z": float(endpoint.get("z", center.get("z", 0.0))),
                }
                if dim_kind == "angular":
                    canonical_tip, canonical_info = _canonical_angular_anchor(endpoint)
                elif dim_kind == "arc_length":
                    canonical_tip, canonical_info = _canonical_arc_length_anchor(arc_idx, center, radius, endpoint)
                else:
                    canonical_tip, canonical_info = tip, {"anchor_source": "arc_endpoint", "anchor_delta_from_raw": 0.0}
                canonical_center = center
                if dim_kind == "angular":
                    angular_circle = _canonical_angular_center_radius()
                    if angular_circle is not None:
                        canonical_center = angular_circle[0]
                inward = _inward_for_arc_anchor(canonical_center, canonical_tip, role, inward)
                candidates.append({
                    "arc_index": arc_idx,
                    "endpoint": endpoint,
                    "tip": tip,
                    "canonical_tip": canonical_tip,
                    "canonical_info": canonical_info,
                    "inward": inward,
                    "role": role,
                    "center": canonical_center,
                })
        return candidates

    arc_endpoint_candidates = _arc_endpoint_candidates()

    def _pick_arc_arrow_repair(points: List[Dict[str, float]]) -> Optional[Dict[str, object]]:
        if not arc_endpoint_candidates or not points:
            return None
        best_candidate: Optional[Dict[str, object]] = None
        best_score = float("inf")
        for candidate in arc_endpoint_candidates:
            endpoint = candidate.get("endpoint")
            if not isinstance(endpoint, dict):
                continue
            score = _min_distance_to_point(points, endpoint)
            if score < best_score:
                best_score = score
                best_candidate = candidate
        if not isinstance(best_candidate, dict):
            return None
        if best_score > max(endpoint_tol, arrow_len * 2.5, 1e-6):
            return None
        tip = best_candidate.get("tip")
        inward = best_candidate.get("inward")
        if not isinstance(tip, dict) or not isinstance(inward, tuple):
            return None
        canonical_tip = best_candidate.get("canonical_tip")
        canonical_info = best_candidate.get("canonical_info")
        if not isinstance(canonical_tip, dict):
            canonical_tip = tip
        if not isinstance(canonical_info, dict):
            canonical_info = {"anchor_source": "arc_endpoint", "anchor_delta_from_raw": 0.0}
        inferred_tip, tip_info = _infer_arrow_tip_from_polygon(points, inward, canonical_tip)
        base_direction = (float(inward[0]), float(inward[1]))
        center = _centroid(points)
        tangent_error = None
        if isinstance(center, dict):
            original_direction = (
                float(center.get("x", 0.0)) - float(inferred_tip.get("x", 0.0)),
                float(center.get("y", 0.0)) - float(inferred_tip.get("y", 0.0)),
            )
            if math.hypot(original_direction[0], original_direction[1]) > 1e-9:
                tangent_error = _vector_angle_error_deg(original_direction, base_direction)
        return {
            "tip": canonical_tip,
            "raw_tip": inferred_tip,
            "inward": inward,
            "role": best_candidate.get("role"),
            "arc_index": best_candidate.get("arc_index"),
            "endpoint": best_candidate.get("endpoint"),
            "endpoint_distance": best_score,
            "tangent_error_deg": tangent_error,
            **canonical_info,
            **tip_info,
        }

    for idx, primitive in enumerate(primitives):
        if not isinstance(primitive, dict):
            continue
        points = _primitive_points(primitive)
        if not points:
            continue
        start_distance = _min_distance_to_point(points, line_start)
        end_distance = _min_distance_to_point(points, line_end)
        if _is_small_filled_polygon(primitive):
            arc_repair = _pick_arc_arrow_repair(points)
            if arc_repair is not None:
                arc_arrow_repair_by_index[idx] = arc_repair
                arc_idx_raw = arc_repair.get("arc_index")
                role_raw = arc_repair.get("role")
                tip_raw = arc_repair.get("tip")
                if isinstance(arc_idx_raw, int) and isinstance(role_raw, str) and isinstance(tip_raw, dict):
                    arc_endpoint_repair_by_key[(arc_idx_raw, role_raw)] = tip_raw
                continue
            if start_distance <= endpoint_tol and start_distance <= end_distance and start_distance < start_triangle_score:
                stale = next((k for k, anchor in arrow_polygon_anchor_by_index.items() if anchor == "start"), None)
                if stale is not None:
                    arrow_polygon_anchor_by_index.pop(stale, None)
                start_triangle_score = start_distance
                arrow_polygon_anchor_by_index[idx] = "start"
            elif end_distance <= endpoint_tol and end_distance < end_triangle_score:
                stale = next((k for k, anchor in arrow_polygon_anchor_by_index.items() if anchor == "end"), None)
                if stale is not None:
                    arrow_polygon_anchor_by_index.pop(stale, None)
                end_triangle_score = end_distance
                arrow_polygon_anchor_by_index[idx] = "end"
        if str(primitive.get("kind") or "").strip().lower() == "polyline":
            if primitive.get("global_width") or primitive.get("start_width") or primitive.get("end_width"):
                centroid = _centroid(points)
                if isinstance(centroid, dict) and context.point_distance(centroid, line_start) <= endpoint_tol:
                    start_tick_indices.add(idx)
        if (
            str(primitive.get("kind") or "").strip().lower() == "polygon"
            and primitive.get("dimension_block_conversion") == "wide_polyline"
        ):
            centroid = _centroid(points)
            if isinstance(centroid, dict) and context.point_distance(centroid, line_start) <= endpoint_tol:
                start_tick_indices.add(idx)

    for idx, primitive in enumerate(primitives):
        if not isinstance(primitive, dict):
            continue
        if str(primitive.get("kind") or "").strip().lower() == "arc":
            start_anchor = arc_endpoint_repair_by_key.get((idx, "start"))
            end_anchor = arc_endpoint_repair_by_key.get((idx, "end"))
            if isinstance(start_anchor, dict) or isinstance(end_anchor, dict):
                repaired_arc = dict(primitive)
                center_raw = repaired_arc.get("center")
                radius_raw = repaired_arc.get("radius")
                angular_circle = (
                    _canonical_angular_center_radius()
                    if str(dim_geom.get("dim_kind") or "").strip().lower() == "angular"
                    else None
                )
                if angular_circle is not None:
                    canonical_center, canonical_radius = angular_circle
                    center_raw = canonical_center
                    repaired_arc["center"] = canonical_center
                    repaired_arc["radius"] = canonical_radius
                    for key in ("start", "end"):
                        if key == "start" and isinstance(start_anchor, dict):
                            continue
                        if key == "end" and isinstance(end_anchor, dict):
                            continue
                        point_raw = repaired_arc.get(key)
                        if isinstance(point_raw, dict):
                            angle = _arc_angle_for_point(canonical_center, point_raw)
                            repaired_arc[key] = _point_on_circle_from_angle(canonical_center, canonical_radius, angle)
                            repaired_arc[f"{key}_angle"] = angle
                if isinstance(start_anchor, dict):
                    repaired_arc["start"] = dict(start_anchor)
                    if isinstance(center_raw, dict):
                        repaired_arc["start_angle"] = _arc_angle_for_point(center_raw, start_anchor)
                if isinstance(end_anchor, dict):
                    repaired_arc["end"] = dict(end_anchor)
                    if isinstance(center_raw, dict):
                        repaired_arc["end_angle"] = _arc_angle_for_point(center_raw, end_anchor)
                repaired_arc["dimension_block_precision_repaired"] = True
                repaired_arc["dimension_block_repair_reason"] = "arc_dimension_endpoint_aligned_to_arrow_anchor"
                out_primitives.append(repaired_arc)
                repaired = True
                repaired_kinds.append("arc_endpoint_anchor")
                continue
        if str(dim_geom.get("dim_kind") or "").strip().lower() == "radius":
            kind = str(primitive.get("kind") or "").strip().lower()
            start = primitive.get("start")
            end = primitive.get("end")
            if kind == "line" and isinstance(start, dict) and isinstance(end, dict):
                seg_len = context.point_distance(start, end)
                start_distance = context.point_distance(start, original_line_end)
                end_distance = context.point_distance(end, original_line_end)
                if (
                    seg_len >= max(arrow_len * 3.0, endpoint_tol)
                    and min(start_distance, end_distance) <= max(endpoint_tol, arrow_len * 3.0)
                ):
                    repaired_line = dict(primitive)
                    if start_distance <= end_distance:
                        repaired_line["start"] = dict(original_line_end)
                    else:
                        repaired_line["end"] = dict(original_line_end)
                    repaired_line["dimension_block_precision_repaired"] = True
                    repaired_line["dimension_block_repair_reason"] = "radius_dimension_line_extended_to_arrow_tip"
                    out_primitives.append(repaired_line)
                    repaired = True
                    repaired_kinds.append("radius_dimension_line_anchor")
                    continue
        if idx in dimension_line_extension_by_index and str(primitive.get("kind") or "").strip().lower() == "line":
            start = primitive.get("start")
            end = primitive.get("end")
            anchor = dimension_line_extension_by_index[idx]
            if isinstance(start, dict) and isinstance(end, dict):
                repaired_line = dict(primitive)
                if context.point_distance(start, anchor) <= context.point_distance(end, anchor):
                    repaired_line["start"] = dict(anchor)
                else:
                    repaired_line["end"] = dict(anchor)
                repaired_line["dimension_block_precision_repaired"] = True
                repaired_line["dimension_block_repair_reason"] = "dimension_line_extended_to_arrow_anchor"
                out_primitives.append(repaired_line)
                repaired = True
                repaired_kinds.append("dimension_line_anchor")
                continue

        if idx in arc_arrow_repair_by_index or idx in arrow_polygon_anchor_by_index:
            arc_repair_info: Optional[Dict[str, object]] = None
            if idx in arc_arrow_repair_by_index:
                arc_repair_info = arc_arrow_repair_by_index[idx]
                tip_raw = arc_repair_info.get("tip")
                inward_raw = arc_repair_info.get("inward")
                if not isinstance(tip_raw, dict) or not isinstance(inward_raw, tuple):
                    out_primitives.append(primitive)
                    continue
                tip = tip_raw
                inward = inward_raw
            else:
                anchor_kind = arrow_polygon_anchor_by_index[idx]
                tip = line_start if anchor_kind == "start" else line_end
                inward = (ux, uy) if anchor_kind == "start" else (-ux, -uy)
            triangle = _triangle_geometry(tip, inward)
            triangle_ring = triangle.get("ring")
            if not isinstance(triangle_ring, list):
                out_primitives.append(primitive)
                continue
            repaired_triangle = dict(primitive)
            repaired_triangle["rings"] = [triangle_ring]
            repaired_triangle["filled"] = True
            repaired_triangle["pattern_name"] = repaired_triangle.get("pattern_name") or "ARROW"
            repaired_triangle["arrow_fill"] = True
            repaired_triangle["subtype"] = "dimension_block_closed_filled_arrow_repaired"
            repaired_triangle["dimension_block_precision_repaired"] = True
            repaired_triangle["arrow_tip"] = triangle.get("tip")
            repaired_triangle["arrow_inward"] = triangle.get("inward")
            repaired_triangle["arrow_base_mid"] = triangle.get("base_mid")
            repaired_triangle["dimension_arrow_role"] = (
                arc_repair_info.get("role")
                if isinstance(arc_repair_info, dict)
                else ("start" if arrow_polygon_anchor_by_index.get(idx) == "start" else "end")
            )
            if isinstance(arc_repair_info, dict):
                repaired_triangle["dimension_block_repair_reason"] = "arc_arrow_anchor_intersection_rebuilt"
                repaired_triangle["dimension_arrow_anchor_source"] = arc_repair_info.get("anchor_source")
                repaired_triangle["dimension_arrow_anchor_delta_from_raw"] = arc_repair_info.get("anchor_delta_from_raw")
                repaired_triangle["dimension_arc_primitive_index"] = arc_repair_info.get("arc_index")
                repaired_triangle["dimension_extension_primitive_index"] = arc_repair_info.get("extension_primitive_index")
                repaired_triangle["dimension_arc_endpoint"] = arc_repair_info.get("endpoint")
                repaired_triangle["dimension_arc_endpoint_distance"] = arc_repair_info.get("endpoint_distance")
                repaired_triangle["dimension_arc_tangent_error_deg"] = arc_repair_info.get("tangent_error_deg")
                arc_arrow_repair_summaries.append({
                    "primitive_index": idx,
                    "arc_index": arc_repair_info.get("arc_index"),
                    "extension_primitive_index": arc_repair_info.get("extension_primitive_index"),
                    "role": arc_repair_info.get("role"),
                    "tip": triangle.get("tip"),
                    "raw_tip": arc_repair_info.get("raw_tip"),
                    "endpoint": arc_repair_info.get("endpoint"),
                    "endpoint_distance": arc_repair_info.get("endpoint_distance"),
                    "anchor_source": arc_repair_info.get("anchor_source"),
                    "anchor_delta_from_raw": arc_repair_info.get("anchor_delta_from_raw"),
                    "tip_source": arc_repair_info.get("tip_source"),
                    "tip_endpoint_distance": arc_repair_info.get("tip_endpoint_distance"),
                    "tangent_error_deg": arc_repair_info.get("tangent_error_deg"),
                })
            else:
                repaired_triangle["dimension_block_repair_reason"] = "odreadex_low_precision_solid_vertices"
            out_primitives.append(repaired_triangle)
            repaired = True
            repaired_kinds.append("arc_arrow_anchor" if idx in arc_arrow_repair_by_index else "closed_filled_arrow")
            continue

        if idx in start_tick_indices:
            points = _primitive_points(primitive)
            centroid = _centroid(points)
            if isinstance(centroid, dict):
                tx = float(line_start.get("x", 0.0)) - float(centroid.get("x", 0.0))
                ty = float(line_start.get("y", 0.0)) - float(centroid.get("y", 0.0))
                moved = _translate_primitive(primitive, tx, ty)
                moved["dimension_block_precision_repaired"] = True
                moved["dimension_block_repair_reason"] = "odreadex_low_precision_insert_position"
                out_primitives.append(moved)
                repaired = True
                repaired_kinds.append("archtick_position")
                continue

        out_primitives.append(primitive)

    return out_primitives, {
        "repaired": repaired,
        "kinds": sorted(set(repaired_kinds)),
        "arrow_length": arrow_len,
        "endpoint_tolerance": endpoint_tol,
        "arc_arrow_repairs": arc_arrow_repair_summaries,
        **anchor_info,
    }

