from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from server.dwg.entities.primitives_common import Entity, Geom, Point, Primitive, PrimitiveBuildContext, finite_float, is_point_dict, point_distance


def _aci_to_rgb_decimal(aci: int) -> str:
    idx = int(aci)
    if idx in (0, 256) or idx < 0:
        idx = 7
    basic = {
        1: 0xFF0000,
        2: 0xFFFF00,
        3: 0x00FF00,
        4: 0x00FFFF,
        5: 0x0000FF,
        6: 0xFF00FF,
        7: 0xFFFFFF,
        8: 0x7F7F7F,
        9: 0xC0C0C0,
    }
    return str(basic.get(idx, 0xCCCCCC))


def _resolve_dim_color(value: object) -> Optional[str]:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        n = int(value)
        if n in (0, 256):
            return None
        if 0 < n <= 255:
            return _aci_to_rgb_decimal(n)
        if n > 255:
            return str(max(0, min(0xFFFFFF, n)))
    text = str(value or "").strip()
    if not text:
        return None
    lower = text.lower()
    if lower in ("bylayer", "byblock", "default", "foreground"):
        return None
    if lower.startswith("aci"):
        digits = "".join(ch for ch in lower if ch.isdigit() or ch == "-")
        try:
            return _resolve_dim_color(int(digits))
        except Exception:
            return None
    if text.isdigit():
        return _resolve_dim_color(int(text))
    return text


def _dimension_style_color(geom: Geom, key: str) -> Optional[str]:
    dim_vars = geom.get("dim_style_vars")
    if not isinstance(dim_vars, dict):
        return None
    return _resolve_dim_color(dim_vars.get(key))


def _with_color(primitive: Primitive, color: Optional[str]) -> Primitive:
    if color:
        primitive["color"] = color
    return primitive


def normalize_arrow_style_name(raw: object) -> str:
    text = str(raw or "").strip().lower()
    token = "".join(ch for ch in text if ch.isalnum())
    if not text or text in ("null", "none"):
        return "closed_filled"
    if token in ("none", "_none", "non"):
        return "none"
    if "none" in token and "open" not in token:
        return "none"
    if "archtick" in text or "architecturaltick" in token or "tick" in text or "oblique" in text:
        return "archtick"
    if "slash" in token:
        return "archtick"
    if "integral" in token:
        return "archtick"
    if "tshape" in token or token == "t":
        return "archtick"
    if "origin" in token or "dot" in token:
        return "dot"
    if "circle" in token:
        return "dot"
    if "box" in token or "square" in token or "diamond" in token:
        if "open" in token or "blank" in token:
            return "closed_blank"
        return "closed_filled"
    if "datumtriangle" in token:
        if "filled" in token:
            return "closed_filled"
        return "closed_blank"
    if "rightangle" in token:
        return "open"
    if "closedblank" in token or "blank" in token:
        return "closed_blank"
    if "open" in text and "filled" not in text:
        return "open"
    return "closed_filled"


def resolve_arrow_length(raw_size: object, base_len: float) -> float:
    base = float(base_len) if isinstance(base_len, (int, float)) and math.isfinite(float(base_len)) else 0.0
    base = max(0.0, base)
    soft_min = max(1e-6, base * 0.005)
    soft_max = max(soft_min * 4.0, base * 0.45) if base > 1e-6 else 1e9
    if isinstance(raw_size, (int, float)) and math.isfinite(float(raw_size)) and float(raw_size) > 0:
        return max(soft_min, min(soft_max, float(raw_size)))
    if base > 1e-6:
        return max(soft_min, min(soft_max, base * 0.03))
    return 1.0


def arrow_marker_lines(tip: Point, inward: Tuple[float, float], length: float, half_width: float) -> List[Tuple[Point, Point]]:
    dx, dy = inward
    mag = math.hypot(dx, dy)
    if mag <= 1e-9:
        return []
    ux, uy = dx / mag, dy / mag
    px, py = -uy, ux
    tx = float(tip.get("x", 0.0))
    ty = float(tip.get("y", 0.0))
    tz = float(tip.get("z", 0.0))
    back = {"x": tx + ux * length, "y": ty + uy * length, "z": tz}
    left = {"x": back["x"] + px * half_width, "y": back["y"] + py * half_width, "z": tz}
    right = {"x": back["x"] - px * half_width, "y": back["y"] - py * half_width, "z": tz}
    return [(dict(tip), left), (dict(tip), right)]


def arrow_marker_triangle_points(tip: Point, inward: Tuple[float, float], length: float, half_width: float) -> List[Point]:
    dx, dy = inward
    mag = math.hypot(dx, dy)
    if mag <= 1e-9:
        return []
    ux, uy = dx / mag, dy / mag
    px, py = -uy, ux
    tx = float(tip.get("x", 0.0))
    ty = float(tip.get("y", 0.0))
    tz = float(tip.get("z", 0.0))
    bx = tx + ux * length
    by = ty + uy * length
    return [
        {"x": tx, "y": ty, "z": tz},
        {"x": bx + px * half_width, "y": by + py * half_width, "z": tz},
        {"x": bx - px * half_width, "y": by - py * half_width, "z": tz},
        {"x": tx, "y": ty, "z": tz},
    ]


def arrow_marker_archtick_segment(tip: Point, inward: Tuple[float, float], length: float) -> Optional[Tuple[Point, Point]]:
    dx, dy = inward
    mag = math.hypot(dx, dy)
    if mag <= 1e-9:
        return None
    ux, uy = dx / mag, dy / mag
    px, py = -uy, ux
    tx = float(tip.get("x", 0.0))
    ty = float(tip.get("y", 0.0))
    tz = float(tip.get("z", 0.0))
    along = length * 0.45
    across = length * 0.65
    return (
        {"x": tx + ux * along + px * across, "y": ty + uy * along + py * across, "z": tz},
        {"x": tx - ux * along - px * across, "y": ty - uy * along - py * across, "z": tz},
    )


def line_intersection_2d(a1: Point, a2: Point, b1: Point, b2: Point) -> Optional[Point]:
    x1, y1 = float(a1["x"]), float(a1["y"])
    x2, y2 = float(a2["x"]), float(a2["y"])
    x3, y3 = float(b1["x"]), float(b1["y"])
    x4, y4 = float(b2["x"]), float(b2["y"])
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) <= 1e-9:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return {"x": px, "y": py, "z": finite_float(a1.get("z"), 0.0)}


def _append_dimension_text(out: List[Primitive], ent: Entity, geom: Geom, context: PrimitiveBuildContext) -> None:
    text = context.resolve_dimension_display_text(geom)
    text_pos = geom.get("text_position")
    if not text or not is_point_dict(text_pos):
        return

    text_color = context.resolve_entity_text_color(ent, geom)
    text_mask_padding = geom.get("text_mask_padding")
    if not isinstance(text_mask_padding, (int, float)) or not math.isfinite(float(text_mask_padding)):
        text_mask_padding = 0.25
    text_height = geom.get("text_height")
    if not isinstance(text_height, (int, float)):
        bbox = ent.get("bbox")
        if isinstance(bbox, dict) and isinstance(bbox.get("min"), dict) and isinstance(bbox.get("max"), dict):
            h = abs(float(bbox["max"]["y"]) - float(bbox["min"]["y"]))
            text_height = max(1.0, h * 0.12)
        else:
            text_height = 20.0

    text_obj: Primitive = {
        "kind": "text",
        "text": text,
        "position": text_pos,
        "height": float(text_height),
        "actual_height": float(text_height),
        "rotation": finite_float(geom.get("rotation"), 0.0),
        "width_factor": 1.0,
        "oblique": 0.0,
        "horizontal_mode": "kTextCenter",
        "vertical_mode": "kTextMiddle",
        "attachment": "",
        "mirrored_x": False,
        "mirrored_y": False,
        "is_mtext": False,
        "text_mask": bool(geom.get("text_mask", False)),
        "text_mask_padding": float(text_mask_padding),
        "text_mask_color": geom.get("text_mask_color"),
        "text_mask_use_canvas_bg": bool(geom.get("text_mask_use_canvas_bg", False)),
        "subtype": "dimension_text",
        "font_key": geom.get("font_key"),
        "font_style_name": geom.get("font_style_name"),
        "font_name": geom.get("font_name"),
        "font_family": geom.get("font_family"),
        "font_kind": geom.get("font_kind"),
        "font_source": geom.get("font_source"),
    }
    if text_color:
        text_obj["color"] = text_color
    out.append(text_obj)


def _copy_dimension_block_primitives(ent: Entity, geom: Geom, context: PrimitiveBuildContext) -> List[Primitive]:
    block_primitives = geom.get("dimension_block_primitives")
    if not isinstance(block_primitives, list):
        return []
    copied = [dict(item) for item in block_primitives if isinstance(item, dict)]
    if not copied:
        return []
    has_text_primitive = any(str(p.get("kind") or "").strip().lower() == "text" for p in copied)
    if not has_text_primitive:
        _append_dimension_text(copied, ent, geom, context)
    return copied


def build_dimension_primitives(ent: Entity, geom: Geom, context: PrimitiveBuildContext) -> List[Primitive]:
    copied = _copy_dimension_block_primitives(ent, geom, context)
    if copied:
        return copied

    out: List[Primitive] = []
    dim_kind = str(geom.get("dim_kind", "")).strip().lower()
    line_start = geom.get("line_start")
    line_end = geom.get("line_end")
    ext1 = geom.get("ext1")
    ext2 = geom.get("ext2")
    arrow_block = geom.get("arrow_block")
    start_block = geom.get("arrow_block1") or arrow_block
    end_block = geom.get("arrow_block2") or arrow_block
    start_style = normalize_arrow_style_name(start_block)
    end_style = normalize_arrow_style_name(end_block)
    dim_line_color = _dimension_style_color(geom, "dimclrd")
    ext_line_color = _dimension_style_color(geom, "dimclre")

    if is_point_dict(line_start) and is_point_dict(line_end):
        base_len = point_distance(line_start, line_end)
    elif is_point_dict(ext1) and is_point_dict(ext2):
        base_len = point_distance(ext1, ext2)
    else:
        base_len = 50.0
    arrow_len = resolve_arrow_length(geom.get("arrow_size"), base_len)
    arrow_half = arrow_len * 0.55

    def append_dimension_arrow(tip: Point, inward: Tuple[float, float], style_name: str, style_block: object) -> None:
        if style_name == "none":
            return
        if style_name == "archtick":
            tick_seg = arrow_marker_archtick_segment(tip, inward, max(arrow_len, 4.0))
            if tick_seg:
                out.append(_with_color({"kind": "line", "start": tick_seg[0], "end": tick_seg[1], "subtype": "dim_arrow_tick", "arrow_style": style_name, "arrow_block": style_block}, dim_line_color))
            return
        if style_name == "open":
            for line_a, line_b in arrow_marker_lines(tip, inward, arrow_len, arrow_half):
                out.append(_with_color({"kind": "line", "start": line_a, "end": line_b, "subtype": "dim_arrow_open", "arrow_style": style_name, "arrow_block": style_block}, dim_line_color))
            return
        if style_name == "closed_blank":
            tri = arrow_marker_triangle_points(tip, inward, arrow_len, arrow_half)
            if tri:
                out.append(_with_color({"kind": "polyline", "points": tri, "closed": True, "subtype": "dim_arrow_closed_blank", "arrow_style": style_name, "arrow_block": style_block}, dim_line_color))
            return
        if style_name == "dot":
            dot_radius = max(1.2, min(arrow_len * 0.32, arrow_len))
            tx = float(tip.get("x", 0.0))
            ty = float(tip.get("y", 0.0))
            tz = float(tip.get("z", 0.0))
            dot_pts = [{"x": tx + dot_radius * math.cos(math.pi * 2 * (i / 14)), "y": ty + dot_radius * math.sin(math.pi * 2 * (i / 14)), "z": tz} for i in range(15)]
            out.append(_with_color({"kind": "polygon", "rings": [dot_pts], "filled": True, "pattern_name": "ARROW", "arrow_fill": True, "subtype": "dim_arrow_dot", "arrow_style": style_name, "arrow_block": style_block}, dim_line_color))
            return
        tri = arrow_marker_triangle_points(tip, inward, arrow_len, arrow_half)
        if tri:
            out.append(_with_color({"kind": "polygon", "rings": [tri], "filled": True, "pattern_name": "ARROW", "arrow_fill": True, "subtype": "dim_arrow_fill", "arrow_style": style_name, "arrow_block": style_block}, dim_line_color))

    if dim_kind == "angular":
        center = geom.get("center")
        if not is_point_dict(center):
            ext1_start = geom.get("ext1_start")
            ext1_end = geom.get("ext1_end")
            ext2_start = geom.get("ext2_start")
            ext2_end = geom.get("ext2_end")
            if is_point_dict(ext1_start) and is_point_dict(ext1_end) and is_point_dict(ext2_start) and is_point_dict(ext2_end):
                center = line_intersection_2d(ext1_start, ext1_end, ext2_start, ext2_end)
        if is_point_dict(ext1) and is_point_dict(line_start):
            out.append(_with_color({"kind": "line", "start": ext1, "end": line_start}, ext_line_color))
        if is_point_dict(ext2) and is_point_dict(line_end):
            out.append(_with_color({"kind": "line", "start": ext2, "end": line_end}, ext_line_color))
        if is_point_dict(center) and is_point_dict(line_start) and is_point_dict(line_end):
            out.append(_with_color({"kind": "arc", "center": center, "radius": max(1e-6, point_distance(center, line_start)), "start": line_start, "end": line_end}, dim_line_color))
            append_dimension_arrow(line_start, (float(center["x"]) - float(line_start["x"]), float(center["y"]) - float(line_start["y"])), start_style, start_block)
            append_dimension_arrow(line_end, (float(center["x"]) - float(line_end["x"]), float(center["y"]) - float(line_end["y"])), end_style, end_block)
    elif dim_kind == "arc_length":
        center = geom.get("center")
        if not is_point_dict(center):
            center = geom.get("dim_line_point")
        if is_point_dict(ext1) and is_point_dict(line_start):
            out.append(_with_color({"kind": "line", "start": ext1, "end": line_start}, ext_line_color))
        if is_point_dict(ext2) and is_point_dict(line_end):
            out.append(_with_color({"kind": "line", "start": ext2, "end": line_end}, ext_line_color))
        if is_point_dict(center) and is_point_dict(line_start) and is_point_dict(line_end):
            out.append(_with_color({"kind": "arc", "center": center, "radius": max(1e-6, point_distance(center, line_start)), "start": line_start, "end": line_end, "subtype": "arc_length_dimension"}, dim_line_color))
            append_dimension_arrow(line_start, (float(center["x"]) - float(line_start["x"]), float(center["y"]) - float(line_start["y"])), start_style, start_block)
            append_dimension_arrow(line_end, (float(center["x"]) - float(line_end["x"]), float(center["y"]) - float(line_end["y"])), end_style, end_block)
    elif dim_kind == "radius":
        center = geom.get("center")
        tip = line_end if is_point_dict(line_end) else ext2 if is_point_dict(ext2) else None
        if is_point_dict(center) and is_point_dict(tip):
            out.append(_with_color({"kind": "line", "start": center, "end": tip}, dim_line_color))
            append_dimension_arrow(tip, (float(center["x"]) - float(tip["x"]), float(center["y"]) - float(tip["y"])), start_style, start_block)
    elif dim_kind == "diameter":
        if is_point_dict(line_start) and is_point_dict(line_end):
            out.append(_with_color({"kind": "line", "start": line_start, "end": line_end}, dim_line_color))
            append_dimension_arrow(line_start, (float(line_end["x"]) - float(line_start["x"]), float(line_end["y"]) - float(line_start["y"])), start_style, start_block)
            append_dimension_arrow(line_end, (float(line_start["x"]) - float(line_end["x"]), float(line_start["y"]) - float(line_end["y"])), end_style, end_block)
    elif dim_kind == "ordinate":
        if is_point_dict(line_start) and is_point_dict(line_end):
            out.append(_with_color({"kind": "line", "start": line_start, "end": line_end}, dim_line_color))
            append_dimension_arrow(line_start, (float(line_end["x"]) - float(line_start["x"]), float(line_end["y"]) - float(line_start["y"])), start_style, start_block)
    else:
        if is_point_dict(ext1) and is_point_dict(line_start):
            out.append(_with_color({"kind": "line", "start": ext1, "end": line_start}, ext_line_color))
        if is_point_dict(ext2) and is_point_dict(line_end):
            out.append(_with_color({"kind": "line", "start": ext2, "end": line_end}, ext_line_color))
        if is_point_dict(line_start) and is_point_dict(line_end):
            seg_dx = float(line_end["x"]) - float(line_start["x"])
            seg_dy = float(line_end["y"]) - float(line_start["y"])
            line_head = dict(line_start)
            line_tail = dict(line_end)
            dim_len = point_distance(line_start, line_end)
            if dim_len > arrow_len * 2.4:
                ux = seg_dx / max(dim_len, 1e-9)
                uy = seg_dy / max(dim_len, 1e-9)
                inset = arrow_len * 0.9
                line_head = {"x": float(line_start["x"]) + ux * inset, "y": float(line_start["y"]) + uy * inset, "z": float(line_start.get("z", 0.0))}
                line_tail = {"x": float(line_end["x"]) - ux * inset, "y": float(line_end["y"]) - uy * inset, "z": float(line_end.get("z", 0.0))}
            out.append(_with_color({"kind": "line", "start": line_head, "end": line_tail}, dim_line_color))
            append_dimension_arrow(line_start, (seg_dx, seg_dy), start_style, start_block)
            append_dimension_arrow(line_end, (-seg_dx, -seg_dy), end_style, end_block)

    _append_dimension_text(out, ent, geom, context)
    return out
