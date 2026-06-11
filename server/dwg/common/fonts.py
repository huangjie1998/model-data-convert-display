"""Font detection and normalization helpers for DWG."""
from __future__ import annotations

import re
from pathlib import Path


def _normalize_font_token(value: object) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    base = Path(raw).stem
    return re.sub(r"[^a-z0-9]+", "", base)


def _detect_font_kind(value: object) -> str:
    ext = Path(str(value or "")).suffix.lower()
    if ext in (".ttf", ".ttc", ".otf"):
        return ext[1:]
    if ext == ".shx":
        return "shx"
    return "unknown"


def _font_family_from_name(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    stem = Path(raw).stem.strip()
    return stem or raw


def _sanitize_font_key(value: object) -> str:
    token = _normalize_font_token(value)
    return token or "default"


def _normalize_entity_instance_key(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "@" not in raw:
        return raw.upper()
    base_raw, path_raw = raw.split("@", 1)
    base = base_raw.strip().upper()
    path_parts = [seg.strip().upper() for seg in path_raw.split("/") if seg.strip()]
    if not path_parts:
        return base
    return f"{base}@{'/'.join(path_parts)}"


__all__ = [
    "_detect_font_kind",
    "_font_family_from_name",
    "_normalize_entity_instance_key",
    "_normalize_font_token",
    "_sanitize_font_key",
]
