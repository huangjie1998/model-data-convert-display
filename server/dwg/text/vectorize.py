from __future__ import annotations

import math
import re
from typing import Dict, List, Optional, Set, Tuple

from server.dwg.common.fonts import (
    _detect_font_kind,
    _normalize_entity_instance_key,
)
from server.dwg.common.geometry import _point_distance
from server.dwg.common.oda_parse import (
    _VECTORIZE_ENTITY_END_RE,
    _VECTORIZE_ENTITY_START_RE,
    _VECTORIZE_VERTEX_RE,
    _is_text_entity_type,
    _parse_label_value,
)


def _build_vectorize_parse_meta_from_primitives(core, data: Dict[str, List[Dict[str, object]]]) -> Dict[str, object]:
        if not isinstance(data, dict):
            return {
                "vectorize_text_entity_count": 0,
                "vectorize_text_keys_count": 0,
                "vectorize_primitives_total": 0,
                "shape_file_text_true_count": 0,
                "vectorize_text_key_samples": [],
            }
        keys = [str(k) for k in data.keys() if str(k).strip()]
        total_primitives = 0
        shape_file_hits = 0
        for plist in data.values():
            if not isinstance(plist, list):
                continue
            total_primitives += len([p for p in plist if isinstance(p, dict)])
            if any(bool(p.get("shape_file_text")) for p in plist if isinstance(p, dict)):
                shape_file_hits += 1
        return {
            "vectorize_text_entity_count": len(keys),
            "vectorize_text_keys_count": len(keys),
            "vectorize_primitives_total": int(total_primitives),
            "shape_file_text_true_count": int(shape_file_hits),
            "vectorize_text_key_samples": keys[:20],
        }

def _outline_point_key(core, p: Dict[str, float], eps: float = 1e-4) -> Tuple[int, int]:
        return (int(round(float(p.get("x", 0.0)) / eps)), int(round(float(p.get("y", 0.0)) / eps)))

def _clean_polyline_points(core, points: List[Dict[str, float]], closed: bool) -> List[Dict[str, float]]:
        out: List[Dict[str, float]] = []
        for p in points:
            if not isinstance(p, dict):
                continue
            q = {"x": float(p.get("x", 0.0)), "y": float(p.get("y", 0.0)), "z": float(p.get("z", 0.0))}
            if out and _point_distance(out[-1], q) <= 1e-7:
                continue
            out.append(q)
        if closed and len(out) >= 3 and _point_distance(out[0], out[-1]) > 1e-6:
            out.append(dict(out[0]))
        if closed and len(out) >= 2 and _point_distance(out[0], out[-1]) <= 1e-9 and len(out) == 2:
            return []
        return out

def _simplify_polyline_points(
        core,
        points: List[Dict[str, float]],
        closed: bool,
        angle_eps: float = 1e-4,
    ) -> List[Dict[str, float]]:
        clean = core._clean_polyline_points(points, closed=closed)
        if len(clean) < 3:
            return clean

        work = clean[:-1] if (closed and len(clean) >= 2 and _point_distance(clean[0], clean[-1]) <= 1e-7) else clean
        if len(work) < 3:
            return clean

        simplified: List[Dict[str, float]] = [dict(work[0])]
        for i in range(1, len(work) - 1):
            prev = simplified[-1]
            curr = work[i]
            nxt = work[i + 1]

            v1x = float(curr["x"]) - float(prev["x"])
            v1y = float(curr["y"]) - float(prev["y"])
            v2x = float(nxt["x"]) - float(curr["x"])
            v2y = float(nxt["y"]) - float(curr["y"])
            n1 = math.hypot(v1x, v1y)
            n2 = math.hypot(v2x, v2y)
            if n1 <= 1e-9 or n2 <= 1e-9:
                continue

            cross = abs(v1x * v2y - v1y * v2x)
            if cross / (n1 * n2) <= angle_eps:
                continue
            simplified.append(dict(curr))

        simplified.append(dict(work[-1]))
        if closed and len(simplified) >= 3:
            simplified.append(dict(simplified[0]))
        return simplified

def _polygon_abs_area(core, ring: List[Dict[str, float]]) -> float:
        if len(ring) < 3:
            return 0.0
        area2 = 0.0
        pts = ring
        for i in range(len(pts) - 1):
            x1 = float(pts[i]["x"])
            y1 = float(pts[i]["y"])
            x2 = float(pts[i + 1]["x"])
            y2 = float(pts[i + 1]["y"])
            area2 += x1 * y2 - x2 * y1
        return abs(area2) * 0.5

def _triangle_mesh_to_boundary_loops(core, triangles: List[List[Dict[str, float]]]) -> List[List[Dict[str, float]]]:
        # Convert triangulated text fill to boundary loops to reduce primitive count.
        canonical_point: Dict[Tuple[int, int], Dict[str, float]] = {}
        edge_count: Dict[Tuple[Tuple[int, int], Tuple[int, int]], int] = {}

        for tri in triangles:
            clean = core._clean_polyline_points(tri, closed=False)
            if len(clean) < 3:
                continue
            tri_pts = clean[:3]
            keys = [core._outline_point_key(p) for p in tri_pts]
            if len({keys[0], keys[1], keys[2]}) < 3:
                continue
            for k, p in zip(keys, tri_pts):
                if k not in canonical_point:
                    canonical_point[k] = dict(p)
            tri_edges = [(keys[0], keys[1]), (keys[1], keys[2]), (keys[2], keys[0])]
            for a, b in tri_edges:
                edge = (a, b) if a <= b else (b, a)
                edge_count[edge] = edge_count.get(edge, 0) + 1

        boundary_edges = [e for e, c in edge_count.items() if c == 1]
        if not boundary_edges:
            return []

        adjacency: Dict[Tuple[int, int], Set[Tuple[int, int]]] = {}
        for a, b in boundary_edges:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)

        unused: Set[Tuple[Tuple[int, int], Tuple[int, int]]] = set(boundary_edges)
        loops: List[List[Dict[str, float]]] = []

        def pop_edge_key(a: Tuple[int, int], b: Tuple[int, int]) -> Optional[Tuple[Tuple[int, int], Tuple[int, int]]]:
            k = (a, b) if a <= b else (b, a)
            if k in unused:
                unused.remove(k)
                return k
            return None

        while unused:
            start_edge = next(iter(unused))
            unused.remove(start_edge)
            start, curr = start_edge
            prev = start
            chain: List[Tuple[int, int]] = [start, curr]

            guard = 0
            while guard < 200000:
                guard += 1
                if curr == start:
                    break
                neigh = adjacency.get(curr, set())
                candidates = [n for n in neigh if n != prev and ((curr, n) if curr <= n else (n, curr)) in unused]
                if not candidates:
                    fallback = [n for n in neigh if ((curr, n) if curr <= n else (n, curr)) in unused]
                    if not fallback:
                        break
                    nxt = fallback[0]
                else:
                    nxt = candidates[0]
                if pop_edge_key(curr, nxt) is None:
                    break
                chain.append(nxt)
                prev, curr = curr, nxt
                if curr == start:
                    break

            if len(chain) < 4:
                continue
            if chain[0] != chain[-1]:
                chain.append(chain[0])
            loop_points: List[Dict[str, float]] = []
            for k in chain:
                p = canonical_point.get(k)
                if not p:
                    continue
                loop_points.append(dict(p))
            loop_points = core._simplify_polyline_points(loop_points, closed=True)
            if len(loop_points) < 4:
                continue
            if core._polygon_abs_area(loop_points) <= 1e-4:
                continue
            loops.append(loop_points)

        return loops

def _optimize_oda_text_outlines(core, primitives: List[Dict[str, object]]) -> List[Dict[str, object]]:
        if not primitives:
            return []

        triangles: List[List[Dict[str, float]]] = []
        passthrough: List[Dict[str, object]] = []

        for prim in primitives:
            if not isinstance(prim, dict):
                continue
            kind = str(prim.get("kind", "")).lower()
            if kind == "polygon":
                rings = prim.get("rings")
                if not isinstance(rings, list) or not rings:
                    continue
                ring0 = rings[0]
                if isinstance(ring0, list):
                    clean = core._clean_polyline_points([p for p in ring0 if isinstance(p, dict)], closed=True)
                    # Triangulated glyph shells usually arrive as many 3-point polygons (+ closing point).
                    unique_count = len({core._outline_point_key(p) for p in clean[:-1]}) if len(clean) >= 2 else 0
                    if unique_count == 3:
                        triangles.append(clean)
                        continue
            if kind == "polyline":
                points = prim.get("points")
                if isinstance(points, list):
                    clean_points = core._simplify_polyline_points(
                        [p for p in points if isinstance(p, dict)],
                        closed=bool(prim.get("closed", False)),
                    )
                    if len(clean_points) >= 2:
                        copy_prim = dict(prim)
                        copy_prim["points"] = clean_points
                        copy_prim["closed"] = bool(prim.get("closed", False))
                        passthrough.append(copy_prim)
                    continue
            passthrough.append(dict(prim))

        optimized: List[Dict[str, object]] = []
        optimized.extend(passthrough)

        if len(triangles) >= 12:
            loops = core._triangle_mesh_to_boundary_loops(triangles)
            if loops:
                for loop in loops:
                    optimized.append(
                        {
                            "kind": "polyline",
                            "points": core._simplify_polyline_points(loop, closed=True),
                            "closed": True,
                            "subtype": "shx_outline_oda_boundary",
                        }
                    )
                return optimized

        # Fallback: keep the original triangles when loop reconstruction is unavailable.
        for tri in triangles:
            if len(tri) >= 4:
                optimized.append(
                    {
                        "kind": "polygon",
                        "rings": [tri],
                        "filled": True,
                        "pattern_name": "TEXT_OUTLINE",
                        "subtype": "shx_outline_oda",
                    }
                )
        return optimized

def _parse_vectorize_vertex(core, line: str) -> Optional[Dict[str, float]]:
        m = _VECTORIZE_VERTEX_RE.match(line)
        if not m:
            return None
        raw = m.group("point").strip()
        parts = [p for p in re.split(r"\s+", raw) if p]
        if len(parts) < 2:
            return None
        try:
            x = float(parts[0])
            y = float(parts[1])
            z = float(parts[2]) if len(parts) >= 3 else 0.0
        except Exception:
            return None
        return {"x": x, "y": y, "z": z}

def _parse_oda_vectorize_text_primitives(core, dump_text: str) -> Tuple[Dict[str, List[Dict[str, object]]], Dict[str, object]]:
        result: Dict[str, List[Dict[str, object]]] = {}
        parse_meta: Dict[str, object] = {
            "vectorize_text_entity_count": 0,
            "vectorize_text_keys_count": 0,
            "vectorize_primitives_total": 0,
            "shape_file_text_true_count": 0,
            "vectorize_text_key_samples": [],
        }
        entity_stack: List[Tuple[str, str]] = []
        block_ref_stack: List[str] = []
        text_ctx_stack: List[Dict[str, object]] = []
        capture_kind: Optional[str] = None
        capture_points: List[Dict[str, float]] = []
        key_sample_seen: Set[str] = set()

        def flush_capture() -> None:
            nonlocal capture_kind, capture_points
            if not capture_kind or not text_ctx_stack:
                capture_kind = None
                capture_points = []
                return
            ctx = text_ctx_stack[-1]
            primitives = ctx.get("primitives")
            if not isinstance(primitives, list):
                primitives = []
                ctx["primitives"] = primitives
            shape_file = bool(ctx.get("shape_file", False))

            if capture_kind == "polygon":
                if len(capture_points) >= 3:
                    ring = [dict(p) for p in capture_points]
                    if _point_distance(ring[0], ring[-1]) > 1e-6:
                        ring.append(dict(ring[0]))
                    primitives.append(
                        {
                            "kind": "polygon",
                            "rings": [ring],
                            "filled": True,
                            "pattern_name": "TEXT_OUTLINE",
                            "subtype": "shx_outline_oda",
                            "shape_file_text": shape_file,
                        }
                    )
            elif capture_kind == "polyline":
                if len(capture_points) >= 2:
                    points = [dict(p) for p in capture_points]
                    closed = len(points) >= 3 and _point_distance(points[0], points[-1]) <= 1e-6
                    primitives.append(
                        {
                            "kind": "polyline",
                            "points": points,
                            "closed": closed,
                            "subtype": "shx_outline_oda",
                            "shape_file_text": shape_file,
                        }
                    )

            capture_kind = None
            capture_points = []

        def finalize_text_ctx() -> None:
            if not text_ctx_stack:
                return
            flush_capture()
            ctx = text_ctx_stack.pop()
            key = _normalize_entity_instance_key(ctx.get("key"))
            if not key:
                return
            primitives = ctx.get("primitives")
            if not isinstance(primitives, list):
                return
            clean = [p for p in primitives if isinstance(p, dict)]
            if not clean:
                return
            shape_file = bool(ctx.get("shape_file", False))
            optimized = core._optimize_oda_text_outlines(clean)
            if shape_file:
                parse_meta["shape_file_text_true_count"] = int(parse_meta.get("shape_file_text_true_count", 0)) + 1
                for prim in optimized:
                    if isinstance(prim, dict):
                        prim["shape_file_text"] = True
            bucket = result.setdefault(key, [])
            clean_optimized = [p for p in optimized if isinstance(p, dict)]
            bucket.extend(clean_optimized)
            parse_meta["vectorize_primitives_total"] = int(parse_meta.get("vectorize_primitives_total", 0)) + len(clean_optimized)
            if key not in key_sample_seen and len(key_sample_seen) < 20:
                key_sample_seen.add(key)
                samples = parse_meta.get("vectorize_text_key_samples")
                if isinstance(samples, list):
                    samples.append(key)

        for raw in dump_text.splitlines():
            line = raw.rstrip()

            if capture_kind:
                if capture_kind == "polygon" and "End polygonOut" in line:
                    flush_capture()
                    continue
                if capture_kind == "polyline" and "End polylineOut" in line:
                    flush_capture()
                    continue
                pt = core._parse_vectorize_vertex(line)
                if pt is not None:
                    capture_points.append(pt)
                    continue

            if text_ctx_stack:
                if "Start polygonOut" in line:
                    flush_capture()
                    capture_kind = "polygon"
                    capture_points = []
                    continue
                if "Start polylineOut" in line:
                    flush_capture()
                    capture_kind = "polyline"
                    capture_points = []
                    continue

            m_start = _VECTORIZE_ENTITY_START_RE.match(line)
            if m_start:
                etype = m_start.group("etype").upper()
                handle = m_start.group("handle").upper()
                entity_stack.append((etype, handle))
                if etype == "ACDBBLOCKREFERENCE":
                    block_ref_stack.append(handle)
                if etype in ("ACDBTEXT", "ACDBMTEXT"):
                    parse_meta["vectorize_text_entity_count"] = int(parse_meta.get("vectorize_text_entity_count", 0)) + 1
                    instance_id = handle
                    if block_ref_stack:
                        instance_id = f"{handle}@{'/'.join(block_ref_stack)}"
                    text_ctx_stack.append({"key": instance_id, "primitives": [], "shape_file": False})
                continue

            if text_ctx_stack and not capture_kind:
                label, value = _parse_label_value(line)
                if label == "shape file" and value is not None:
                    text_ctx_stack[-1]["shape_file"] = str(value).strip().lower() == "true"
                    continue

            m_end = _VECTORIZE_ENTITY_END_RE.match(line)
            if m_end:
                end_etype = m_end.group("etype").upper()
                end_handle = m_end.group("handle").upper()
                while entity_stack:
                    popped_etype, popped_handle = entity_stack.pop()
                    if popped_etype in ("ACDBTEXT", "ACDBMTEXT"):
                        finalize_text_ctx()
                    if popped_etype == "ACDBBLOCKREFERENCE" and block_ref_stack:
                        block_ref_stack.pop()
                    if popped_etype == end_etype and popped_handle == end_handle:
                        break
                continue

        flush_capture()
        while text_ctx_stack:
            finalize_text_ctx()

        parse_meta["vectorize_text_keys_count"] = len(result)
        return result, parse_meta

def _has_shx_text_entities(core, entities_by_space: Dict[str, List[Dict[str, object]]]) -> bool:
        for entities in entities_by_space.values():
            for ent in entities:
                if not _is_text_entity_type(ent.get("type")):
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue
                if str(geom.get("font_kind", "")).strip().lower() == "shx":
                    return True
        return False

def _has_text_entities(core, entities_by_space: Dict[str, List[Dict[str, object]]]) -> bool:
        for entities in entities_by_space.values():
            for ent in entities:
                if _is_text_entity_type(ent.get("type")):
                    return True
        return False

def _has_shx_style_hints(core, text_styles: Dict[str, Dict[str, object]]) -> bool:
        for rec in text_styles.values():
            if not isinstance(rec, dict):
                continue
            if bool(rec.get("shape_file", False)):
                return True
            if str(rec.get("font_kind", "")).strip().lower() == "shx":
                return True
            if _detect_font_kind(rec.get("bigfont_name")) == "shx":
                return True
        return False

def _count_shx_text_fallback_entities(core, entities_by_space: Dict[str, List[Dict[str, object]]]) -> int:
        count = 0
        for entities in entities_by_space.values():
            for ent in entities:
                if not _is_text_entity_type(ent.get("type")):
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue
                if str(geom.get("font_kind", "")).strip().lower() != "shx":
                    continue
                oda_outlines = geom.get("oda_outline_primitives")
                if not isinstance(oda_outlines, list) or len(oda_outlines) == 0:
                    count += 1
        return count

def _format_missing_font_names(names: List[str], max_items: int = 8) -> str:
        if not names:
            return ""
        shown = names[:max_items]
        if len(names) > max_items:
            return f"{'、'.join(shown)} 等{len(names)}个"
        return "、".join(shown)

def _collect_missing_style_fonts(core, text_styles: Dict[str, Dict[str, object]]) -> Tuple[List[str], List[str]]:
        missing_primary: Dict[str, str] = {}
        missing_bigfont: Dict[str, str] = {}

        def mark_missing(bucket: Dict[str, str], name_raw: object) -> None:
            name = str(name_raw or "").strip()
            if not name:
                return
            if core._resolve_font_file(name) is not None:
                return
            key = name.lower()
            if key not in bucket:
                bucket[key] = name

        for rec in text_styles.values():
            if not isinstance(rec, dict):
                continue
            mark_missing(missing_primary, rec.get("font_name"))
            mark_missing(missing_bigfont, rec.get("bigfont_name"))

        primary_names = sorted(missing_primary.values(), key=lambda s: s.lower())
        bigfont_names = sorted(missing_bigfont.values(), key=lambda s: s.lower())
        return primary_names, bigfont_names

def _build_missing_font_warning(core, text_styles: Dict[str, Dict[str, object]]) -> Optional[str]:
        primary_names, bigfont_names = core._collect_missing_style_fonts(text_styles)
        if not primary_names and not bigfont_names:
            return None

        parts: List[str] = []
        if primary_names:
            parts.append(f"主字体: {core._format_missing_font_names(primary_names)}")
        if bigfont_names:
            parts.append(f"大字体: {core._format_missing_font_names(bigfont_names)}")
        detail = "；".join(parts)
        return f"以下字体文件在服务器未找到：{detail}。已按可用字体或降级策略渲染。"

def _build_shx_font_resolution_warning(
        core,
        text_styles: Dict[str, Dict[str, object]],
        shx_detected: bool,
        shx_true_outline: bool,
    ) -> Optional[str]:
        if not shx_detected or shx_true_outline:
            return None

        missing_items: Dict[str, str] = {}
        found_items: Dict[str, str] = {}

        def push_item(bucket: Dict[str, str], label: str) -> None:
            key = label.lower()
            if key not in bucket:
                bucket[key] = label

        for rec in text_styles.values():
            if not isinstance(rec, dict):
                continue
            shape_file = bool(rec.get("shape_file", False))
            font_kind = str(rec.get("font_kind", "")).strip().lower()
            font_name = str(rec.get("font_name") or "").strip()
            bigfont_name = str(rec.get("bigfont_name") or "").strip()

            primary_is_shx = shape_file or font_kind == "shx" or _detect_font_kind(font_name) == "shx"
            bigfont_is_shx = _detect_font_kind(bigfont_name) == "shx"

            candidates: List[Tuple[str, str]] = []
            if primary_is_shx and font_name:
                candidates.append(("主字体", font_name))
            if bigfont_is_shx and bigfont_name:
                candidates.append(("大字体", bigfont_name))

            for role, name in candidates:
                resolved = core._resolve_font_file(name)
                label = f"{role} {name}"
                if resolved is None:
                    push_item(missing_items, label)
                else:
                    push_item(found_items, label)

        missing_names = sorted(missing_items.values(), key=lambda s: s.lower())
        found_names = sorted(found_items.values(), key=lambda s: s.lower())

        if missing_names:
            fallback_exists = bool(core.shx_fallback_file.exists() and core.shx_fallback_file.is_file())
            fallback_note = (
                f"已尝试使用后备 SHX 字体 {core.shx_fallback_file.name}。"
                if fallback_exists
                else "未检测到可用后备 SHX 字体，请补齐 SHX 文件。"
            )
            found_note = (
                f"已找到：{core._format_missing_font_names(found_names, max_items=6)}。"
                if found_names
                else ""
            )
            return f"以下字体文件在服务器未找到：SHX {core._format_missing_font_names(missing_names)}。{fallback_note}{found_note}"

        if found_names:
            return (
                f"SHX 字体文件检查：未发现缺失项（{core._format_missing_font_names(found_names, max_items=6)}），"
                "当前降级更可能由轮廓匹配失败导致。"
            )

        return "检测到 SHX 文本，但未解析出具体 SHX 字体名；当前已使用降级笔画渲染。"

def _string_list(value: object) -> List[str]:
        if not isinstance(value, list):
            return []
        out: List[str] = []
        seen: Set[str] = set()
        for item in value:
            s = str(item or "").strip()
            if not s:
                continue
            k = s.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append(s)
        return out

def _font_display_name(font_record: Dict[str, object]) -> str:
        return (
            str(font_record.get("name") or "").strip()
            or str(font_record.get("style_name") or "").strip()
            or str(font_record.get("key") or "").strip()
            or "未命名SHX"
        )

def _build_shx_diagnostics_from_fonts(core, fonts: List[Dict[str, object]]) -> Dict[str, object]:
        missing: Dict[str, str] = {}
        resolved: Dict[str, str] = {}
        fallback_file: Optional[str] = None
        fallback_hit_count = 0

        for rec in fonts:
            kind = str(rec.get("kind") or "").strip().lower()
            if kind != "shx":
                continue
            name = core._font_display_name(rec)
            name_key = name.lower()
            reason = str(rec.get("reason") or "").strip().lower()
            fallback_hit = bool(rec.get("fallback_shx_hit"))
            fallback_file_name = str(rec.get("fallback_shx_file_name") or "").strip() or None
            available = bool(rec.get("available"))

            looks_missing = fallback_hit or (not available) or ("not found" in reason) or ("未找到" in reason)
            if looks_missing:
                missing[name_key] = name
                fallback_hit_count += 1 if fallback_hit else 0
                if fallback_hit and fallback_file_name:
                    fallback_file = fallback_file_name
                continue
            resolved[name_key] = name

        missing_names = sorted(missing.values(), key=lambda s: s.lower())
        resolved_names = sorted(v for k, v in resolved.items() if k not in missing)
        if not fallback_file and fallback_hit_count > 0:
            fallback_file = core.shx_fallback_file.name
        return {
            "missing_original_shx_fonts": missing_names,
            "resolved_original_shx_fonts": resolved_names,
            "fallback_shx_file": fallback_file,
            "fallback_hit_count": int(fallback_hit_count),
            "diagnostics_unavailable": False,
        }

def _build_shx_status(core, session: DwgDocSession) -> Dict[str, object]:
        mode = str(session.shx_outline_mode or "none").strip().lower() or "none"
        true_outline = bool(session.shx_true_outline or (mode == "oda_vectorize" and session.shx_vectorize_attached_count > 0))
        payload = {
            "detected": bool(session.shx_detected),
            "outline_mode": mode,
            "true_outline": true_outline,
            "vectorize_attempted": bool(session.shx_vectorize_attempted),
            "vectorize_attached_count": int(session.shx_vectorize_attached_count),
            "vectorize_error": session.shx_vectorize_error,
            "fallback_text_count": int(session.shx_fallback_text_count),
            "vectorize_available": bool(core._is_oda_vectorize_available()),
            "missing_original_shx_fonts": list(session.shx_missing_original_fonts),
            "resolved_original_shx_fonts": list(session.shx_resolved_original_fonts),
            "fallback_shx_file": session.shx_fallback_file_name,
            "fallback_hit_count": int(session.shx_fallback_hit_count),
            "diagnostics_unavailable": bool(session.shx_diagnostics_unavailable),
        }
        if isinstance(session.shx_debug_match, dict):
            payload["debug_match"] = session.shx_debug_match
        return payload

def _attach_oda_vectorized_text_primitives(
        core,
        entities_by_space: Dict[str, List[Dict[str, object]]],
        text_primitives: Dict[str, List[Dict[str, object]]],
    ) -> int:
        attached, _ = core._attach_oda_vectorized_text_primitives_with_debug(
            entities_by_space,
            text_primitives,
            enable_debug=False,
        )
        return attached

def _attach_oda_vectorized_text_primitives_with_debug(
        core,
        entities_by_space: Dict[str, List[Dict[str, object]]],
        text_primitives: Dict[str, List[Dict[str, object]]],
        enable_debug: bool,
    ) -> Tuple[int, Dict[str, object]]:
        debug: Dict[str, object] = {
            "attach_candidate_entity_count": 0,
            "matched_entity_count": 0,
            "unmatched_entity_count": 0,
            "no_vectorize_payload_count": 0,
            "key_mismatch_count": 0,
            "filtered_by_font_kind_count": 0,
            "empty_after_optimize_count": 0,
            "filtered_non_shx_count": 0,
            "shape_file_text_true_count": 0,
            "unmatched_key_samples": [],
            "orphan_vectorize_key_samples": [],
            "key_mismatch_samples": [],
        }
        if not text_primitives:
            return 0, debug

        vector_keys: Set[str] = set()
        for k in text_primitives.keys():
            nk = _normalize_entity_instance_key(k)
            if nk:
                vector_keys.add(nk)
        vector_base_handles = {k.split("@", 1)[0] for k in vector_keys}
        matched_vector_keys: Set[str] = set()

        attached = 0
        for entities in entities_by_space.values():
            for ent in entities:
                if not _is_text_entity_type(ent.get("type")):
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue

                debug["attach_candidate_entity_count"] = int(debug.get("attach_candidate_entity_count", 0)) + 1

                ent_id = str(ent.get("id", "")).strip()
                base_id = ent_id.split("@", 1)[0].strip() if ent_id else ""
                handle_raw = str(ent.get("handle", "")).strip()
                if not handle_raw:
                    handle_raw = base_id
                base_norm = _normalize_entity_instance_key(base_id)
                handle_norm = _normalize_entity_instance_key(handle_raw)
                candidate_keys = [
                    _normalize_entity_instance_key(ent_id),
                    base_norm,
                    handle_norm,
                ]

                resolved_key: Optional[str] = None
                resolved: Optional[List[Dict[str, object]]] = None
                for key in candidate_keys:
                    if not key:
                        continue
                    hit = text_primitives.get(key)
                    if isinstance(hit, list) and hit:
                        resolved_key = key
                        resolved = hit
                        break

                if not resolved:
                    looks_mismatch = False
                    if base_norm and base_norm.split("@", 1)[0] in vector_base_handles:
                        looks_mismatch = True
                    elif handle_norm and handle_norm.split("@", 1)[0] in vector_base_handles:
                        looks_mismatch = True

                    if looks_mismatch:
                        debug["key_mismatch_count"] = int(debug.get("key_mismatch_count", 0)) + 1
                        if enable_debug:
                            samples = debug.get("key_mismatch_samples")
                            if isinstance(samples, list) and len(samples) < 10:
                                samples.append(
                                    {
                                        "entity_id": ent_id,
                                        "handle": handle_raw,
                                        "instance_path": ent.get("instance_path"),
                                        "candidate_keys": [k for k in candidate_keys if k],
                                    }
                                )
                    else:
                        debug["no_vectorize_payload_count"] = int(debug.get("no_vectorize_payload_count", 0)) + 1

                    if enable_debug:
                        unmatched = debug.get("unmatched_key_samples")
                        first_key = next((k for k in candidate_keys if k), ent_id or handle_raw)
                        if isinstance(unmatched, list) and first_key and len(unmatched) < 20:
                            unmatched.append(first_key)
                    continue

                if resolved_key:
                    matched_vector_keys.add(resolved_key)
                font_kind = str(geom.get("font_kind", "")).strip().lower()
                shape_file_text = any(bool(p.get("shape_file_text")) for p in resolved if isinstance(p, dict))
                if shape_file_text:
                    debug["shape_file_text_true_count"] = int(debug.get("shape_file_text_true_count", 0)) + 1
                if font_kind != "shx" and not shape_file_text:
                    debug["filtered_by_font_kind_count"] = int(debug.get("filtered_by_font_kind_count", 0)) + 1
                    debug["filtered_non_shx_count"] = int(debug.get("filtered_non_shx_count", 0)) + 1
                    continue

                clean_resolved = [p for p in resolved if isinstance(p, dict)]
                if len(clean_resolved) == 0:
                    debug["empty_after_optimize_count"] = int(debug.get("empty_after_optimize_count", 0)) + 1
                    continue

                geom_out = dict(geom)
                geom_out["oda_outline_primitives"] = clean_resolved
                geom_out["shx_outline_mode"] = "oda_vectorize"
                if shape_file_text and font_kind != "shx":
                    geom_out["font_kind"] = "shx"
                ent["geom"] = geom_out
                attached += 1
                debug["matched_entity_count"] = int(debug.get("matched_entity_count", 0)) + 1

        attach_candidates = int(debug.get("attach_candidate_entity_count", 0))
        matched_count = int(debug.get("matched_entity_count", 0))
        debug["unmatched_entity_count"] = max(0, attach_candidates - matched_count)
        if enable_debug:
            orphan = [k for k in sorted(vector_keys) if k not in matched_vector_keys]
            debug["orphan_vectorize_key_samples"] = orphan[:20]
        return attached, debug
