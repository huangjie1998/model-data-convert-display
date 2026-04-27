#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server.dwg_service_core import DwgServiceCore


def _is_ascii_path(p: Path) -> bool:
    try:
        str(p).encode("ascii")
        return True
    except Exception:
        return False


def _open_with_ascii_copy(core: DwgServiceCore, src: Path) -> Tuple[Dict[str, object], Path | None]:
    if _is_ascii_path(src):
        return core.open_document(src, src.name), None

    tmp_dir = Path(tempfile.mkdtemp(prefix="dwg-debug-"))
    tmp_file = tmp_dir / "input_ascii_name.dwg"
    shutil.copy2(src, tmp_file)
    return core.open_document(tmp_file, src.name), tmp_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Debug DWG text/dimension parse-render pipeline.")
    parser.add_argument("dwg_path", type=str, help="Path to DWG file")
    parser.add_argument("--space-id", type=str, default="model", help="Space id (default: model)")
    parser.add_argument("--limit", type=int, default=200000, help="Entity list limit")
    args = parser.parse_args()

    root = REPO_ROOT
    dwg_path = Path(args.dwg_path).resolve()
    if not dwg_path.exists():
        print(f"[error] file not found: {dwg_path}")
        return 2

    core = DwgServiceCore(root / "server" / "uploads")
    print(f"[info] mode={core.mode}")
    print(f"[info] opening={dwg_path}")

    opened: Dict[str, object]
    temp_dir: Path | None = None
    try:
        opened, temp_dir = _open_with_ascii_copy(core, dwg_path)
        doc_id = str(opened.get("doc_id") or "").strip()
        print(f"[open] doc_id={doc_id}")
        print(f"[open] warnings={opened.get('warnings')}")
        print(f"[open] spaces={[s.get('id') for s in (opened.get('spaces') or []) if isinstance(s, dict)]}")

        if not doc_id:
            print("[error] open_document returned empty doc_id")
            return 3

        entities_resp = core.list_entities(doc_id, space_id=args.space_id, limit=max(1000, args.limit)) or {}
        items: List[Dict[str, object]] = [x for x in (entities_resp.get("entities") or []) if isinstance(x, dict)]
        print(f"[entities] space={args.space_id} total={entities_resp.get('total_count')} returned={len(items)} truncated={entities_resp.get('truncated')}")

        type_counter = Counter(str(ent.get("type") or "").upper() for ent in items)
        print(f"[entities] type_top={type_counter.most_common(20)}")

        text_like_types = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}
        text_like = [ent for ent in items if str(ent.get("type") or "").upper() in text_like_types]
        dimensions = [ent for ent in items if str(ent.get("type") or "").upper() == "DIMENSION"]
        print(f"[text] text_like_count={len(text_like)}")
        print(f"[dimension] count={len(dimensions)}")

        if dimensions:
            dim_kind_counter: Counter[str] = Counter()
            dim_style_counter: Counter[str] = Counter()
            nonempty_text = 0
            with_text_pos = 0
            with_text_prim = 0
            for ent in dimensions:
                geom = ent.get("geom") if isinstance(ent.get("geom"), dict) else {}
                style = ent.get("style") if isinstance(ent.get("style"), dict) else {}

                text_raw = str(geom.get("text") or "").strip()
                fm_raw = str(geom.get("formatted_measurement") or "").strip()
                if text_raw or fm_raw:
                    nonempty_text += 1
                if isinstance(geom.get("text_position"), dict):
                    with_text_pos += 1

                dim_kind_counter[str(geom.get("dim_kind") or "").strip() or ""] += 1
                style_name = str(
                    geom.get("style_name")
                    or geom.get("text_style")
                    or geom.get("font_style_name")
                    or style.get("text_style")
                    or ""
                ).strip()
                if style_name:
                    dim_style_counter[style_name] += 1

                prims = geom.get("primitives") if isinstance(geom.get("primitives"), list) else []
                if any(isinstance(p, dict) and str(p.get("kind") or "").lower() == "text" for p in prims):
                    with_text_prim += 1

            print(f"[dimension] nonempty_text={nonempty_text}/{len(dimensions)} text_pos={with_text_pos}/{len(dimensions)} text_primitive={with_text_prim}/{len(dimensions)}")
            print(f"[dimension] dim_kind={dict(dim_kind_counter)}")
            print(f"[dimension] text_style_top={dim_style_counter.most_common(15)}")
            sample = dimensions[0]
            print(f"[dimension] sample_id={sample.get('id')}")
            print(f"[dimension] sample_geom={sample.get('geom')}")

    finally:
        try:
            doc_id = str((opened or {}).get("doc_id") or "").strip()  # type: ignore[name-defined]
        except Exception:
            doc_id = ""
        if doc_id:
            core.close_document(doc_id)
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
