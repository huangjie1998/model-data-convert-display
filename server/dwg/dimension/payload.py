from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple


Point = Dict[str, float]
Primitive = Dict[str, object]
Geom = Dict[str, object]


@dataclass(frozen=True)
class DimensionPayloadContext:
    resolve_dimension_display_text: Callable[[Geom], str]
    resolve_rgb_color_decimal: Callable[[object], Optional[str]]
    parse_aci_from_color_name: Callable[[object], Optional[int]]
    point_distance: Callable[[Point, Point], float]
    distance_to_segment: Callable[[Point, Point, Point], Tuple[float, Point, float]]


def build_dimension_payload(
    geom: Geom,
    primitives: List[Primitive],
    context: DimensionPayloadContext,
) -> Dict[str, object]:
    text = context.resolve_dimension_display_text(geom)
    dim_style_vars_raw = geom.get("dim_style_vars")
    dim_style_vars: Dict[str, object] = dict(dim_style_vars_raw) if isinstance(dim_style_vars_raw, dict) else {}

    dim_style_sources_raw = geom.get("dim_style_sources")
    dim_style_sources: Dict[str, Dict[str, object]] = {
        "defaults": {},
        "style": {},
        "entity_overrides": {},
    }
    if isinstance(dim_style_sources_raw, dict):
        defaults_raw = dim_style_sources_raw.get("defaults")
        style_raw = dim_style_sources_raw.get("style")
        overrides_raw = dim_style_sources_raw.get("entity_overrides")
        if isinstance(defaults_raw, dict):
            dim_style_sources["defaults"] = dict(defaults_raw)
        if isinstance(style_raw, dict):
            dim_style_sources["style"] = dict(style_raw)
        if isinstance(overrides_raw, dict):
            dim_style_sources["entity_overrides"] = dict(overrides_raw)

    dim_value_source_map_raw = geom.get("dim_value_source_map")
    dim_value_source_map: Dict[str, object] = dict(dim_value_source_map_raw) if isinstance(dim_value_source_map_raw, dict) else {}

    def _normalize_rgb_decimal(raw: object) -> Optional[str]:
        if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
            n = int(raw)
            if 0 <= n <= 0xFFFFFF:
                return str(n)
            return None
        s = str(raw or "").strip()
        if not s:
            return None
        if s.startswith("#"):
            try:
                return str(max(0, min(0xFFFFFF, int(s[1:], 16))))
            except Exception:
                return None
        if s.lower().startswith("0x"):
            try:
                return str(max(0, min(0xFFFFFF, int(s[2:], 16))))
            except Exception:
                return None
        if re.fullmatch(r"\d+", s):
            try:
                n = int(s)
                if 0 <= n <= 0xFFFFFF:
                    return str(n)
            except Exception:
                return None
        return None

    def _resolve_explicit_color(raw: object) -> Optional[str]:
        if isinstance(raw, str):
            token = raw.strip().lower()
            if token in ("", "bylayer", "byblock", "foreground", "default", "null", "none"):
                return None
        if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
            n = int(raw)
            if n in (0, 256):
                return None
        return context.resolve_rgb_color_decimal(raw)

    def _normalize_color_mode(raw: object) -> str:
        if raw is None:
            return "unset"
        token = str(raw).strip().lower()
        if not token or token in ("null", "none"):
            return "unset"
        if token == "bylayer":
            return "bylayer"
        if token == "byblock":
            return "byblock"
        if token == "foreground":
            return "foreground"
        if token == "default":
            return "default"

        aci = context.parse_aci_from_color_name(raw)
        if aci is not None:
            if aci == 0:
                return "byblock"
            if aci == 256:
                return "bylayer"
            return "aci"

        if _normalize_rgb_decimal(raw):
            return "rgb"
        return "literal"

    def _normalize_raw_color_value(raw: object) -> Optional[object]:
        if raw is None:
            return None
        if isinstance(raw, str):
            token = raw.strip()
            return token or None
        if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
            return int(raw)
        return raw

    def _parse_explicit_aci(raw: object) -> Optional[int]:
        aci = context.parse_aci_from_color_name(raw)
        if aci is None:
            return None
        if aci in (0, 256):
            return None
        return int(aci)

    def _primitive_color_info(primitive: Dict[str, object]) -> Optional[Dict[str, object]]:
        color_rgb: Optional[str] = None
        color_aci: Optional[int] = None
        resolved = primitive.get("resolved")
        if isinstance(resolved, dict):
            color_rgb = _normalize_rgb_decimal(resolved.get("color_rgb"))
            if color_rgb:
                pass
            color_idx_raw = resolved.get("color_index")
            if isinstance(color_idx_raw, (int, float)) and math.isfinite(float(color_idx_raw)):
                color_aci = int(color_idx_raw)
            if color_aci is None:
                color_aci = context.parse_aci_from_color_name(color_idx_raw)
            if not color_rgb:
                color_idx_rgb = _resolve_explicit_color(color_idx_raw)
                if color_idx_rgb:
                    color_rgb = color_idx_rgb
        if not color_rgb:
            color_rgb = _resolve_explicit_color(primitive.get("color"))
        if color_aci is None:
            color_aci = context.parse_aci_from_color_name(primitive.get("color"))
        if color_aci in (0, 256):
            color_aci = None
        if not color_rgb and color_aci is not None:
            color_rgb = context.resolve_rgb_color_decimal(color_aci)
        if not color_rgb:
            return None
        return {
            "color_rgb": color_rgb,
            "color_aci": color_aci,
        }

    def _line_endpoints_from_primitive(primitive: Dict[str, object]) -> Optional[Tuple[Dict[str, float], Dict[str, float]]]:
        kind = str(primitive.get("kind") or "").strip().lower()
        if kind == "line":
            start = primitive.get("start")
            end = primitive.get("end")
            if isinstance(start, dict) and isinstance(end, dict):
                return start, end
            return None
        if kind == "polyline":
            points = primitive.get("points")
            if isinstance(points, list):
                clean = [p for p in points if isinstance(p, dict)]
                if len(clean) >= 2:
                    return clean[0], clean[-1]
        return None

    def _endpoint_match_score(
        p1: Dict[str, float],
        p2: Dict[str, float],
        q1: Dict[str, float],
        q2: Dict[str, float],
    ) -> float:
        direct = context.point_distance(p1, q1) + context.point_distance(p2, q2)
        reverse = context.point_distance(p1, q2) + context.point_distance(p2, q1)
        return min(direct, reverse)

    line_candidates: List[Dict[str, object]] = []
    for primitive in primitives:
        if not isinstance(primitive, dict):
            continue
        endpoints = _line_endpoints_from_primitive(primitive)
        if not endpoints:
            continue
        color_info = _primitive_color_info(primitive)
        if not color_info:
            continue
        color_rgb = str(color_info.get("color_rgb") or "").strip()
        if not color_rgb:
            continue
        line_candidates.append(
            {
                "start": endpoints[0],
                "end": endpoints[1],
                "color_rgb": color_rgb,
                "color_aci": color_info.get("color_aci"),
            }
        )

    ext1 = geom.get("ext1")
    ext2 = geom.get("ext2")
    line_start = geom.get("line_start")
    line_end = geom.get("line_end")

    used_indices: set[int] = set()
    ext_colors: List[Dict[str, object]] = []
    for ext_pt, line_pt in ((ext1, line_start), (ext2, line_end)):
        if not isinstance(ext_pt, dict) or not isinstance(line_pt, dict):
            continue
        pair_len = context.point_distance(ext_pt, line_pt)
        tol = max(1e-6, pair_len * 0.9)
        best_idx = -1
        best_score = float("inf")
        for idx, cand in enumerate(line_candidates):
            if idx in used_indices:
                continue
            cand_start = cand.get("start")
            cand_end = cand.get("end")
            if not isinstance(cand_start, dict) or not isinstance(cand_end, dict):
                continue
            score = _endpoint_match_score(ext_pt, line_pt, cand_start, cand_end)
            if score < best_score:
                best_score = score
                best_idx = idx
        if best_idx >= 0 and best_score <= tol:
            used_indices.add(best_idx)
            chosen = line_candidates[best_idx]
            chosen_color = chosen.get("color_rgb")
            if isinstance(chosen_color, str) and chosen_color.strip():
                ext_colors.append(
                    {
                        "color_rgb": chosen_color.strip(),
                        "color_aci": chosen.get("color_aci"),
                    }
                )

    dim_line_color_from_primitives: Optional[Dict[str, object]] = None
    if isinstance(line_start, dict) and isinstance(line_end, dict):
        line_len = context.point_distance(line_start, line_end)
        tol = max(1e-6, line_len * 0.5)
        best_idx = -1
        best_score = float("inf")
        for idx, cand in enumerate(line_candidates):
            if idx in used_indices:
                continue
            cand_start = cand.get("start")
            cand_end = cand.get("end")
            if not isinstance(cand_start, dict) or not isinstance(cand_end, dict):
                continue
            d1, _, _ = context.distance_to_segment(cand_start, line_start, line_end)
            d2, _, _ = context.distance_to_segment(cand_end, line_start, line_end)
            score = d1 + d2
            if score < best_score:
                best_score = score
                best_idx = idx
        if best_idx >= 0 and best_score <= tol * 2.0:
            chosen = line_candidates[best_idx]
            chosen_color = chosen.get("color_rgb")
            if isinstance(chosen_color, str) and chosen_color.strip():
                dim_line_color_from_primitives = {
                    "color_rgb": chosen_color.strip(),
                    "color_aci": chosen.get("color_aci"),
                }

    if dim_line_color_from_primitives is None:
        for idx, cand in enumerate(line_candidates):
            if idx in used_indices:
                continue
            fallback_color = cand.get("color_rgb")
            if isinstance(fallback_color, str) and fallback_color.strip():
                dim_line_color_from_primitives = {
                    "color_rgb": fallback_color.strip(),
                    "color_aci": cand.get("color_aci"),
                }
                break
    if dim_line_color_from_primitives is None and line_candidates:
        first_candidate = line_candidates[0]
        fallback_color = first_candidate.get("color_rgb")
        if isinstance(fallback_color, str) and fallback_color.strip():
            dim_line_color_from_primitives = {
                "color_rgb": fallback_color.strip(),
                "color_aci": first_candidate.get("color_aci"),
            }

    ext_line_color_from_primitives: Optional[Dict[str, object]] = ext_colors[0] if ext_colors else None

    dim_line_color_raw = dim_style_vars.get("dimclrd")
    dim_ext_line_color_raw = dim_style_vars.get("dimclre")
    dim_line_color_mode = _normalize_color_mode(dim_line_color_raw)
    dim_ext_line_color_mode = _normalize_color_mode(dim_ext_line_color_raw)
    dim_line_color_raw_value = _normalize_raw_color_value(dim_line_color_raw)
    dim_ext_line_color_raw_value = _normalize_raw_color_value(dim_ext_line_color_raw)

    dim_line_color_effective_rgb = _resolve_explicit_color(dim_line_color_raw)
    dim_ext_line_color_effective_rgb = _resolve_explicit_color(dim_ext_line_color_raw)
    dim_line_color_effective_aci = _parse_explicit_aci(dim_line_color_raw)
    dim_ext_line_color_effective_aci = _parse_explicit_aci(dim_ext_line_color_raw)
    dim_line_color_effective_source: Optional[str] = "dim_style" if dim_line_color_effective_rgb else None
    dim_ext_line_color_effective_source: Optional[str] = "dim_style" if dim_ext_line_color_effective_rgb else None

    if not dim_line_color_effective_rgb and isinstance(dim_line_color_from_primitives, dict):
        primitive_rgb = str(dim_line_color_from_primitives.get("color_rgb") or "").strip()
        if primitive_rgb:
            dim_line_color_effective_rgb = primitive_rgb
            primitive_aci = dim_line_color_from_primitives.get("color_aci")
            if isinstance(primitive_aci, (int, float)) and math.isfinite(float(primitive_aci)):
                dim_line_color_effective_aci = int(primitive_aci)
            dim_line_color_effective_source = "dimension_block_primitives"

    if not dim_ext_line_color_effective_rgb and isinstance(ext_line_color_from_primitives, dict):
        primitive_rgb = str(ext_line_color_from_primitives.get("color_rgb") or "").strip()
        if primitive_rgb:
            dim_ext_line_color_effective_rgb = primitive_rgb
            primitive_aci = ext_line_color_from_primitives.get("color_aci")
            if isinstance(primitive_aci, (int, float)) and math.isfinite(float(primitive_aci)):
                dim_ext_line_color_effective_aci = int(primitive_aci)
            dim_ext_line_color_effective_source = "dimension_block_primitives"

    payload: Dict[str, object] = {
        "dim_kind": str(geom.get("dim_kind", "dimension")).strip().lower() or "dimension",
        "measurement": geom.get("measurement"),
        "formatted_measurement": geom.get("formatted_measurement"),
        "display_text": text or None,
        "text_position": geom.get("text_position"),
        "text_height": geom.get("text_height"),
        "text_color": geom.get("text_color"),
        "text_mask": geom.get("text_mask"),
        "text_mask_padding": geom.get("text_mask_padding"),
        "text_mask_color": geom.get("text_mask_color"),
        "text_mask_use_canvas_bg": bool(geom.get("text_mask_use_canvas_bg", False)),
        "rotation": geom.get("rotation"),
        "style_name": geom.get("style_name") or geom.get("text_style"),
        "dimension_style": geom.get("dimension_style"),
        "arrow_block": geom.get("arrow_block"),
        "arrow_block1": geom.get("arrow_block1"),
        "arrow_block2": geom.get("arrow_block2"),
        "arrow_size": geom.get("arrow_size"),
        "primitive_source": geom.get("primitive_source") or "entity_geom",
        "dimension_block_name": geom.get("dimension_block_name"),
        "dimension_block_name_resolved": geom.get("dimension_block_name_resolved"),
        "dimension_block_status": geom.get("dimension_block_status"),
        "dimension_block_failure_reason": geom.get("dimension_block_failure_reason"),
        "dimension_block_primitive_count": geom.get("dimension_block_primitive_count"),
        "dimension_block_repair": geom.get("dimension_block_repair"),
        "dim_style_vars": dim_style_vars,
        "dim_style_sources": dim_style_sources,
        "dim_value_source_map": dim_value_source_map,
        "dim_line_color_raw": dim_line_color_raw,
        "dim_ext_line_color_raw": dim_ext_line_color_raw,
        "dim_line_color_mode": dim_line_color_mode,
        "dim_ext_line_color_mode": dim_ext_line_color_mode,
        "dim_line_color_value_raw": dim_line_color_raw_value,
        "dim_ext_line_color_value_raw": dim_ext_line_color_raw_value,
        "dim_line_color_effective_rgb": dim_line_color_effective_rgb,
        "dim_ext_line_color_effective_rgb": dim_ext_line_color_effective_rgb,
        "dim_line_color_effective_aci": dim_line_color_effective_aci,
        "dim_ext_line_color_effective_aci": dim_ext_line_color_effective_aci,
        "dim_line_color_effective_source": dim_line_color_effective_source,
        "dim_ext_line_color_effective_source": dim_ext_line_color_effective_source,
        "effective_dim_line_color": dim_line_color_effective_rgb,
        "effective_ext_line_color": dim_ext_line_color_effective_rgb,
        "anchors": {
            "ext1": geom.get("ext1"),
            "ext2": geom.get("ext2"),
            "line_start": geom.get("line_start"),
            "line_end": geom.get("line_end"),
            "dim_line_point": geom.get("dim_line_point"),
            "center": geom.get("center"),
            "arc_point": geom.get("arc_point"),
            "chord_point": geom.get("chord_point"),
            "far_chord_point": geom.get("far_chord_point"),
            "leader_end_point": geom.get("leader_end_point"),
        },
    }
    payload["primitive_count"] = len(primitives)
    payload["renderable"] = len(primitives) > 0
    return payload

