from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple


LabelParser = Callable[[str], Tuple[Optional[str], Optional[str]]]


@dataclass(frozen=True)
class StyleExtractionContext:
    parse_label_value: LabelParser
    parse_float_value: Callable[[str], Optional[float]]
    lineweight_to_mm: Callable[[object], Optional[float]]
    detect_font_kind: Callable[[object], str]
    font_family_from_name: Callable[[object], str]
    normalize_dim_var_label: Callable[[object], Optional[str]]
    parse_dim_var_value: Callable[[str, object], Optional[object]]


def extract_layer_styles(dump_text: str, context: StyleExtractionContext) -> Dict[str, Dict[str, object]]:
    layer_styles: Dict[str, Dict[str, object]] = {}
    current_name: Optional[str] = None
    current_color_index: Optional[int] = None
    current_color_name: Optional[str] = None
    current_lineweight_raw: Optional[str] = None
    in_record = False

    def finalize_record() -> None:
        nonlocal current_name, current_color_index, current_color_name, current_lineweight_raw
        if current_name:
            obj: Dict[str, object] = {}
            if current_color_index is not None:
                obj["color_index"] = current_color_index
            if current_color_name:
                obj["color"] = current_color_name
            if current_lineweight_raw:
                obj["lineweight"] = current_lineweight_raw
            lineweight_mm = context.lineweight_to_mm(current_lineweight_raw)
            if isinstance(lineweight_mm, float) and math.isfinite(lineweight_mm) and lineweight_mm > 0:
                obj["lineweight_mm"] = lineweight_mm
            layer_styles[current_name] = obj
        current_name = None
        current_color_index = None
        current_color_name = None
        current_lineweight_raw = None

    for raw in dump_text.splitlines():
        stripped = raw.strip()
        if stripped == "<AcDbLayerTableRecord>":
            if in_record:
                finalize_record()
            in_record = True
            continue
        if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbLayerTableRecord>":
            finalize_record()
            in_record = False
            continue
        if not in_record:
            continue

        label, value = context.parse_label_value(raw)
        if not label or value is None:
            continue
        if label == "name" and current_name is None:
            current_name = value
        elif label == "color index":
            try:
                current_color_index = int(value)
            except Exception:
                current_color_index = None
        elif label == "color":
            current_color_name = value
        elif label == "lineweight":
            current_lineweight_raw = value

    if in_record:
        finalize_record()
    return layer_styles


def extract_text_styles(dump_text: str, context: StyleExtractionContext) -> Dict[str, Dict[str, object]]:
    text_styles: Dict[str, Dict[str, object]] = {}
    current_name: Optional[str] = None
    current_font_file: Optional[str] = None
    current_bigfont_file: Optional[str] = None
    current_typeface: Optional[str] = None
    current_shape_file = False
    current_vertical = False
    in_record = False

    def finalize_record() -> None:
        nonlocal current_name, current_font_file, current_bigfont_file, current_typeface, current_shape_file, current_vertical
        if current_name:
            font_name = (current_font_file or "").strip() or (current_typeface or "").strip() or current_name
            bigfont_name = (current_bigfont_file or "").strip() or None
            font_kind = "shx" if current_shape_file else context.detect_font_kind(font_name)
            if font_kind == "unknown" and bigfont_name and context.detect_font_kind(bigfont_name) == "shx":
                font_kind = "shx"
            font_family = (current_typeface or "").strip() or context.font_family_from_name(font_name)
            text_styles[current_name] = {
                "style_name": current_name,
                "font_name": font_name,
                "bigfont_name": bigfont_name,
                "font_family": font_family,
                "font_kind": font_kind,
                "shape_file": bool(current_shape_file),
                "vertical": bool(current_vertical),
            }
        current_name = None
        current_font_file = None
        current_bigfont_file = None
        current_typeface = None
        current_shape_file = False
        current_vertical = False

    for raw in dump_text.splitlines():
        stripped = raw.strip()
        if stripped == "<AcDbTextStyleTableRecord>":
            if in_record:
                finalize_record()
            in_record = True
            continue
        if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbTextStyleTableRecord>":
            finalize_record()
            in_record = False
            continue
        if not in_record:
            continue

        label, value = context.parse_label_value(raw)
        if not label or value is None:
            continue
        if label == "name" and current_name is None:
            current_name = value
        elif label in ("file", "file name", "filename", "font", "font name", "font file", "primary file", "primary font file"):
            current_font_file = value
        elif label in ("bigfont", "bigfont file", "bigfont file name", "bigfont filename", "big font file", "big font"):
            current_bigfont_file = value
        elif label == "typeface":
            current_typeface = value
        elif label == "shape file":
            current_shape_file = str(value).strip().lower() == "true"
        elif label in ("vertical", "is vertical", "vertical text"):
            current_vertical = str(value).strip().lower() in ("true", "1", "yes", "y", "ktrue")

    if in_record:
        finalize_record()
    return text_styles


def extract_linetype_styles(dump_text: str, context: StyleExtractionContext) -> Dict[str, Dict[str, object]]:
    linetypes: Dict[str, Dict[str, object]] = {}
    current_name: Optional[str] = None
    current_description: Optional[str] = None
    current_pattern_length: Optional[float] = None
    in_record = False

    def finalize_record() -> None:
        nonlocal current_name, current_description, current_pattern_length
        if current_name:
            rec: Dict[str, object] = {}
            if current_description:
                rec["description"] = current_description
            if isinstance(current_pattern_length, float) and math.isfinite(current_pattern_length) and current_pattern_length >= 0:
                rec["pattern_length"] = float(current_pattern_length)
            linetypes[current_name] = rec
        current_name = None
        current_description = None
        current_pattern_length = None

    for raw in dump_text.splitlines():
        stripped = raw.strip()
        if stripped == "<AcDbLinetypeTableRecord>":
            if in_record:
                finalize_record()
            in_record = True
            continue
        if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbLinetypeTableRecord>":
            finalize_record()
            in_record = False
            continue
        if not in_record:
            continue

        label, value = context.parse_label_value(raw)
        if not label or value is None:
            continue
        if label == "name" and current_name is None:
            current_name = value
        elif label in ("description", "comments"):
            current_description = value
        elif label in ("pattern length", "patternlength", "length"):
            current_pattern_length = context.parse_float_value(value)

    if in_record:
        finalize_record()
    return linetypes


def extract_header_dim_defaults(dump_text: str, context: StyleExtractionContext) -> Dict[str, object]:
    defaults: Dict[str, object] = {}
    for raw in dump_text.splitlines():
        stripped = raw.strip()
        if stripped.startswith("<AcDb"):
            break
        label, value = context.parse_label_value(raw)
        if not label or value is None:
            continue
        dim_key = context.normalize_dim_var_label(label)
        if not dim_key:
            continue
        parsed = context.parse_dim_var_value(dim_key, value)
        if parsed is not None:
            defaults[dim_key] = parsed
    return defaults


def extract_dim_styles(dump_text: str, context: StyleExtractionContext) -> Dict[str, Dict[str, object]]:
    styles: Dict[str, Dict[str, object]] = {}
    current_name: Optional[str] = None
    current_vars: Dict[str, object] = {}
    in_record = False

    def finalize_record() -> None:
        nonlocal current_name, current_vars
        if current_name:
            styles[current_name] = dict(current_vars)
        current_name = None
        current_vars = {}

    for raw in dump_text.splitlines():
        stripped = raw.strip()
        if stripped == "<AcDbDimStyleTableRecord>":
            if in_record:
                finalize_record()
            in_record = True
            continue
        if in_record and stripped.startswith("<AcDb") and stripped != "<AcDbDimStyleTableRecord>":
            finalize_record()
            in_record = False
            continue
        if not in_record:
            continue

        label, value = context.parse_label_value(raw)
        if not label or value is None:
            continue
        if label == "name" and current_name is None:
            current_name = value
            continue
        dim_key = context.normalize_dim_var_label(label)
        if not dim_key:
            continue
        parsed = context.parse_dim_var_value(dim_key, value)
        if parsed is not None:
            current_vars[dim_key] = parsed

    if in_record:
        finalize_record()
    return styles
