from __future__ import annotations

from typing import Dict


def entity_bbox(raw: Dict[str, object]) -> Dict[str, object]:
    bbox = raw.get("bbox")
    return dict(bbox) if isinstance(bbox, dict) else {}


def entity_geometry(raw: Dict[str, object]) -> Dict[str, object]:
    geom = raw.get("geom")
    return dict(geom) if isinstance(geom, dict) else {}


def entity_style(raw: Dict[str, object]) -> Dict[str, object]:
    style = raw.get("style")
    return dict(style) if isinstance(style, dict) else {}
