"""Color parsing and resolution helpers for DWG."""
from __future__ import annotations

import math
import re
from typing import Optional


def _aci_to_rgb_decimal(aci: int) -> int:
    idx = int(aci)
    if idx in (0, 256):
        idx = 7
    if idx < 0:
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
    return basic.get(idx, 0xCCCCCC)


def _parse_aci_from_color_name(value: object) -> Optional[int]:
    s = str(value or "").strip()
    if not s:
        return None
    sl = s.lower()
    if sl == "bylayer":
        return 256
    if sl == "byblock":
        return 0
    if sl == "foreground":
        return 7
    m = re.search(r"aci\s*(-?\d+)", s, flags=re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    if re.fullmatch(r"-?\d+", s):
        try:
            return int(s)
        except Exception:
            return None
    return None


def _parse_true_rgb_decimal(value: object) -> Optional[str]:
    s = str(value or "").strip()
    if not s:
        return None
    m = re.search(
        r"\br\s*[:=]?\s*([0-9]{1,3})\D+\bg\s*[:=]?\s*([0-9]{1,3})\D+\bb\s*[:=]?\s*([0-9]{1,3})",
        s,
        flags=re.IGNORECASE,
    )
    if not m:
        m = re.search(
            r"\br\s*([0-9]{1,3})\s*[,; ]+\s*g\s*([0-9]{1,3})\s*[,; ]+\s*b\s*([0-9]{1,3})",
            s,
            flags=re.IGNORECASE,
        )
    if not m:
        m = re.search(
            r"\br\s*[:=]\s*([0-9]{1,3}).*?\bg\s*[:=]\s*([0-9]{1,3}).*?\bb\s*[:=]\s*([0-9]{1,3})",
            s,
            flags=re.IGNORECASE,
        )
    if not m:
        return None
    try:
        r = max(0, min(255, int(m.group(1))))
        g = max(0, min(255, int(m.group(2))))
        b = max(0, min(255, int(m.group(3))))
    except Exception:
        return None
    return str((r << 16) | (g << 8) | b)


def _resolve_rgb_color_decimal(raw: object, fallback_aci: Optional[int] = None) -> Optional[str]:
    if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
        n = int(raw)
        if 0 <= n <= 256:
            return str(_aci_to_rgb_decimal(n))
        if n < 0:
            return str(_aci_to_rgb_decimal(7))
        return str(max(0, min(0xFFFFFF, n)))

    s = str(raw or "").strip()
    if s:
        sl = s.lower()
        true_rgb = _parse_true_rgb_decimal(s)
        if true_rgb:
            return true_rgb
        if sl.startswith("#"):
            try:
                return str(max(0, min(0xFFFFFF, int(sl[1:], 16))))
            except Exception:
                pass
        if sl.startswith("0x"):
            try:
                return str(max(0, min(0xFFFFFF, int(sl[2:], 16))))
            except Exception:
                pass
        if re.fullmatch(r"\d+", s):
            try:
                n = int(s)
                if 0 <= n <= 256:
                    return str(_aci_to_rgb_decimal(n))
                return str(max(0, min(0xFFFFFF, n)))
            except Exception:
                pass
        aci = _parse_aci_from_color_name(s)
        if aci is not None:
            return str(_aci_to_rgb_decimal(aci))

    if fallback_aci is not None:
        return str(_aci_to_rgb_decimal(fallback_aci))
    return None


__all__ = [
    "_aci_to_rgb_decimal",
    "_parse_aci_from_color_name",
    "_parse_true_rgb_decimal",
    "_resolve_rgb_color_decimal",
]
