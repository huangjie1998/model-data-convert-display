from __future__ import annotations

import math
from typing import Callable, Dict, List, Optional, Tuple

from server.dwg.common.geometry import (
    _angle_deg,
    _distance_to_bbox_2d,
    _distance_to_segment,
    _is_angle_on_arc,
    _point_angle_from_center,
    _point_distance,
)


EntityPrimitiveBuilder = Callable[[Dict[str, object]], List[Dict[str, object]]]


def iter_space_entities(session: object, space_id: str):
    return getattr(session, "entities_by_space", {}).get(space_id, [])


def iter_space_block_refs(session: object, space_id: str):
    return getattr(session, "block_refs_by_space", {}).get(space_id, [])


def iter_entity_segments(
    ent: Dict[str, object],
    entity_primitives: EntityPrimitiveBuilder,
) -> List[Tuple[Dict[str, float], Dict[str, float]]]:
    segments: List[Tuple[Dict[str, float], Dict[str, float]]] = []
    for primitive in entity_primitives(ent):
        kind = str(primitive.get("kind", "")).lower()
        if kind == "line":
            start = primitive.get("start")
            end = primitive.get("end")
            if isinstance(start, dict) and isinstance(end, dict):
                segments.append((start, end))
            continue
        if kind == "polyline":
            pts = primitive.get("points")
            if not isinstance(pts, list):
                continue
            clean = [p for p in pts if isinstance(p, dict)]
            if len(clean) < 2:
                continue
            for i in range(len(clean) - 1):
                segments.append((clean[i], clean[i + 1]))
            if bool(primitive.get("closed", False)) and len(clean) > 2 and _point_distance(clean[0], clean[-1]) > 1e-6:
                segments.append((clean[-1], clean[0]))
            continue
        if kind == "polygon":
            rings = primitive.get("rings")
            if not isinstance(rings, list):
                continue
            for ring in rings:
                if not isinstance(ring, list):
                    continue
                clean = [p for p in ring if isinstance(p, dict)]
                if len(clean) < 2:
                    continue
                for i in range(len(clean) - 1):
                    segments.append((clean[i], clean[i + 1]))
                if _point_distance(clean[0], clean[-1]) > 1e-6:
                    segments.append((clean[-1], clean[0]))
            continue
        if kind in ("circle", "arc"):
            center = primitive.get("center")
            radius = primitive.get("radius")
            if not isinstance(center, dict) or not isinstance(radius, (int, float)) or float(radius) <= 0:
                continue
            sa = float(primitive.get("start_angle", 0.0 if kind == "arc" else 0.0))
            ea = float(primitive.get("end_angle", 360.0 if kind == "arc" else 360.0))
            if kind == "arc" and isinstance(primitive.get("start"), dict) and isinstance(primitive.get("end"), dict):
                sa = _point_angle_from_center(center, primitive.get("start"))  # type: ignore[arg-type]
                ea = _point_angle_from_center(center, primitive.get("end"))  # type: ignore[arg-type]
            delta = ((ea - sa) % 360.0 + 360.0) % 360.0
            if kind == "arc" and delta <= 1e-9:
                delta = 360.0
            steps = max(8, min(256, int(abs(delta) / 12.0) + 1))
            pts: List[Dict[str, float]] = []
            for i in range(steps + 1):
                t = i / max(1, steps)
                ang = math.radians(sa + delta * t)
                pts.append(
                    {
                        "x": float(center["x"]) + float(radius) * math.cos(ang),
                        "y": float(center["y"]) + float(radius) * math.sin(ang),
                        "z": float(center.get("z", 0.0)),
                    }
                )
            for i in range(len(pts) - 1):
                segments.append((pts[i], pts[i + 1]))
            continue
        if kind == "ellipse":
            center = primitive.get("center")
            rx = primitive.get("rx")
            ry = primitive.get("ry")
            if isinstance(center, dict) and isinstance(rx, (int, float)) and isinstance(ry, (int, float)):
                start_a = float(primitive.get("start_angle", 0.0))
                end_a = float(primitive.get("end_angle", 360.0))
                rot = math.radians(float(primitive.get("rotation", 0.0)))
                cos_r = math.cos(rot)
                sin_r = math.sin(rot)
                delta = ((end_a - start_a) % 360.0 + 360.0) % 360.0
                if delta <= 1e-9:
                    delta = 360.0
                steps = max(8, min(256, int(abs(delta) / 10.0) + 1))
                pts: List[Dict[str, float]] = []
                for i in range(steps + 1):
                    t = i / max(1, steps)
                    ang = math.radians(start_a + delta * t)
                    ex = float(rx) * math.cos(ang)
                    ey = float(ry) * math.sin(ang)
                    pts.append(
                        {
                            "x": float(center["x"]) + ex * cos_r - ey * sin_r,
                            "y": float(center["y"]) + ex * sin_r + ey * cos_r,
                            "z": float(center.get("z", 0.0)),
                        }
                    )
                for i in range(len(pts) - 1):
                    segments.append((pts[i], pts[i + 1]))
    return segments


def iter_entity_text_points(
    ent: Dict[str, object],
    entity_primitives: EntityPrimitiveBuilder,
) -> List[Dict[str, float]]:
    points: List[Dict[str, float]] = []
    for primitive in entity_primitives(ent):
        if str(primitive.get("kind", "")).lower() != "text":
            continue
        pos = primitive.get("position")
        if isinstance(pos, dict):
            points.append(pos)
    return points


def pick_in_session(
    *,
    doc_id: str,
    session: object,
    payload: Dict[str, object],
    entity_primitives: EntityPrimitiveBuilder,
) -> Dict[str, object]:
    current_space = getattr(session, "current_space", "model")
    space_id = payload.get("space_id") if isinstance(payload.get("space_id"), str) else current_space
    point = payload.get("point") if isinstance(payload.get("point"), dict) else None
    tol = float(payload.get("tolerance", 8.0))
    selection_scope = str(payload.get("selection_scope", "entity") or "entity").strip().lower()
    parent_block_id = payload.get("parent_block_id") if isinstance(payload.get("parent_block_id"), str) else None
    if not point or "x" not in point or "y" not in point:
        return {"doc_id": doc_id, "space_id": space_id, "selection_scope": selection_scope, "picked": []}

    if selection_scope == "block":
        best_block = None
        best_dist = float("inf")
        for block_ref in iter_space_block_refs(session, space_id):
            dist = _distance_to_bbox_2d(point, block_ref.get("bbox"))
            if dist is None:
                continue
            if dist < best_dist:
                best_dist = dist
                best_block = block_ref
        picked: List[Dict[str, object]] = []
        if best_block is not None and best_dist <= tol:
            picked.append(
                {
                    "entity_id": best_block.get("id"),
                    "distance": best_dist,
                    "picked_kind": "block",
                    "parent_block_id": best_block.get("parent_block_id"),
                }
            )
        return {"doc_id": doc_id, "space_id": space_id, "selection_scope": "block", "picked": picked}

    best = None
    best_dist = float("inf")
    for ent in iter_space_entities(session, space_id):
        if parent_block_id is not None and str(ent.get("parent_block_id") or "") != parent_block_id:
            continue
        etype = str(ent.get("type", "")).upper()
        geom = ent.get("geom", {})
        d: Optional[float] = None

        for a, b in iter_entity_segments(ent, entity_primitives):
            dist, _, _ = _distance_to_segment(point, a, b)
            if d is None or dist < d:
                d = dist

        if etype == "CIRCLE":
            center = geom.get("center") if isinstance(geom, dict) else None
            radius = geom.get("radius") if isinstance(geom, dict) else None
            if isinstance(center, dict) and isinstance(radius, (int, float)):
                radial = abs(_point_distance(point, center) - float(radius))
                if d is None or radial < d:
                    d = radial
        elif etype == "ARC":
            center = geom.get("center") if isinstance(geom, dict) else None
            radius = geom.get("radius") if isinstance(geom, dict) else None
            if isinstance(center, dict) and isinstance(radius, (int, float)):
                radial_dist = abs(_point_distance(point, center) - float(radius))
                start = geom.get("start")
                end = geom.get("end")
                start_angle = geom.get("start_angle")
                end_angle = geom.get("end_angle")
                if isinstance(start_angle, (int, float)) and isinstance(end_angle, (int, float)):
                    a = _point_angle_from_center(center, point)
                    if not _is_angle_on_arc(a, float(start_angle), float(end_angle)):
                        endpoint_distances = []
                        if isinstance(start, dict):
                            endpoint_distances.append(_point_distance(point, start))
                        if isinstance(end, dict):
                            endpoint_distances.append(_point_distance(point, end))
                        if endpoint_distances:
                            radial_dist = min(radial_dist, min(endpoint_distances))
                if d is None or radial_dist < d:
                    d = radial_dist
        elif etype == "POINT":
            pos = geom.get("position") if isinstance(geom, dict) else None
            if isinstance(pos, dict):
                pt_dist = _point_distance(point, pos)
                if d is None or pt_dist < d:
                    d = pt_dist

        text_points = iter_entity_text_points(ent, entity_primitives)
        for text_point in text_points:
            td = _point_distance(point, text_point)
            if d is None or td < d:
                d = td

        if text_points:
            bbox_dist = _distance_to_bbox_2d(point, ent.get("bbox"))
            if bbox_dist is not None and (d is None or bbox_dist < d):
                d = bbox_dist

        if d is not None and d < best_dist:
            best_dist = d
            best = ent

    picked: List[Dict[str, object]] = []
    if best is not None and best_dist <= tol:
        picked.append(
            {
                "entity_id": best["id"],
                "distance": best_dist,
                "picked_kind": "entity",
                "parent_block_id": best.get("parent_block_id"),
            }
        )
    return {"doc_id": doc_id, "space_id": space_id, "selection_scope": "entity", "picked": picked}


def snap_in_session(
    *,
    doc_id: str,
    session: object,
    payload: Dict[str, object],
    entity_primitives: EntityPrimitiveBuilder,
) -> Dict[str, object]:
    current_space = getattr(session, "current_space", "model")
    space_id = payload.get("space_id") if isinstance(payload.get("space_id"), str) else current_space
    point = payload.get("point") if isinstance(payload.get("point"), dict) else None
    modes = payload.get("modes") if isinstance(payload.get("modes"), list) else ["endpoint", "midpoint", "center"]
    tol = float(payload.get("tolerance", 10.0))
    if not point or "x" not in point or "y" not in point:
        return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": None, "mode": None}

    candidates: List[Tuple[float, Dict[str, float], str]] = []
    for ent in iter_space_entities(session, space_id):
        etype = str(ent.get("type", "")).upper()
        geom = ent.get("geom", {})

        for a, b in iter_entity_segments(ent, entity_primitives):
            if "endpoint" in modes:
                candidates.append((_point_distance(point, a), a, "endpoint"))
                candidates.append((_point_distance(point, b), b, "endpoint"))
            if "midpoint" in modes:
                mid = {
                    "x": (float(a["x"]) + float(b["x"])) * 0.5,
                    "y": (float(a["y"]) + float(b["y"])) * 0.5,
                    "z": 0.0,
                }
                candidates.append((_point_distance(point, mid), mid, "midpoint"))

        if etype == "CIRCLE" and "center" in modes:
            center = geom.get("center") if isinstance(geom, dict) else None
            if isinstance(center, dict):
                candidates.append((_point_distance(point, center), center, "center"))
        elif etype == "ARC":
            center = geom.get("center") if isinstance(geom, dict) else None
            if "center" in modes and isinstance(center, dict):
                candidates.append((_point_distance(point, center), center, "center"))
            if "endpoint" in modes and isinstance(geom, dict):
                start = geom.get("start")
                end = geom.get("end")
                if isinstance(start, dict):
                    candidates.append((_point_distance(point, start), start, "endpoint"))
                if isinstance(end, dict):
                    candidates.append((_point_distance(point, end), end, "endpoint"))
        elif etype == "POINT":
            pos = geom.get("position") if isinstance(geom, dict) else None
            if "endpoint" in modes and isinstance(pos, dict):
                candidates.append((_point_distance(point, pos), pos, "endpoint"))

    if not candidates:
        return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": point, "mode": None}

    best = min(candidates, key=lambda x: x[0])
    if best[0] > tol:
        return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": point, "mode": None}
    return {"doc_id": doc_id, "space_id": space_id, "snapped": True, "point": best[1], "mode": best[2]}


def measure_payload(doc_id: str, payload: Dict[str, object]) -> Dict[str, object]:
    measure_type = str(payload.get("type", "distance"))
    if measure_type == "distance":
        p1 = payload.get("p1")
        p2 = payload.get("p2")
        if not isinstance(p1, dict) or not isinstance(p2, dict):
            return {"doc_id": doc_id, "type": "distance", "ok": False, "error": "p1/p2 required"}
        value = _point_distance(p1, p2)
        return {"doc_id": doc_id, "type": "distance", "ok": True, "value": value, "unit": "drawing_unit"}

    if measure_type == "angle":
        p1 = payload.get("p1")
        vertex = payload.get("vertex")
        p2 = payload.get("p2")
        if not isinstance(p1, dict) or not isinstance(vertex, dict) or not isinstance(p2, dict):
            return {"doc_id": doc_id, "type": "angle", "ok": False, "error": "p1/vertex/p2 required"}
        value = _angle_deg(p1, vertex, p2)
        if value is None:
            return {"doc_id": doc_id, "type": "angle", "ok": False, "error": "invalid points"}
        return {"doc_id": doc_id, "type": "angle", "ok": True, "value": value, "unit": "degree"}

    return {"doc_id": doc_id, "type": measure_type, "ok": False, "error": "unsupported measure type"}
