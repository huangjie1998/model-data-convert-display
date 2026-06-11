"""2D affine transform helpers for DWG."""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from server.dwg.common.geometry import _bbox_from_points

Affine2D = Tuple[float, float, float, float, float, float]


def _compose_affine(parent: Affine2D, local: Affine2D) -> Affine2D:
    p00, p01, p10, p11, ptx, pty = parent
    l00, l01, l10, l11, ltx, lty = local
    return (
        p00 * l00 + p01 * l10,
        p00 * l01 + p01 * l11,
        p10 * l00 + p11 * l10,
        p10 * l01 + p11 * l11,
        p00 * ltx + p01 * lty + ptx,
        p10 * ltx + p11 * lty + pty,
    )


def _apply_affine(tf: Affine2D, p: Dict[str, float]) -> Dict[str, float]:
    m00, m01, m10, m11, tx, ty = tf
    x = float(p.get("x", 0.0))
    y = float(p.get("y", 0.0))
    return {
        "x": m00 * x + m01 * y + tx,
        "y": m10 * x + m11 * y + ty,
        "z": float(p.get("z", 0.0)),
    }


def _apply_linear(tf: Affine2D, v: Dict[str, float]) -> Dict[str, float]:
    m00, m01, m10, m11, _, _ = tf
    x = float(v.get("x", 0.0))
    y = float(v.get("y", 0.0))
    return {"x": m00 * x + m01 * y, "y": m10 * x + m11 * y, "z": float(v.get("z", 0.0))}


def _affine_scales(tf: Affine2D) -> Tuple[float, float]:
    m00, m01, m10, m11, _, _ = tf
    sx = math.hypot(m00, m10)
    sy = math.hypot(m01, m11)
    return sx, sy


def _apply_bbox_affine(tf: Affine2D, bbox_obj: object) -> Optional[Dict[str, Dict[str, float]]]:
    if not isinstance(bbox_obj, dict):
        return None
    bmin = bbox_obj.get("min")
    bmax = bbox_obj.get("max")
    if not isinstance(bmin, dict) or not isinstance(bmax, dict):
        return None
    corners = [
        {"x": float(bmin.get("x", 0.0)), "y": float(bmin.get("y", 0.0)), "z": float(bmin.get("z", 0.0))},
        {"x": float(bmin.get("x", 0.0)), "y": float(bmax.get("y", 0.0)), "z": float(bmin.get("z", 0.0))},
        {"x": float(bmax.get("x", 0.0)), "y": float(bmin.get("y", 0.0)), "z": float(bmax.get("z", 0.0))},
        {"x": float(bmax.get("x", 0.0)), "y": float(bmax.get("y", 0.0)), "z": float(bmax.get("z", 0.0))},
    ]
    mapped = [_apply_affine(tf, c) for c in corners]
    return _bbox_from_points(mapped)


def _bbox_from_points(points: List[Dict[str, float]]) -> Optional[Dict[str, Dict[str, float]]]:
    if not points:
        return None
    xs = [float(p["x"]) for p in points]
    ys = [float(p["y"]) for p in points]
    zs = [float(p.get("z", 0.0)) for p in points]
    return {
        "min": {"x": min(xs), "y": min(ys), "z": min(zs)},
        "max": {"x": max(xs), "y": max(ys), "z": max(zs)},
    }


__all__ = ["Affine2D", "_affine_scales", "_apply_affine", "_apply_bbox_affine", "_apply_linear", "_compose_affine"]
