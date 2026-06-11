"""Dimension utility helpers for DWG parsing."""
from __future__ import annotations

import math
import re
from typing import Dict, List, Optional, Tuple

from server.dwg.common.colors import _aci_to_rgb_decimal, _resolve_rgb_color_decimal
from server.dwg.common.parse_utils import _parse_float_value, _parse_int_value


def _normalize_dimension_kind(dim_kind: object) -> str:
    raw = str(dim_kind or "").strip().lower()
    if raw in ("aligned", "rotated", "angular", "radius", "diameter", "ordinate", "arc_length"):
        return raw
    return "dimension"


def _dimension_subtype_from_kind(dim_kind: object) -> str:
    kind = _normalize_dimension_kind(dim_kind)
    if kind == "dimension":
        return "DIM_GENERIC"
    return f"DIM_{kind.upper()}"


def _normalize_dimblk_name(raw: object) -> Optional[str]:
    s = str(raw or "").strip()
    if not s:
        return None
    if s.lower() in ("null", "none"):
        return None
    return s


def _normalize_dim_var_label(label: object) -> Optional[str]:
    raw = re.sub(r"[^a-z0-9]+", "", str(label or "").strip().lower())
    if not raw:
        return None

    alias: Dict[str, str] = {
        "textstyle": "dimtxsty",
        "dimensiontextcolor": "dimclrt",
        "dimensionlinecolor": "dimclrd",
        "dimensionlinecolour": "dimclrd",
        "dimlinecolor": "dimclrd",
        "dimlinecolour": "dimclrd",
        "extensionlinecolor": "dimclre",
        "extensionlinecolour": "dimclre",
        "extensionlinescolor": "dimclre",
        "extensionlinescolour": "dimclre",
        "extlinecolor": "dimclre",
        "extlinecolour": "dimclre",
        "backgroundtextcolor": "dimtfillclr",
        "backgroundtextflags": "dimtfill",
        "backgroundfillflags": "dimtfill",
        "backgroundfillcolor": "dimtfillclr",
        "arrow1": "dimblk1",
        "arrow2": "dimblk2",
        "arrowblock1": "dimblk1",
        "arrowblock2": "dimblk2",
        "firstarrow": "dimblk1",
        "secondarrow": "dimblk2",
        "firstarrowhead": "dimblk1",
        "secondarrowhead": "dimblk2",
        "dimensionlinetype": "dimltype",
        "dimensionlinelinetype": "dimltype",
        "extensionline1linetype": "dimltex1",
        "extensionline2linetype": "dimltex2",
        "extensionlineonelinetype": "dimltex1",
        "extensionlinetwolinetype": "dimltex2",
        "fixedextensionline": "dimfxlenon",
        "fixedextensionlines": "dimfxlenon",
        "fixedextensionlinelength": "dimfxlen",
        "fixedlengthofextensionlines": "dimfxlen",
        "textmovement": "dimtmove",
        "textmove": "dimtmove",
        "movetext": "dimtmove",
        "textdirection": "dimtxtdirection",
        "textviewdirection": "dimtxtdirection",
        "textorientation": "dimtxtdirection",
        "fractiontype": "dimfrac",
        "fractionformat": "dimfrac",
    }
    if raw in alias:
        return alias[raw]

    if raw in ("dimensionstyle", "dimstyle"):
        return None
    if raw.startswith("dim") and len(raw) > 3:
        return raw
    return None


def _parse_dim_var_value(key: str, value: object) -> Optional[object]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if key in ("dimblk", "dimblk1", "dimblk2", "dimldrblk"):
        return _normalize_dimblk_name(raw)
    if key in ("dimtxsty",):
        return raw

    lower = raw.lower()
    if lower in ("true", "yes", "on", "ktrue"):
        return True
    if lower in ("false", "no", "off", "kfalse"):
        return False

    parsed_int = _parse_int_value(raw)
    if parsed_int is not None and re.fullmatch(r"[-+]?\d+", raw):
        return parsed_int

    parsed_float = _parse_float_value(raw)
    if isinstance(parsed_float, float) and math.isfinite(parsed_float):
        return parsed_float

    return raw


def _normalize_dim_var_map(source: object) -> Dict[str, object]:
    if not isinstance(source, dict):
        return {}
    out: Dict[str, object] = {}
    for k, v in source.items():
        nk = _normalize_dim_var_label(k)
        if not nk:
            continue
        parsed = _parse_dim_var_value(nk, v)
        if parsed is None:
            continue
        out[nk] = parsed
    return out


def _dimension_line_endpoints(
    ext1: Dict[str, float],
    ext2: Dict[str, float],
    dim_line_pt: Dict[str, float],
) -> Tuple[Dict[str, float], Dict[str, float]]:
    dx = float(ext2["x"]) - float(ext1["x"])
    dy = float(ext2["y"]) - float(ext1["y"])
    dn = math.hypot(dx, dy)
    if dn <= 1e-9:
        return dict(ext1), dict(ext2)
    ux = dx / dn
    uy = dy / dn
    nx = -uy
    ny = ux
    off = (float(dim_line_pt["x"]) - float(ext1["x"])) * nx + (float(dim_line_pt["y"]) - float(ext1["y"])) * ny
    p1 = {
        "x": float(ext1["x"]) + nx * off,
        "y": float(ext1["y"]) + ny * off,
        "z": float(ext1.get("z", 0.0)),
    }
    p2 = {
        "x": float(ext2["x"]) + nx * off,
        "y": float(ext2["y"]) + ny * off,
        "z": float(ext2.get("z", 0.0)),
    }
    return p1, p2


def _resolve_arrow_length(raw_size: object, base_len: float) -> float:
    base = float(base_len) if isinstance(base_len, (int, float)) and math.isfinite(float(base_len)) else 0.0
    base = max(0.0, base)
    soft_min = max(1e-6, base * 0.005)
    soft_max = max(soft_min * 4.0, base * 0.45) if base > 1e-6 else 1e9
    if isinstance(raw_size, (int, float)) and math.isfinite(float(raw_size)) and float(raw_size) > 0:
        wanted = float(raw_size)
        return max(soft_min, min(soft_max, wanted))
    if base > 1e-6:
        return max(soft_min, min(soft_max, base * 0.03))
    return 1.0


def _format_dimension_measurement_text(value: object) -> str:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return f"{float(value):.4f}"
    return ""


def _parse_int_value(value: object) -> Optional[int]:
    s = str(value or "").strip()
    if not s:
        return None
    if re.fullmatch(r"[-+]?\d+", s):
        try:
            return int(s)
        except Exception:
            return None
    try:
        v = float(s)
    except Exception:
        return None
    if not math.isfinite(v):
        return None
    return int(v)


def _resolve_dimension_display_text(geom: Dict[str, object]) -> str:
    from server.dwg.common.parse_utils import _clean_oda_text_value
    fallback_measure = _format_dimension_measurement_text(geom.get("measurement"))
    for key in (
        "text",
        "formatted_measurement",
        "display_text",
        "override_text",
        "contents",
        "plain_text",
        "value",
        "user_text",
        "text_override",
    ):
        cleaned = _clean_oda_text_value(geom.get(key))
        if not cleaned:
            continue
        normalized = cleaned.replace("<>", fallback_measure) if fallback_measure else cleaned
        compact = re.sub(r"\s+", "", normalized)
        if not compact or compact == "<>":
            continue
        return normalized
    return fallback_measure


def _resolve_dimension_text_color(
    *,
    override_raw: object,
    style_rec: Dict[str, object],
    dim_defaults: Dict[str, object],
    style_obj: Dict[str, object],
) -> Optional[str]:
    preferred_candidates = [
        override_raw,
        style_rec.get("dimclrt"),
        dim_defaults.get("dimclrt"),
    ]
    inherited_candidates = [
        style_obj.get("effective_color_rgb"),
        style_obj.get("effective_color"),
        style_obj.get("color"),
        style_obj.get("effective_color_index"),
        style_obj.get("color_index"),
    ]
    for candidate in preferred_candidates:
        if isinstance(candidate, (int, float)) and math.isfinite(float(candidate)):
            n = int(candidate)
            if n in (0, 256):
                continue
        if isinstance(candidate, str):
            token = candidate.strip().lower()
            if token in ("", "bylayer", "byblock", "default", "foreground"):
                continue
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    for candidate in inherited_candidates:
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    return None


def _resolve_dimension_text_mask_color(
    *,
    override_raw: object,
    style_rec: Dict[str, object],
    dim_defaults: Dict[str, object],
    style_obj: Dict[str, object],
) -> Optional[str]:
    preferred_candidates = [
        override_raw,
        style_rec.get("dimtfillclr"),
        dim_defaults.get("dimtfillclr"),
    ]
    inherited_candidates = [
        style_obj.get("effective_color_rgb"),
        style_obj.get("effective_color"),
        style_obj.get("color"),
        style_obj.get("effective_color_index"),
        style_obj.get("color_index"),
    ]
    for candidate in preferred_candidates:
        if isinstance(candidate, (int, float)) and math.isfinite(float(candidate)):
            n = int(candidate)
            if n in (0, 256):
                continue
        if isinstance(candidate, str):
            token = candidate.strip().lower()
            if token in ("", "bylayer", "byblock", "default", "foreground"):
                continue
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    for candidate in inherited_candidates:
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    return str(_aci_to_rgb_decimal(7))


def _resolve_dimension_text_mask_mode(
    *,
    override_raw: object,
    style_rec: Dict[str, object],
    dim_defaults: Dict[str, object],
) -> int:
    for candidate in (override_raw, style_rec.get("dimtfill"), dim_defaults.get("dimtfill")):
        parsed = _parse_int_value(candidate)
        if parsed is not None:
            return max(0, parsed)
    return 0


def _resolve_entity_text_color(ent: Dict[str, object], geom: Dict[str, object]) -> Optional[str]:
    style_obj = ent.get("style", {}) if isinstance(ent.get("style"), dict) else {}
    candidates = [
        geom.get("text_color"),
        geom.get("color"),
        style_obj.get("text_color"),
        style_obj.get("effective_color_rgb"),
        style_obj.get("effective_color"),
        style_obj.get("color"),
        style_obj.get("effective_color_index"),
        style_obj.get("color_index"),
    ]
    for candidate in candidates:
        resolved = _resolve_rgb_color_decimal(candidate)
        if resolved:
            return resolved
    return None


__all__ = [
    "_dimension_line_endpoints",
    "_dimension_subtype_from_kind",
    "_normalize_dimension_kind",
    "_normalize_dim_var_label",
    "_normalize_dim_var_map",
    "_normalize_dimblk_name",
    "_parse_dim_var_value",
    "_resolve_arrow_length",
    "_resolve_dimension_display_text",
    "_resolve_dimension_text_color",
    "_resolve_dimension_text_mask_color",
    "_resolve_dimension_text_mask_mode",
    "_resolve_entity_text_color",
]
