from __future__ import annotations

import math
from typing import Dict, List, Optional

from server.dwg.common.affine import (
    Affine2D,
    _affine_scales,
    _apply_affine,
    _apply_bbox_affine,
    _apply_linear,
)
from server.dwg.common.dimension_utils import _dimension_line_endpoints
from server.dwg.common.geometry import _bbox_from_points, _point_angle_from_center, _point_distance
from server.dwg.common.oda_parse import _is_text_entity_type


def transform_entity(ent: Dict[str, object], tf: Affine2D) -> Optional[Dict[str, object]]:
        et = str(ent.get("type", "")).upper()
        geom = ent.get("geom", {}) if isinstance(ent.get("geom"), dict) else {}

        transformed = {
            "id": ent.get("id"),
            "type": ent.get("type"),
            "layer": ent.get("layer", "0"),
            "space_id": ent.get("space_id", "model"),
            "semantic_type": ent.get("semantic_type"),
            "semantic_subtype": ent.get("semantic_subtype"),
            "source_acdb_type": ent.get("source_acdb_type"),
            "geom": {},
            "style": ent.get("style", {"lineweight": "default"}),
            "bbox": None,
        }

        if et == "LINE":
            start = geom.get("start")
            end = geom.get("end")
            if not isinstance(start, dict) or not isinstance(end, dict):
                return None
            t_start = _apply_affine(tf, start)
            t_end = _apply_affine(tf, end)
            transformed["geom"] = {"start": t_start, "end": t_end}
            transformed["bbox"] = _bbox_from_points([t_start, t_end])
            return transformed

        if et == "POLYLINE":
            vertices_raw = geom.get("vertices")
            if not isinstance(vertices_raw, list):
                return None
            vertices = [_apply_affine(tf, v) for v in vertices_raw if isinstance(v, dict)]
            if len(vertices) < 2:
                return None
            transformed_geom: Dict[str, object] = {"vertices": vertices, "closed": bool(geom.get("closed", False))}
            sx, sy = _affine_scales(tf)
            scale_avg = max(1e-9, (abs(sx) + abs(sy)) * 0.5)
            start_w = geom.get("start_width")
            end_w = geom.get("end_width")
            global_w = geom.get("global_width")
            if isinstance(start_w, (int, float)) and math.isfinite(float(start_w)) and float(start_w) >= 0:
                transformed_geom["start_width"] = float(start_w) * scale_avg
            if isinstance(end_w, (int, float)) and math.isfinite(float(end_w)) and float(end_w) >= 0:
                transformed_geom["end_width"] = float(end_w) * scale_avg
            if isinstance(global_w, (int, float)) and math.isfinite(float(global_w)) and float(global_w) > 0:
                transformed_geom["global_width"] = float(global_w) * scale_avg
            segment_widths = geom.get("segment_widths")
            if isinstance(segment_widths, list):
                transformed_segments: List[Dict[str, object]] = []
                for item in segment_widths:
                    if not isinstance(item, dict):
                        continue
                    transformed_item: Dict[str, object] = {}
                    segment_index = item.get("segment")
                    if isinstance(segment_index, (int, float)) and math.isfinite(float(segment_index)):
                        transformed_item["segment"] = int(segment_index)
                    for source_key in ("start_width", "end_width"):
                        raw_width = item.get(source_key)
                        if isinstance(raw_width, (int, float)) and math.isfinite(float(raw_width)) and float(raw_width) >= 0:
                            transformed_item[source_key] = float(raw_width) * scale_avg
                    if "start_width" in transformed_item or "end_width" in transformed_item:
                        transformed_segments.append(transformed_item)
                if transformed_segments:
                    transformed_geom["segment_widths"] = transformed_segments
            transformed["geom"] = transformed_geom
            transformed["bbox"] = _bbox_from_points(vertices)
            return transformed

        if et == "CIRCLE":
            center = geom.get("center")
            radius = geom.get("radius")
            if not isinstance(center, dict) or not isinstance(radius, (int, float)):
                return None
            t_center = _apply_affine(tf, center)
            sx, sy = _affine_scales(tf)
            t_radius = float(radius) * (abs(sx) + abs(sy)) * 0.5
            if t_radius <= 0:
                return None
            transformed["geom"] = {"center": t_center, "radius": t_radius}
            transformed["bbox"] = {
                "min": {"x": t_center["x"] - t_radius, "y": t_center["y"] - t_radius, "z": t_center.get("z", 0.0)},
                "max": {"x": t_center["x"] + t_radius, "y": t_center["y"] + t_radius, "z": t_center.get("z", 0.0)},
            }
            return transformed

        if et == "ARC":
            center = geom.get("center")
            if not isinstance(center, dict):
                return None

            start_raw = geom.get("start")
            end_raw = geom.get("end")
            radius = geom.get("radius")
            start_angle = geom.get("start_angle")
            end_angle = geom.get("end_angle")
            if not isinstance(radius, (int, float)) or not math.isfinite(float(radius)) or float(radius) <= 0:
                return None
            radius_f = float(radius)

            if not isinstance(start_raw, dict) or not isinstance(end_raw, dict):
                if isinstance(start_angle, (int, float)) and math.isfinite(float(start_angle)):
                    start_raw = {
                        "x": float(center["x"]) + radius_f * math.cos(math.radians(float(start_angle))),
                        "y": float(center["y"]) + radius_f * math.sin(math.radians(float(start_angle))),
                        "z": float(center.get("z", 0.0)),
                    }
                if isinstance(end_angle, (int, float)) and math.isfinite(float(end_angle)):
                    end_raw = {
                        "x": float(center["x"]) + radius_f * math.cos(math.radians(float(end_angle))),
                        "z": float(center.get("z", 0.0)),
                        "y": float(center["y"]) + radius_f * math.sin(math.radians(float(end_angle))),
                    }

            if not isinstance(start_raw, dict) or not isinstance(end_raw, dict):
                return None

            if isinstance(start_angle, (int, float)) and math.isfinite(float(start_angle)):
                s_angle = float(start_angle)
            else:
                s_angle = _point_angle_from_center(center, start_raw)  # type: ignore[arg-type]
            if isinstance(end_angle, (int, float)) and math.isfinite(float(end_angle)):
                e_angle = float(end_angle)
            else:
                e_angle = _point_angle_from_center(center, end_raw)  # type: ignore[arg-type]

            while e_angle < s_angle:
                e_angle += 360.0
            span = e_angle - s_angle
            if span <= 1e-7 or span >= 360.0 - 1e-7:
                return None

            sample_count = max(8, min(96, int(math.ceil(span / 360.0 * 96.0))))
            local_points: List[Dict[str, float]] = []
            for idx in range(sample_count + 1):
                angle = math.radians(s_angle + span * idx / sample_count)
                local_points.append(
                    {
                        "x": float(center["x"]) + radius_f * math.cos(angle),
                        "y": float(center["y"]) + radius_f * math.sin(angle),
                        "z": float(center.get("z", 0.0)),
                    }
                )
            points = [_apply_affine(tf, point) for point in local_points]
            if len(points) < 2:
                return None

            t_center = _apply_affine(tf, center)
            transformed["geom"] = {
                "center": t_center,
                "radius": radius_f,
                "start": points[0],
                "end": points[-1],
                "start_angle": _point_angle_from_center(t_center, points[0]),
                "end_angle": _point_angle_from_center(t_center, points[-1]),
                "source_type": "ARC",
                "primitive_source": "transformed_arc_polyline",
                "primitives": [
                    {
                        "kind": "polyline",
                        "points": points,
                        "closed": False,
                        "subtype": "transformed_arc",
                    }
                ],
            }
            transformed["bbox"] = _bbox_from_points(points)
            return transformed

        if _is_text_entity_type(et):
            pos = geom.get("position")
            text = str(geom.get("text", ""))
            if not isinstance(pos, dict):
                return None
            t_pos = _apply_affine(tf, pos)
            sx, sy = _affine_scales(tf)
            abs_sx = max(1e-9, abs(sx))
            abs_sy = max(1e-9, abs(sy))
            # AutoCAD: text height uses Y scale, width_factor uses X/Y ratio
            local_rot = float(geom.get("rotation", 0.0))
            tf_rot = math.degrees(math.atan2(tf[2], tf[0]))
            t_height = max(1e-9, float(geom.get("height", 100.0)) * abs_sy)
            t_width = float(geom.get("width", 0.0)) * abs_sx
            actual_width_raw = geom.get("actual_width")
            actual_height_raw = geom.get("actual_height")
            t_actual_width = (
                float(actual_width_raw) * abs_sx
                if isinstance(actual_width_raw, (int, float)) and math.isfinite(float(actual_width_raw)) and float(actual_width_raw) > 0
                else t_width
            )
            t_actual_height = (
                float(actual_height_raw) * abs_sy
                if isinstance(actual_height_raw, (int, float)) and math.isfinite(float(actual_height_raw)) and float(actual_height_raw) > 0
                else t_height
            )
            # Adjust width_factor for non-uniform block scale (X/Y ratio)
            orig_wf = float(geom.get("width_factor", 1.0))
            t_width_factor = max(1e-6, orig_wf * (abs_sx / abs_sy))
            transformed["geom"] = {
                "text": text,
                "position": t_pos,
                "height": t_height,
                "rotation": local_rot + tf_rot,
                "width": t_width,
                "actual_width": t_actual_width,
                "width_factor": t_width_factor,
                "is_mtext": bool(geom.get("is_mtext", False)),
                "is_attribute": bool(geom.get("is_attribute", False)),
                "attribute_kind": geom.get("attribute_kind"),
                "style_name": geom.get("style_name"),
                "horizontal_mode": geom.get("horizontal_mode"),
                "vertical_mode": geom.get("vertical_mode"),
                "text_vertical": bool(geom.get("text_vertical", False)),
                "attachment": geom.get("attachment"),
                "oblique": float(geom.get("oblique", 0.0)),
                "actual_height": t_actual_height,
                "mirrored_x": bool(geom.get("mirrored_x", False)),
                "mirrored_y": bool(geom.get("mirrored_y", False)),
                "font_key": geom.get("font_key"),
                "font_style_name": geom.get("font_style_name"),
                "font_name": geom.get("font_name"),
                "font_family": geom.get("font_family"),
                "font_kind": geom.get("font_kind"),
                "font_source": geom.get("font_source"),
                "text_mask": bool(geom.get("text_mask", False)),
                "text_mask_padding": (
                    float(geom.get("text_mask_padding"))
                    if isinstance(geom.get("text_mask_padding"), (int, float))
                    and math.isfinite(float(geom.get("text_mask_padding")))
                    else 0.25
                ),
                "text_mask_color": geom.get("text_mask_color"),
                "text_mask_use_canvas_bg": bool(geom.get("text_mask_use_canvas_bg", False)),
                "text_extents_source": geom.get("text_extents_source"),
            }
            transformed["bbox"] = _apply_bbox_affine(tf, ent.get("bbox"))
            if transformed["bbox"] is None:
                est_w = t_width if t_width > 0 else max(t_height * 0.5, len(text) * t_height * 0.55)
                transformed["bbox"] = {
                    "min": {"x": t_pos["x"], "y": t_pos["y"] - t_height, "z": t_pos.get("z", 0.0)},
                    "max": {"x": t_pos["x"] + est_w, "y": t_pos["y"], "z": t_pos.get("z", 0.0)},
                }
            return transformed

        if et == "POINT":
            pos = geom.get("position")
            if not isinstance(pos, dict):
                return None
            t_pos = _apply_affine(tf, pos)
            transformed["geom"] = {
                "position": t_pos,
                "display_size": float(geom.get("display_size", 6.0)),
            }
            transformed["bbox"] = {"min": dict(t_pos), "max": dict(t_pos)}
            return transformed

        if et == "HATCH":
            loops_raw = geom.get("loops")
            if not isinstance(loops_raw, list):
                return None
            loops: List[Dict[str, object]] = []
            all_points: List[Dict[str, float]] = []
            for loop in loops_raw:
                if not isinstance(loop, dict):
                    continue
                points_raw = loop.get("points")
                if not isinstance(points_raw, list):
                    continue
                points = [_apply_affine(tf, p) for p in points_raw if isinstance(p, dict)]
                if len(points) < 2:
                    continue
                loops.append(
                    {
                        "kind": loop.get("kind", "kExternal"),
                        "closed": bool(loop.get("closed", True)),
                        "points": points,
                    }
                )
                all_points.extend(points)
            if not loops:
                return None
            transformed["geom"] = {
                "loops": loops,
                "solid_fill": bool(geom.get("solid_fill", False)),
                "pattern_name": geom.get("pattern_name", "SOLID"),
                "pattern_angle": geom.get("pattern_angle"),
                "pattern_scale": geom.get("pattern_scale"),
                "pattern_spacing": geom.get("pattern_spacing"),
            }
            transformed["bbox"] = _bbox_from_points(all_points)
            return transformed

        if et in ("SOLID", "TRACE", "FACE", "3DFACE"):
            vertices_raw = geom.get("vertices")
            if not isinstance(vertices_raw, list):
                return None
            vertices = [_apply_affine(tf, v) for v in vertices_raw if isinstance(v, dict)]
            if len(vertices) < 3:
                return None
            transformed["geom"] = {
                "vertices": vertices,
                "closed": True,
                "solid_fill": bool(geom.get("solid_fill", True)),
                "degenerate_reconstructed": bool(geom.get("degenerate_reconstructed", False)),
            }
            transformed["bbox"] = _bbox_from_points(vertices)
            return transformed

        if et == "DIMENSION":
            ext1 = geom.get("ext1")
            ext2 = geom.get("ext2")
            dim_pt = geom.get("dim_line_point")
            if not isinstance(ext1, dict) or not isinstance(ext2, dict):
                return None
            if not isinstance(dim_pt, dict):
                dim_pt = ext2
            t_ext1 = _apply_affine(tf, ext1)
            t_ext2 = _apply_affine(tf, ext2)
            t_dim_pt = _apply_affine(tf, dim_pt)
            line_start_raw = geom.get("line_start")
            line_end_raw = geom.get("line_end")
            if isinstance(line_start_raw, dict) and isinstance(line_end_raw, dict):
                t_line_start = _apply_affine(tf, line_start_raw)
                t_line_end = _apply_affine(tf, line_end_raw)
            else:
                t_line_start, t_line_end = _dimension_line_endpoints(t_ext1, t_ext2, t_dim_pt)

            text_pos = geom.get("text_position")
            t_text_pos = _apply_affine(tf, text_pos) if isinstance(text_pos, dict) else {
                "x": (t_line_start["x"] + t_line_end["x"]) * 0.5,
                "y": (t_line_start["y"] + t_line_end["y"]) * 0.5,
                "z": 0.0,
            }
            sx, sy = _affine_scales(tf)
            scale_avg = max(1e-9, (abs(sx) + abs(sy)) * 0.5)
            local_rot = float(geom.get("rotation", 0.0))
            tf_rot = math.degrees(math.atan2(tf[2], tf[0]))
            dim_kind = str(geom.get("dim_kind", "aligned")).strip().lower() or "aligned"
            dim_style_vars_raw = geom.get("dim_style_vars")
            dim_style_vars: Dict[str, object] = {}
            if isinstance(dim_style_vars_raw, dict):
                dim_style_vars = dict(dim_style_vars_raw)

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
            dim_value_source_map: Dict[str, object] = {}
            if isinstance(dim_value_source_map_raw, dict):
                dim_value_source_map = dict(dim_value_source_map_raw)

            measurement_raw = geom.get("measurement")
            if isinstance(measurement_raw, (int, float)):
                if dim_kind == "angular":
                    measurement = float(measurement_raw)
                else:
                    measurement = float(measurement_raw) * scale_avg
            else:
                measurement = _point_distance(t_ext1, t_ext2)
            transformed["geom"] = {
                "ext1": t_ext1,
                "ext2": t_ext2,
                "dim_line_point": t_dim_pt,
                "line_start": t_line_start,
                "line_end": t_line_end,
                "text_position": t_text_pos,
                "text": str(geom.get("text", "")),
                "measurement": measurement,
                "rotation": local_rot + tf_rot,
                "dim_kind": dim_kind,
                "dimension_style": geom.get("dimension_style"),
                "arrow_block": geom.get("arrow_block"),
                "arrow_block1": geom.get("arrow_block1"),
                "arrow_block2": geom.get("arrow_block2"),
                "arrow_size": geom.get("arrow_size"),
                "formatted_measurement": geom.get("formatted_measurement"),
                "display_text": geom.get("display_text"),
                "override_text": geom.get("override_text"),
                "contents": geom.get("contents"),
                "plain_text": geom.get("plain_text"),
                "value": geom.get("value"),
                "user_text": geom.get("user_text"),
                "text_override": geom.get("text_override"),
                "font_key": geom.get("font_key"),
                "font_style_name": geom.get("font_style_name"),
                "font_name": geom.get("font_name"),
                "font_family": geom.get("font_family"),
                "font_kind": geom.get("font_kind"),
                "font_source": geom.get("font_source"),
                "style_name": geom.get("style_name"),
                "text_style": geom.get("text_style"),
                "text_mask": bool(geom.get("text_mask", False)),
                "text_mask_padding": (
                    float(geom.get("text_mask_padding"))
                    if isinstance(geom.get("text_mask_padding"), (int, float))
                    and math.isfinite(float(geom.get("text_mask_padding")))
                    else 0.25
                ),
                "text_mask_color": geom.get("text_mask_color"),
                "text_mask_use_canvas_bg": bool(geom.get("text_mask_use_canvas_bg", False)),
                "text_color": geom.get("text_color"),
                "dim_style_vars": dim_style_vars,
                "dim_style_sources": dim_style_sources,
                "dim_value_source_map": dim_value_source_map,
            }
            center_raw = geom.get("center")
            if isinstance(center_raw, dict):
                transformed["geom"]["center"] = _apply_affine(tf, center_raw)
            arc_point_raw = geom.get("arc_point")
            if isinstance(arc_point_raw, dict):
                transformed["geom"]["arc_point"] = _apply_affine(tf, arc_point_raw)
            for key in ("ext1_start", "ext1_end", "ext2_start", "ext2_end", "chord_point", "far_chord_point", "leader_end_point"):
                raw_pt = geom.get(key)
                if isinstance(raw_pt, dict):
                    transformed["geom"][key] = _apply_affine(tf, raw_pt)
            text_height_raw = geom.get("text_height")
            if isinstance(text_height_raw, (int, float)) and math.isfinite(float(text_height_raw)) and float(text_height_raw) > 0:
                transformed["geom"]["text_height"] = float(text_height_raw)
            dim_block_name_raw = str(geom.get("dimension_block_name") or "").strip()
            if dim_block_name_raw:
                transformed["geom"]["dimension_block_name"] = dim_block_name_raw
            dim_block_pos_raw = geom.get("dimension_block_position")
            if isinstance(dim_block_pos_raw, dict):
                transformed["geom"]["dimension_block_position"] = _apply_affine(tf, dim_block_pos_raw)
            dim_block_rot_raw = geom.get("dimension_block_rotation")
            if isinstance(dim_block_rot_raw, (int, float)) and math.isfinite(float(dim_block_rot_raw)):
                transformed["geom"]["dimension_block_rotation"] = float(dim_block_rot_raw) + tf_rot
            dim_block_scale_raw = geom.get("dimension_block_scale")
            if isinstance(dim_block_scale_raw, dict):
                transformed["geom"]["dimension_block_scale"] = {
                    "x": float(dim_block_scale_raw.get("x", 1.0)) * abs(sx),
                    "y": float(dim_block_scale_raw.get("y", 1.0)) * abs(sy),
                    "z": float(dim_block_scale_raw.get("z", 1.0)),
                }
            transformed["bbox"] = _apply_bbox_affine(tf, ent.get("bbox"))
            if transformed["bbox"] is None:
                transformed["bbox"] = _bbox_from_points([t_ext1, t_ext2, t_line_start, t_line_end, t_text_pos])
            return transformed

        if et == "LEADER":
            points_raw = geom.get("points")
            if not isinstance(points_raw, list):
                return None
            points = [_apply_affine(tf, p) for p in points_raw if isinstance(p, dict)]
            if len(points) < 2:
                return None
            transformed["geom"] = {
                "points": points,
                "has_arrowhead": bool(geom.get("has_arrowhead", False)),
                "splined": bool(geom.get("splined", False)),
                "arrow_block": geom.get("arrow_block"),
                "arrow_size": geom.get("arrow_size"),
            }
            transformed["bbox"] = _bbox_from_points(points)
            return transformed

        if et == "WIPEOUT":
            vertices_raw = geom.get("vertices")
            if not isinstance(vertices_raw, list):
                return None
            vertices = [_apply_affine(tf, p) for p in vertices_raw if isinstance(p, dict)]
            if len(vertices) < 3:
                return None
            transformed["geom"] = {"vertices": vertices, "closed": bool(geom.get("closed", True))}
            transformed["bbox"] = _bbox_from_points(vertices)
            return transformed

        if et == "ELLIPSE":
            center = geom.get("center")
            if not isinstance(center, dict):
                return None
            major_axis = geom.get("major_axis")
            minor_axis = geom.get("minor_axis")

            if not isinstance(major_axis, dict):
                rx = float(geom.get("rx", 0.0))
                rot = math.radians(float(geom.get("rotation", 0.0)))
                major_axis = {"x": rx * math.cos(rot), "y": rx * math.sin(rot), "z": 0.0}
            if not isinstance(minor_axis, dict):
                ry = float(geom.get("ry", 0.0))
                rot = math.radians(float(geom.get("rotation", 0.0)))
                minor_axis = {"x": -ry * math.sin(rot), "y": ry * math.cos(rot), "z": 0.0}

            major_len = math.hypot(float(major_axis.get("x", 0.0)), float(major_axis.get("y", 0.0)))
            minor_len = math.hypot(float(minor_axis.get("x", 0.0)), float(minor_axis.get("y", 0.0)))
            if major_len <= 1e-12 or minor_len <= 1e-12:
                return None

            start_angle = float(geom.get("start_angle", 0.0))
            end_angle = float(geom.get("end_angle", 360.0))
            if not math.isfinite(start_angle):
                start_angle = 0.0
            if not math.isfinite(end_angle):
                end_angle = 360.0
            while end_angle < start_angle:
                end_angle += 360.0
            span = end_angle - start_angle
            full_ellipse = span <= 1e-7 or span >= 360.0 - 1e-7
            if full_ellipse:
                start_angle = 0.0
                span = 360.0

            sample_count = max(16, min(160, int(math.ceil(span / 360.0 * 128.0))))
            local_points: List[Dict[str, float]] = []
            for idx in range(sample_count + 1):
                angle = math.radians(start_angle + span * idx / sample_count)
                cos_t = math.cos(angle)
                sin_t = math.sin(angle)
                local_points.append(
                    {
                        "x": float(center["x"]) + float(major_axis.get("x", 0.0)) * cos_t + float(minor_axis.get("x", 0.0)) * sin_t,
                        "y": float(center["y"]) + float(major_axis.get("y", 0.0)) * cos_t + float(minor_axis.get("y", 0.0)) * sin_t,
                        "z": float(center.get("z", 0.0)),
                    }
                )
            points = [_apply_affine(tf, point) for point in local_points]
            if len(points) < 2:
                return None

            t_center = _apply_affine(tf, center)

            transformed["geom"] = {
                "center": t_center,
                "rx": major_len,
                "ry": minor_len,
                "rotation": 0.0,
                "start": points[0],
                "end": points[-1],
                "start_angle": start_angle,
                "end_angle": start_angle + span,
                "source_type": "ELLIPSE",
                "primitive_source": "transformed_ellipse_polyline",
                "primitives": [
                    {
                        "kind": "polyline",
                        "points": points,
                        "closed": full_ellipse,
                        "subtype": "transformed_ellipse",
                    }
                ],
            }
            transformed["bbox"] = _bbox_from_points(points)
            return transformed

        if et == "SPLINE":
            points_raw = geom.get("points")
            if not isinstance(points_raw, list):
                return None
            points = [_apply_affine(tf, p) for p in points_raw if isinstance(p, dict)]
            if len(points) < 2:
                return None
            transformed["geom"] = {"points": points}
            transformed["bbox"] = _bbox_from_points(points)
            return transformed

        return None
