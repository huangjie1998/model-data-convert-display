from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from server.dwg.oda.entities import NOT_HANDLED, build_non_dimension_entity
from server.dwg.oda.entities.dimension_parser import build_dimension_entity


Point = Dict[str, float]
Entity = Dict[str, object]


@dataclass(frozen=True)
class OdaEntityBuildContext:
    bbox_from_points: Callable[[List[Point]], Optional[Dict[str, Point]]]
    build_hatch_loop_points_from_edges: Callable[[Dict[str, object]], List[Point]]
    clean_oda_text_value: Callable[[object], str]
    dimension_line_endpoints: Callable[[Point, Point, Point], Tuple[Point, Point]]
    dimension_subtype_from_kind: Callable[[object], str]
    line_intersection_2d: Callable[[Point, Point, Point, Point], Optional[Point]]
    line_segment_from_bbox: Callable[..., Optional[Tuple[Point, Point]]]
    line_segment_from_bbox_and_origin: Callable[..., Optional[Tuple[Point, Point]]]
    lineweight_to_mm: Callable[[object], Optional[float]]
    normalize_dim_var_label: Callable[[object], Optional[str]]
    normalize_dim_var_map: Callable[[object], Dict[str, object]]
    normalize_dimblk_name: Callable[[object], Optional[str]]
    parse_dim_var_value: Callable[[str, object], Optional[object]]
    parse_float_value: Callable[[str], Optional[float]]
    parse_int_value: Callable[[object], Optional[int]]
    parse_label_value: Callable[[str], Tuple[Optional[str], Optional[str]]]
    parse_point_value: Callable[[str], Optional[Point]]
    point_distance: Callable[[Point, Point], float]
    point_on_ray: Callable[[Point, Point, float], Point]
    resolve_dimension_text_color: Callable[..., Optional[str]]
    resolve_dimension_text_mask_color: Callable[..., Optional[str]]
    resolve_dimension_text_mask_mode: Callable[..., int]
    resolve_rgb_color_decimal: Callable[[object], Optional[str]]


def build_entity_from_oda_lines(
    *,
    etype: str,
    handle: str,
    lines: List[str],
    space_id: str,
    dim_styles: Optional[Dict[str, Dict[str, object]]] = None,
    header_dim_defaults: Optional[Dict[str, object]] = None,
    context: OdaEntityBuildContext,
) -> Optional[Entity]:
    is_block_reference = etype.lower() == "acdbblockreference"
    blockref_has_position = False
    layer = "0"
    min_pt: Optional[Dict[str, float]] = None
    max_pt: Optional[Dict[str, float]] = None
    origin_pt: Optional[Dict[str, float]] = None
    u_axis_pt: Optional[Dict[str, float]] = None
    center_pt: Optional[Dict[str, float]] = None
    start_pt: Optional[Dict[str, float]] = None
    end_pt: Optional[Dict[str, float]] = None
    radius: Optional[float] = None
    start_angle: Optional[float] = None
    end_angle: Optional[float] = None
    vertices: List[Dict[str, float]] = []
    vertex_segment_kinds: List[str] = []
    current_vertex_segment_kind: Optional[str] = None
    block_name: Optional[str] = None
    scale_factors: Optional[Dict[str, float]] = None
    rotation_deg: Optional[float] = None
    text_string: Optional[str] = None
    text_height: Optional[float] = None
    text_width: Optional[float] = None
    major_axis_vec: Optional[Dict[str, float]] = None
    minor_axis_vec: Optional[Dict[str, float]] = None
    major_radius: Optional[float] = None
    minor_radius: Optional[float] = None
    spline_points: List[Dict[str, float]] = []
    color_index: Optional[int] = None
    color_name: Optional[str] = None
    linetype_name: Optional[str] = None
    lineweight_name: Optional[str] = None
    text_style_name: Optional[str] = None
    width_factor: Optional[float] = None
    oblique_angle: Optional[float] = None
    horizontal_mode: Optional[str] = None
    vertical_mode: Optional[str] = None
    attachment_mode: Optional[str] = None
    actual_height: Optional[float] = None
    mirrored_x: Optional[bool] = None
    mirrored_y: Optional[bool] = None
    poly_start_width: Optional[float] = None
    poly_end_width: Optional[float] = None
    poly_global_width: Optional[float] = None
    poly_closed_flag: Optional[bool] = None
    poly_closed_seen = False
    named_points: Dict[str, Dict[str, float]] = {}

    hatch_pattern_name: Optional[str] = None
    hatch_solid_fill = False
    hatch_pattern_angle: Optional[float] = None
    hatch_pattern_scale: Optional[float] = None
    hatch_pattern_spacing: Optional[float] = None
    hatch_loops: List[Dict[str, object]] = []
    hatch_current_loop: Optional[Dict[str, object]] = None
    hatch_current_edge_start: Optional[Dict[str, float]] = None
    hatch_current_edge: Optional[Dict[str, object]] = None
    dimension_line_point: Optional[Dict[str, float]] = None
    ext_line1_point: Optional[Dict[str, float]] = None
    ext_line2_point: Optional[Dict[str, float]] = None
    dimension_measurement: Optional[float] = None
    formatted_measurement: Optional[str] = None
    dimension_style_name: Optional[str] = None
    dimension_arrow_block: Optional[str] = None
    dimension_arrow_block1: Optional[str] = None
    dimension_arrow_block2: Optional[str] = None
    dimension_arrow_size: Optional[float] = None
    dimension_text_color_raw: Optional[object] = None
    dimension_text_mask_mode: Optional[int] = None
    dimension_text_mask_color_raw: Optional[object] = None
    dimension_entity_vars: Dict[str, object] = {}
    dimension_block_name: Optional[str] = None
    dimension_block_position: Optional[Dict[str, float]] = None
    dimension_block_rotation: Optional[float] = None
    dimension_block_scale: Optional[Dict[str, float]] = None
    text_position_point: Optional[Dict[str, float]] = None
    text_rotation_deg: Optional[float] = None
    dim_arc_point: Optional[Dict[str, float]] = None
    dim_ext1_start: Optional[Dict[str, float]] = None
    dim_ext1_end: Optional[Dict[str, float]] = None
    dim_ext2_start: Optional[Dict[str, float]] = None
    dim_ext2_end: Optional[Dict[str, float]] = None
    dim_chord_point: Optional[Dict[str, float]] = None
    dim_far_chord_point: Optional[Dict[str, float]] = None
    dim_leader_end_point: Optional[Dict[str, float]] = None
    leader_has_arrowhead = False
    leader_splined = False
    leader_arrow_block: Optional[str] = None
    leader_arrow_size: Optional[float] = None
    mtext_background_fill_on: Optional[bool] = None
    mtext_background_fill_color_raw: Optional[object] = None
    mtext_background_scale_factor: Optional[float] = None
    in_dimension_block_section = False

    expect_vertex_point = False

    for raw in lines:
        stripped = raw.strip()
        if etype.lower() == "acdbblockreference" and stripped.startswith("<AcDb") and not stripped.startswith("<AcDbBlockReference"):
            # Stop at nested entities (e.g. AcDbAttribute) to avoid picking child fields as INSERT transform.
            break
        if stripped.lower().startswith("vertex "):
            inline_label, inline_value = context.parse_label_value(raw)
            if inline_label and inline_value is not None:
                inline_pt = context.parse_point_value(inline_value)
                if inline_pt is not None:
                    vertices.append(inline_pt)
                    vertex_segment_kinds.append((current_vertex_segment_kind or "").strip())
                    expect_vertex_point = False
                    current_vertex_segment_kind = None
                    continue
            expect_vertex_point = True
            current_vertex_segment_kind = None
            continue

        label, value = context.parse_label_value(raw)
        if not label or value is None:
            continue

        if "dimension" in etype.lower():
            dim_key = context.normalize_dim_var_label(label)
            if dim_key:
                dim_value = context.parse_dim_var_value(dim_key, value)
                if dim_value is not None:
                    dimension_entity_vars[dim_key] = dim_value

        if label == "acad_xdictionary":
            # Ignore associative/xdictionary internals; those sections contain
            # Osnap reference points that can pollute dimension geometry.
            break

        if in_dimension_block_section:
            if label == "position":
                parsed_dim_block_pos = context.parse_point_value(value)
                if parsed_dim_block_pos is not None:
                    dimension_block_position = parsed_dim_block_pos
                continue
            if label == "rotation":
                dimension_block_rotation = context.parse_float_value(value)
                continue
            if label in ("scale", "scale factors"):
                parsed_dim_block_scale = context.parse_point_value(value)
                if parsed_dim_block_scale is not None:
                    dimension_block_scale = parsed_dim_block_scale
                continue
            in_dimension_block_section = False

        if expect_vertex_point and label == "point":
            pt = context.parse_point_value(value)
            if pt is not None:
                vertices.append(pt)
                vertex_segment_kinds.append((current_vertex_segment_kind or "").strip())
                expect_vertex_point = False
                current_vertex_segment_kind = None
            continue
        if expect_vertex_point and label == "segment type":
            current_vertex_segment_kind = value
            continue

        if label == "layer":
            layer = value
            continue
        if label == "dimension line point":
            dimension_line_point = context.parse_point_value(value)
            continue
        if label == "extension line 1 point":
            ext_line1_point = context.parse_point_value(value)
            continue
        if label == "extension line 2 point":
            ext_line2_point = context.parse_point_value(value)
            continue
        if label in ("xline1 point", "x line 1 point"):
            ext_line1_point = context.parse_point_value(value)
            continue
        if label in ("xline2 point", "x line 2 point"):
            ext_line2_point = context.parse_point_value(value)
            continue
        if label == "arc point":
            dim_arc_point = context.parse_point_value(value)
            continue
        if label == "extension line 1 start":
            dim_ext1_start = context.parse_point_value(value)
            continue
        if label == "extension line 1 end":
            dim_ext1_end = context.parse_point_value(value)
            continue
        if label == "extension line 2 start":
            dim_ext2_start = context.parse_point_value(value)
            continue
        if label == "extension line 2 end":
            dim_ext2_end = context.parse_point_value(value)
            continue
        if label == "chord point":
            dim_chord_point = context.parse_point_value(value)
            continue
        if label in ("far chord point", "farchord point"):
            dim_far_chord_point = context.parse_point_value(value)
            continue
        if label in ("leader end point", "leader point", "leader length point"):
            dim_leader_end_point = context.parse_point_value(value)
            continue
        if label == "measurement":
            dimension_measurement = context.parse_float_value(value)
            continue
        if label == "formatted measurement":
            formatted_measurement = value
            continue
        if label == "text rotation":
            text_rotation_deg = context.parse_float_value(value)
            continue
        if label in ("dimension style", "dim style", "dimstyle"):
            dimension_style_name = value.strip() or None
            continue
        if label == "dimension block name":
            dimension_block_name = value.strip() or None
            in_dimension_block_section = True
            continue
        if label == "dimblk":
            dimension_arrow_block = context.normalize_dimblk_name(value)
            continue
        if label == "dimblk1":
            dimension_arrow_block1 = context.normalize_dimblk_name(value)
            continue
        if label == "dimblk2":
            dimension_arrow_block2 = context.normalize_dimblk_name(value)
            continue
        if label == "dimasz":
            dimension_arrow_size = context.parse_float_value(value)
            continue
        if label in ("dimclrt", "dimension text color"):
            dimension_text_color_raw = value
            continue
        if label == "background text color":
            dimension_text_mask_color_raw = value
            continue
        if label in ("backgroundtext flags", "background text flags"):
            parsed_bg_flags = context.parse_int_value(value)
            if parsed_bg_flags is not None:
                dimension_text_mask_mode = parsed_bg_flags
            continue
        if label == "dimtfill":
            dimension_text_mask_mode = context.parse_int_value(value)
            continue
        if label == "dimtfillclr":
            dimension_text_mask_color_raw = value
            continue
        if label == "text color" and ("dimension" in etype.lower()):
            dimension_text_color_raw = value
            continue
        if label in ("text fill", "text mask", "text background fill") and ("dimension" in etype.lower()):
            dimension_text_mask_mode = context.parse_int_value(value)
            continue
        if label in ("text fill color", "text mask color", "text background color") and ("dimension" in etype.lower()):
            dimension_text_mask_color_raw = value
            continue
        if label == "has arrowhead":
            leader_has_arrowhead = value.strip().lower() == "true"
            continue
        if label == "splined":
            leader_splined = value.strip().lower() == "true"
            continue
        if label in ("arrow symbol", "arrow block", "leader arrow block", "dimldrblk"):
            leader_arrow_block = context.normalize_dimblk_name(value)
            continue
        if label == "arrow size":
            leader_arrow_size = context.parse_float_value(value)
            continue
        if etype.lower() == "acdbhatch" and label.startswith("loop "):
            hatch_current_loop = {"kind": value, "points": [], "edges": [], "closed": True}
            hatch_loops.append(hatch_current_loop)
            hatch_current_edge_start = None
            hatch_current_edge = None
            continue
        if etype.lower() == "acdbhatch" and label.startswith("edge "):
            hatch_current_edge_start = None
            hatch_current_edge = {"kind": value}
            if isinstance(hatch_current_loop, dict):
                loop_edges = hatch_current_loop.get("edges")
                if not isinstance(loop_edges, list):
                    loop_edges = []
                    hatch_current_loop["edges"] = loop_edges
                loop_edges.append(hatch_current_edge)
            continue
        if etype.lower() == "acdbhatch" and label == "pattern name":
            hatch_pattern_name = value
            continue
        if etype.lower() == "acdbhatch" and label == "solid fill":
            hatch_solid_fill = value.strip().lower() == "true"
            continue
        if etype.lower() == "acdbhatch" and label == "pattern angle":
            hatch_pattern_angle = context.parse_float_value(value)
            continue
        if etype.lower() == "acdbhatch" and label == "pattern scale":
            hatch_pattern_scale = context.parse_float_value(value)
            continue
        if etype.lower() == "acdbhatch" and label in ("pattern space", "pattern spacing"):
            hatch_pattern_spacing = context.parse_float_value(value)
            continue
        if label == "min extents":
            min_pt = context.parse_point_value(value)
            continue
        if label == "max extents":
            max_pt = context.parse_point_value(value)
            continue
        if label == "origin":
            parsed_origin = context.parse_point_value(value)
            if parsed_origin is None:
                continue
            # AcDbBlockReference may contain an OCS "Origin" section after "Position".
            # Keep insertion point from "Position" when available.
            if is_block_reference and blockref_has_position:
                continue
            origin_pt = parsed_origin
            continue
        if label == "u-axis":
            u_axis_pt = context.parse_point_value(value)
            continue
        if label in ("center", "center point"):
            parsed_center = context.parse_point_value(value)
            if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                if isinstance(parsed_center, dict):
                    hatch_current_edge["center"] = parsed_center
                continue
            center_pt = parsed_center
            continue
        if label == "radius":
            parsed_radius = context.parse_float_value(value)
            if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                if isinstance(parsed_radius, float) and math.isfinite(parsed_radius):
                    hatch_current_edge["radius"] = float(parsed_radius)
                continue
            radius = parsed_radius
            continue
        if label == "closed":
            poly_closed_seen = True
            poly_closed_flag = value.strip().lower() in ("true", "1", "yes", "ktrue")
            continue
        if label in ("start width", "starting width"):
            w = context.parse_float_value(value)
            if isinstance(w, float) and math.isfinite(w) and w > 0:
                if poly_start_width is None or w > poly_start_width:
                    poly_start_width = float(w)
            continue
        if label in ("end width", "ending width"):
            w = context.parse_float_value(value)
            if isinstance(w, float) and math.isfinite(w) and w > 0:
                if poly_end_width is None or w > poly_end_width:
                    poly_end_width = float(w)
            continue
        if label in ("constant width", "global width"):
            w = context.parse_float_value(value)
            if isinstance(w, float) and math.isfinite(w) and w > 0:
                if poly_global_width is None or w > poly_global_width:
                    poly_global_width = float(w)
            continue
        if label == "width" and etype.lower() in ("acdbpolyline", "acdb2dpolyline", "acdb3dpolyline", "acdblwpolyline"):
            w = context.parse_float_value(value)
            if isinstance(w, float) and math.isfinite(w) and w > 0:
                if poly_global_width is None or w > poly_global_width:
                    poly_global_width = float(w)
            continue
        if label == "start point":
            if etype.lower() == "acdbhatch":
                hatch_current_edge_start = context.parse_point_value(value)
                if isinstance(hatch_current_edge, dict) and isinstance(hatch_current_edge_start, dict):
                    hatch_current_edge["start_point"] = hatch_current_edge_start
                continue
            start_pt = context.parse_point_value(value)
            continue
        if label == "end point":
            if etype.lower() == "acdbhatch":
                p_end = context.parse_point_value(value)
                if isinstance(hatch_current_edge, dict) and isinstance(p_end, dict):
                    hatch_current_edge["end_point"] = p_end
                if isinstance(hatch_current_loop, dict) and isinstance(p_end, dict):
                    loop_points = hatch_current_loop.get("points")
                    if not isinstance(loop_points, list):
                        loop_points = []
                        hatch_current_loop["points"] = loop_points
                    if isinstance(hatch_current_edge_start, dict):
                        if not loop_points:
                            loop_points.append(hatch_current_edge_start)
                        elif isinstance(loop_points[-1], dict) and context.point_distance(loop_points[-1], hatch_current_edge_start) > 1e-6:
                            loop_points.append(hatch_current_edge_start)
                    if not loop_points:
                        loop_points.append(p_end)
                    elif isinstance(loop_points[-1], dict) and context.point_distance(loop_points[-1], p_end) > 1e-6:
                        loop_points.append(p_end)
                continue
            end_pt = context.parse_point_value(value)
            continue
        if label == "start angle":
            parsed_start_angle = context.parse_float_value(value)
            if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                if isinstance(parsed_start_angle, float) and math.isfinite(parsed_start_angle):
                    hatch_current_edge["start_angle"] = float(parsed_start_angle)
                continue
            start_angle = parsed_start_angle
            continue
        if label == "end angle":
            parsed_end_angle = context.parse_float_value(value)
            if etype.lower() == "acdbhatch" and isinstance(hatch_current_edge, dict):
                if isinstance(parsed_end_angle, float) and math.isfinite(parsed_end_angle):
                    hatch_current_edge["end_angle"] = float(parsed_end_angle)
                continue
            end_angle = parsed_end_angle
            continue
        if etype.lower() == "acdbhatch" and label == "clockwise":
            if isinstance(hatch_current_edge, dict):
                hatch_current_edge["clockwise"] = value.strip().lower() == "true"
            continue
        if label == "name":
            block_name = value
            continue
        if label == "position":
            parsed_position = context.parse_point_value(value)
            if parsed_position is not None:
                origin_pt = parsed_position
                if is_block_reference:
                    blockref_has_position = True
            continue
        if label == "scale factors":
            scale_factors = context.parse_point_value(value)
            continue
        if label == "rotation":
            rotation_deg = context.parse_float_value(value)
            continue
        if label in ("text string", "contents"):
            text_string = value
            continue
        if label in ("text position", "location"):
            origin_pt = context.parse_point_value(value)
            text_position_point = origin_pt
            continue
        if label == "height":
            text_height = context.parse_float_value(value)
            continue
        if label in ("actual width", "width"):
            text_width = context.parse_float_value(value)
            continue
        if label == "actual height":
            actual_height = context.parse_float_value(value)
            continue
        if label == "major axis":
            major_axis_vec = context.parse_point_value(value)
            continue
        if label == "minor axis":
            minor_axis_vec = context.parse_point_value(value)
            continue
        if label == "major radius":
            major_radius = context.parse_float_value(value)
            continue
        if label == "minor radius":
            minor_radius = context.parse_float_value(value)
            continue
        if label.startswith("control point ") or label.startswith("fit point "):
            pt = context.parse_point_value(value)
            if pt is not None:
                spline_points.append(pt)
            continue
        if label == "color index":
            try:
                color_index = int(value)
            except Exception:
                color_index = None
            continue
        if label == "color":
            color_name = value
            continue
        if label == "linetype":
            linetype_name = value
            continue
        if label == "lineweight":
            lineweight_name = value
            continue
        if label == "text style":
            text_style_name = value
            continue
        if label == "width factor":
            width_factor = context.parse_float_value(value)
            continue
        if label == "oblique":
            oblique_angle = context.parse_float_value(value)
            continue
        if label == "horizontal mode":
            horizontal_mode = value
            continue
        if label == "vertical mode":
            vertical_mode = value
            continue
        if label == "attachment":
            attachment_mode = value
            continue
        if label == "background fill on":
            mtext_background_fill_on = value.strip().lower() == "true"
            continue
        if label in ("background fill color", "background color"):
            mtext_background_fill_color_raw = value
            continue
        if label == "background scale factor":
            mtext_background_scale_factor = context.parse_float_value(value)
            continue
        if label == "mirrored in x":
            mirrored_x = value.strip().lower() == "true"
            continue
        if label == "mirrored in y":
            mirrored_y = value.strip().lower() == "true"
            continue
        point_like = context.parse_point_value(value)
        if point_like is not None:
            if "point" in label or label.startswith("frame vertex "):
                if label == "osnap point":
                    continue
                named_points[label] = point_like
                continue

    bbox = {"min": min_pt, "max": max_pt} if (min_pt and max_pt) else None
    et = etype.lower()

    style_obj: Dict[str, object] = {"lineweight": lineweight_name or "default"}
    lineweight_mm = context.lineweight_to_mm(lineweight_name)
    if isinstance(lineweight_mm, float) and math.isfinite(lineweight_mm) and lineweight_mm > 0:
        style_obj["lineweight_mm"] = lineweight_mm
    if color_index is not None:
        style_obj["color_index"] = color_index
    if color_name:
        style_obj["color"] = color_name
    if linetype_name:
        style_obj["linetype"] = linetype_name
    if text_style_name:
        style_obj["text_style"] = text_style_name

    non_dimension_entity = build_non_dimension_entity(locals(), context)
    if non_dimension_entity is not NOT_HANDLED:
        return non_dimension_entity

    dimension_entity = build_dimension_entity(
        locals(),
        context,
        dim_styles=dim_styles,
        header_dim_defaults=header_dim_defaults,
    )
    if dimension_entity is not NOT_HANDLED:
        return dimension_entity

    return None

