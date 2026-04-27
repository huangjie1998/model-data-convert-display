from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple


Affine2D = Tuple[float, float, float, float, float, float]
Point = Dict[str, float]
Primitive = Dict[str, object]


@dataclass(frozen=True)
class DimensionBlockPrimitiveContext:
    block_entities: Dict[str, List[Dict[str, object]]]
    block_origin_by_name: Dict[str, Point]
    layer_styles: Dict[str, Dict[str, object]]
    resolve_block_table_name: Callable[[object], Optional[str]]
    resolve_effective_style: Callable[..., Dict[str, object]]
    insert_transform_from_entity: Callable[[Dict[str, object]], Affine2D]
    transform_entity: Callable[[Dict[str, object], Affine2D], Optional[Dict[str, object]]]
    entity_primitives: Callable[[Dict[str, object]], List[Primitive]]
    compose_affine: Callable[[Affine2D, Affine2D], Affine2D]
    point_distance: Callable[[Point, Point], float]
    parse_aci_from_color_name: Callable[[object], Optional[int]]
    resolve_rgb_color_decimal: Callable[[object], Optional[str]]
    lineweight_to_mm: Callable[[object], Optional[float]]


def collect_dimension_block_primitives(
    *,
    block_name: str,
    base_tf: Affine2D,
    parent_effective_color_index: Optional[int],
    parent_effective_color_rgb: Optional[str],
    parent_effective_lineweight_mm: Optional[float],
    stack: Tuple[str, ...],
    context: DimensionBlockPrimitiveContext,
) -> List[Primitive]:
    source_entities = context.block_entities.get(block_name, [])
    out: List[Dict[str, object]] = []

    def _clean_primitive_points(raw_points: object) -> List[Dict[str, float]]:
        if not isinstance(raw_points, list):
            return []
        return [p for p in raw_points if isinstance(p, dict)]

    def _polyline_width_value(primitive: Dict[str, object]) -> Optional[float]:
        values: List[float] = []
        for key in ("global_width", "start_width", "end_width"):
            raw_value = primitive.get(key)
            if isinstance(raw_value, (int, float)) and math.isfinite(float(raw_value)) and float(raw_value) > 0:
                values.append(float(raw_value))
        if not values:
            return None
        return max(values)

    def _segment_width_polygon(
        start: Dict[str, float],
        end: Dict[str, float],
        width: float,
    ) -> Optional[List[Dict[str, float]]]:
        sx = float(start.get("x", 0.0))
        sy = float(start.get("y", 0.0))
        ex = float(end.get("x", 0.0))
        ey = float(end.get("y", 0.0))
        dx = ex - sx
        dy = ey - sy
        seg_len = math.hypot(dx, dy)
        if seg_len <= 1e-9 or width <= 0:
            return None
        half_width = width * 0.5
        nx = -dy / seg_len * half_width
        ny = dx / seg_len * half_width
        z = float(start.get("z", end.get("z", 0.0)))
        return [
            {"x": sx + nx, "y": sy + ny, "z": z},
            {"x": ex + nx, "y": ey + ny, "z": float(end.get("z", z))},
            {"x": ex - nx, "y": ey - ny, "z": float(end.get("z", z))},
            {"x": sx - nx, "y": sy - ny, "z": z},
            {"x": sx + nx, "y": sy + ny, "z": z},
        ]

    def _polygon_area(points: List[Dict[str, float]]) -> float:
        if len(points) < 3:
            return 0.0
        area = 0.0
        for idx, point in enumerate(points):
            next_point = points[(idx + 1) % len(points)]
            area += float(point.get("x", 0.0)) * float(next_point.get("y", 0.0))
            area -= float(next_point.get("x", 0.0)) * float(point.get("y", 0.0))
        return abs(area) * 0.5

    def _clone_primitive_style(
        primitive: Dict[str, object],
        *,
        subtype: str,
        conversion: str,
    ) -> Dict[str, object]:
        converted: Dict[str, object] = {
            "kind": "polygon",
            "filled": True,
            "pattern_name": "SOLID",
            "subtype": subtype,
            "dimension_block_conversion": conversion,
        }
        for meta_key in ("resolved", "provenance", "style_ref", "annotation_context", "color", "color_index"):
            value = primitive.get(meta_key)
            if isinstance(value, dict):
                converted[meta_key] = dict(value)
            elif value is not None:
                converted[meta_key] = value
        return converted

    def _dimension_block_polyline_fill_primitives(primitive: Dict[str, object]) -> List[Dict[str, object]]:
        if str(primitive.get("kind") or "").strip().lower() != "polyline":
            return []
        points = _clean_primitive_points(primitive.get("points"))
        if len(points) < 2:
            return []
        converted: List[Dict[str, object]] = []

        width = _polyline_width_value(primitive)
        if isinstance(width, float) and width > 0:
            segment_count = len(points) - 1
            if bool(primitive.get("closed", False)) and context.point_distance(points[0], points[-1]) > 1e-6:
                segment_count = len(points)
            for idx in range(segment_count):
                seg_start = points[idx]
                seg_end = points[(idx + 1) % len(points)]
                ring = _segment_width_polygon(seg_start, seg_end, width)
                if not ring:
                    continue
                wide_polygon = _clone_primitive_style(
                    primitive,
                    subtype="dimension_block_wide_polyline_fill",
                    conversion="wide_polyline",
                )
                wide_polygon["rings"] = [ring]
                wide_polygon["polyline_width"] = width
                converted.append(wide_polygon)

        if bool(primitive.get("closed", False)) and len(points) >= 3:
            shell = list(points)
            if context.point_distance(shell[0], shell[-1]) <= 1e-6:
                shell = shell[:-1]
            if len(shell) >= 3 and _polygon_area(shell) > 1e-10:
                ring = list(shell)
                ring.append(dict(shell[0]))
                closed_polygon = _clone_primitive_style(
                    primitive,
                    subtype="dimension_block_closed_polyline_fill",
                    conversion="closed_polyline",
                )
                closed_polygon["rings"] = [ring]
                converted.append(closed_polygon)

        return converted

    for raw_ent in source_entities:
        etype = str(raw_ent.get("type", "")).upper()
        raw_layer = str(raw_ent.get("layer", "0"))
        if raw_layer.strip().lower() == "defpoints" or etype == "POINT":
            continue

        raw_style = raw_ent.get("style", {})
        style_obj = raw_style if isinstance(raw_style, dict) else {"lineweight": "default"}
        effective_style = context.resolve_effective_style(
            style_obj=style_obj,
            layer_name=raw_layer,
            layer_styles=context.layer_styles,
            parent_effective_color_index=parent_effective_color_index,
            parent_effective_color_rgb=parent_effective_color_rgb,
            parent_effective_lineweight_mm=parent_effective_lineweight_mm,
        )
        next_parent_color_idx = effective_style.get("effective_color_index")
        if not isinstance(next_parent_color_idx, int):
            next_parent_color_idx = None
        next_parent_color_rgb = str(effective_style.get("effective_color_rgb") or "").strip() or None
        next_parent_lineweight_mm = effective_style.get("effective_lineweight_mm")
        if not isinstance(next_parent_lineweight_mm, (int, float)) or not math.isfinite(float(next_parent_lineweight_mm)):
            next_parent_lineweight_mm = None
        elif float(next_parent_lineweight_mm) <= 0:
            next_parent_lineweight_mm = None
        else:
            next_parent_lineweight_mm = float(next_parent_lineweight_mm)

        if etype == "INSERT":
            geom = raw_ent.get("geom", {}) if isinstance(raw_ent.get("geom"), dict) else {}
            child_name_raw = str(geom.get("block_name", "")).strip()
            child_name = context.resolve_block_table_name(child_name_raw) or child_name_raw
            if not child_name or child_name in stack or child_name not in context.block_entities:
                continue
            insert_tf = context.insert_transform_from_entity(raw_ent)
            child_origin = context.block_origin_by_name.get(child_name, {"x": 0.0, "y": 0.0, "z": 0.0})
            child_origin_tf: Affine2D = (
                1.0,
                0.0,
                0.0,
                1.0,
                -float(child_origin.get("x", 0.0)),
                -float(child_origin.get("y", 0.0)),
            )
            child_tf = context.compose_affine(base_tf, context.compose_affine(insert_tf, child_origin_tf))
            out.extend(
                collect_dimension_block_primitives(
                    block_name=child_name,
                    base_tf=child_tf,
                    parent_effective_color_index=next_parent_color_idx,
                    parent_effective_color_rgb=next_parent_color_rgb,
                    parent_effective_lineweight_mm=next_parent_lineweight_mm,
                    stack=stack + (child_name,),
                    context=context,
                )
            )
            continue

        transformed = context.transform_entity(raw_ent, base_tf)
        if transformed is None:
            continue
        transformed["style"] = effective_style
        primitives = context.entity_primitives(transformed)
        effective_color_idx = effective_style.get("effective_color_index")
        if not isinstance(effective_color_idx, (int, float)) or not math.isfinite(float(effective_color_idx)):
            effective_color_idx = context.parse_aci_from_color_name(effective_style.get("color"))
        effective_color_rgb = context.resolve_rgb_color_decimal(
            effective_style.get("effective_color_rgb")
            or effective_style.get("effective_color")
            or effective_style.get("color")
            or effective_style.get("effective_color_index")
            or effective_style.get("color_index")
        )
        effective_lineweight_mm = effective_style.get("effective_lineweight_mm")
        if not isinstance(effective_lineweight_mm, (int, float)) or not math.isfinite(float(effective_lineweight_mm)):
            effective_lineweight_mm = context.lineweight_to_mm(effective_style.get("lineweight"))
        effective_linetype = str(effective_style.get("linetype") or "ByLayer")

        for prim in primitives:
            if isinstance(prim, dict):
                prim_out = dict(prim)
                resolved = prim_out.get("resolved")
                resolved_out: Dict[str, object] = dict(resolved) if isinstance(resolved, dict) else {}
                if resolved_out.get("color_index") is None and isinstance(effective_color_idx, (int, float)) and math.isfinite(float(effective_color_idx)):
                    resolved_out["color_index"] = int(effective_color_idx)
                if resolved_out.get("color_rgb") is None and effective_color_rgb:
                    resolved_out["color_rgb"] = effective_color_rgb
                if (
                    resolved_out.get("lineweight_mm") is None
                    and isinstance(effective_lineweight_mm, (int, float))
                    and math.isfinite(float(effective_lineweight_mm))
                ):
                    resolved_out["lineweight_mm"] = float(effective_lineweight_mm)
                if resolved_out.get("linetype") is None and effective_linetype:
                    resolved_out["linetype"] = effective_linetype
                if resolved_out:
                    prim_out["resolved"] = resolved_out

                prov = prim_out.get("provenance")
                prov_out: Dict[str, object] = dict(prov) if isinstance(prov, dict) else {}
                prov_out.setdefault("color_index", "dimension_block.entity_style")
                prov_out.setdefault("lineweight_mm", "dimension_block.entity_style")
                prov_out.setdefault("linetype", "dimension_block.entity_style")
                if prov_out:
                    prim_out["provenance"] = prov_out

                prim_style_ref = prim_out.get("style_ref")
                prim_style_ref_out: Dict[str, object] = (
                    dict(prim_style_ref) if isinstance(prim_style_ref, dict) else {}
                )
                prim_style_ref_out.setdefault("layer", raw_layer)
                prim_style_ref_out.setdefault("linetype", effective_linetype)
                if prim_style_ref_out:
                    prim_out["style_ref"] = prim_style_ref_out

                out.append(prim_out)
                out.extend(_dimension_block_polyline_fill_primitives(prim_out))
    return out

