"""Block name resolution helpers for DWG."""
from __future__ import annotations

from typing import Dict, Optional, Tuple


def _space_from_block_name(block_name: str) -> Tuple[str, str, str]:
    name = block_name.strip()
    upper = name.upper()
    if upper == "*MODEL_SPACE":
        return "model", "Model", "model"
    if upper.startswith("*PAPER_SPACE"):
        suffix = name[len("*Paper_Space") :] if name.startswith("*Paper_Space") else name[len("*PAPER_SPACE") :]
        display_name = f"Layout{suffix}" if suffix else "Layout1"
        return f"layout:{name}", display_name, "layout"
    clean = name.lstrip("*") or "Layout"
    return f"layout:{clean}", clean, "layout"


def _block_ref_id_from_instance_path(instance_path: Tuple[str, ...]) -> Optional[str]:
    if not instance_path:
        return None
    return f"BLOCK_REF@{'/'.join(instance_path)}"


__all__ = ["_block_ref_id_from_instance_path", "_space_from_block_name"]
