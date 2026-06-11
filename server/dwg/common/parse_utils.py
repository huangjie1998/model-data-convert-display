"""Parse utilities for ODA dump text processing."""
from __future__ import annotations

import math
import re
from typing import Dict, Optional, Tuple

_NUM_RE = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
_POINT_VALUE_RE = re.compile(rf"^\[\s*({_NUM_RE})\s+({_NUM_RE})(?:\s+({_NUM_RE}))?\s*\]$")
# 正则保留宽松匹配（兼容 ODA dump 里 ". . ."、"......"、". .  ."等各种 separator
# 形式）。注意：正则里的 \s* 会贪婪吞掉 value 的前导空格——所以**不要**直接用
# m.group("value")，必须用 _parse_label_value 里的后处理回切。
_LABEL_VALUE_RE = re.compile(r"^\s*(?P<label>[^.].*?)\s*(?:\.\s*){3,}(?P<value>.+?)\s*$")
_ENTITY_START_RE = re.compile(
    r"^\s*<(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)
_VECTORIZE_ENTITY_START_RE = re.compile(
    r"^\s*>*\s*Start Drawing <(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)
_VECTORIZE_ENTITY_END_RE = re.compile(
    r"^\s*>*\s*End Drawing <(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)
_VECTORIZE_VERTEX_RE = re.compile(
    r"^\s*Vertex\[\d+\]\s*(?:\.\s*)*\[(?P<point>[^\]]+)\]\s*$"
)

TEXT_ENTITY_TYPES = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}


def _normalize_label(label: str) -> str:
    normalized = re.sub(r"\s+", " ", label.strip().lower())
    return re.sub(r"[:：]+$", "", normalized)


def _parse_label_value(line: str) -> Tuple[Optional[str], Optional[str]]:
    m = _LABEL_VALUE_RE.match(line)
    if not m:
        return None, None
    label = _normalize_label(m.group("label"))
    # 关键：m.group("value") 的前导空格已被 _LABEL_VALUE_RE 里的 \s* 贪婪吞掉。
    # 从原行里回切才能保留 value 的前导空格（例如 TEXT "  AB" 的排版意图）。
    val_start = m.start("value")
    sep_section = line[:val_start]
    last_dot = sep_section.rfind(".")
    if last_dot < 0:
        value = m.group("value").rstrip()
    else:
        # separator 末尾 '.' 之后的字符就是真正的 value 段；跳过恰好一个
        # 分隔空格（如果有），剩下的空格属于 value 自身的前导。
        after_dot = line[last_dot + 1 :]
        if after_dot.startswith(" "):
            after_dot = after_dot[1:]
        # 尾部空格视为脏数据：rstrip 清掉
        value = after_dot.rstrip()
    return label, value


def _parse_point_value(value: str) -> Optional[Dict[str, float]]:
    m = _POINT_VALUE_RE.match(value.strip())
    if not m:
        return None
    x = float(m.group(1))
    y = float(m.group(2))
    z = float(m.group(3)) if m.group(3) is not None else 0.0
    return {"x": x, "y": y, "z": z}


def _parse_float_value(value: str) -> Optional[float]:
    v = value.strip().rstrip("dD")
    try:
        return float(v)
    except Exception:
        return None


def _lineweight_to_mm(raw: object) -> Optional[float]:
    text = str(raw or "").strip()
    if not text:
        return None
    lower = text.lower()
    if lower in ("default", "bylayer", "byblock", "klnwtbylayer", "klnwtbyblock", "klnwtbylwdefault"):
        return None
    m = re.match(r"^klnwt(\d+)$", lower)
    if m:
        try:
            centi_mm = int(m.group(1))
            if centi_mm <= 0:
                return None
            return float(centi_mm) / 100.0
        except Exception:
            return None
    try:
        n = float(text)
        if math.isfinite(n) and n > 0:
            return n
    except Exception:
        return None
    return None


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


def _is_text_entity_type(ent_type: object) -> bool:
    return str(ent_type or "").strip().upper() in TEXT_ENTITY_TYPES


def _clean_oda_text_value(raw: object) -> str:
    s = str(raw or "")
    if s == '""':
        return ""

    def _decode_unicode_escape(match: re.Match[str]) -> str:
        code_hex = match.group(1)
        try:
            cp = int(code_hex, 16)
            if 0 <= cp <= 0x10FFFF:
                return chr(cp)
        except Exception:
            pass
        return ""

    def _decode_stacked_text(match: re.Match[str]) -> str:
        token = str(match.group(1) or "").strip()
        if not token:
            return ""
        sep_match = re.search(r"[\^#/]", token)
        if not sep_match:
            return token
        sep = sep_match.group(0)
        idx = token.find(sep)
        if idx <= 0 or idx >= len(token) - 1:
            return token
        top = token[:idx].strip()
        bottom = token[idx + 1 :].strip()
        if not top and not bottom:
            return ""
        if not bottom:
            return top
        if not top:
            return bottom
        return f"{top}/{bottom}"

    s = re.sub(r"\\U\+([0-9A-Fa-f]{4,8})", _decode_unicode_escape, s)
    s = re.sub(r"\\S([^;]*);", _decode_stacked_text, s, flags=re.IGNORECASE)
    s = s.replace("\\P", "\n").replace("\\p", "\n")
    s = re.sub(r"%%c", "⌀", s, flags=re.IGNORECASE)
    s = re.sub(r"%%d", "°", s, flags=re.IGNORECASE)
    s = re.sub(r"%%p", "±", s, flags=re.IGNORECASE)
    # NOTE: %%nnn (numeric glyph codes like %%142) are SHX font-internal indices,
    # not Unicode code points. Decoding requires knowing the specific font's glyph
    # table. These codes are left as-is for the engine to handle.
    s = re.sub(r"\\(?![Pp]|[Ss]|U\+)[A-Za-z][^;]*;", "", s)
    s = re.sub(r"\\(?=[<>0-9+\-\.])", "", s)
    s = s.replace("\\~", " ")
    s = s.replace("{", "").replace("}", "")
    s = s.replace("\r", "")
    s = s.replace("\\\\", "\\")
    # 保留前导空格作为用户排版意图（例如 TEXT "  AB"）。
    # ODA dump 的 value 有两种形式：
    #   1) 带双引号包裹："  AB"  → 剥引号，保留引号内的所有空格
    #   2) 无引号：  AB         → 只 rstrip 尾部空格，前导空格不动
    # 旧实现 .strip().strip('"') 会把无引号形式的前导空格也吃光。
    if len(s) >= 2 and s.startswith('"') and s.endswith('"'):
        return s[1:-1]
    return s.rstrip()


__all__ = [
    "_ENTITY_START_RE",
    "_VECTORIZE_ENTITY_END_RE",
    "_VECTORIZE_ENTITY_START_RE",
    "_VECTORIZE_VERTEX_RE",
    "_clean_oda_text_value",
    "_is_text_entity_type",
    "_lineweight_to_mm",
    "_parse_float_value",
    "_parse_int_value",
    "_parse_label_value",
    "_parse_point_value",
]
