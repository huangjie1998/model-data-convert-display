#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server.dwg_service_core import DwgServiceCore

CRITICAL_TYPES = ("DIMENSION", "TEXT", "MTEXT", "POLYLINE", "LINE")
CRITICAL_SUBTYPES = (
    "TEXT",
    "MTEXT",
    "ATTRIB",
    "ATTDEF",
    "DIM_ALIGNED",
    "DIM_ROTATED",
    "DIM_ANGULAR",
    "DIM_RADIUS",
    "DIM_DIAMETER",
    "DIM_ORDINATE",
    "DIM_ARC_LENGTH",
)
REQUIRED_NODE_FIELDS = ("node_id", "node_kind", "label", "type", "semantic_type", "semantic_subtype", "layer", "entity_id", "render_state")


def _has_semantic_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def _required_semantic_keys(entity: Dict[str, object]) -> List[str]:
    etype = str(entity.get("type") or "").strip().upper()
    required = ["layer", "color_index", "lineweight_mm", "linetype"]
    if etype in ("TEXT", "MTEXT"):
        required.extend(["text", "text_position", "text_style"])
    elif etype in ("ATTRIB", "ATTDEF"):
        required.extend(["text_position", "text_style"])
    if etype == "DIMENSION":
        required.extend(["dim_kind", "dimension_style", "text_position", "text_height", "primitive_count"])
    return required


def _semantic_issues(entities: Iterable[Dict[str, object]]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for entity in entities:
        etype = str(entity.get("type") or "").strip().upper()
        if etype not in ("DIMENSION", "TEXT", "MTEXT", "ATTRIB", "ATTDEF"):
            continue
        entity_id = str(entity.get("id") or "").strip()
        mapping = entity.get("mapping_status") if isinstance(entity.get("mapping_status"), dict) else {}
        normalized = entity.get("normalized_semantics") if isinstance(entity.get("normalized_semantics"), dict) else {}
        provenance = entity.get("provenance") if isinstance(entity.get("provenance"), dict) else {}
        if not mapping:
            out.append((entity_id, "missing_mapping_status"))
            continue
        if mapping.get("ok") is not True:
            out.append((entity_id, "mapping_not_ok"))
        if mapping.get("source_trace_complete") is not True:
            out.append((entity_id, "source_trace_incomplete"))
        missing_keys = mapping.get("missing_keys")
        if isinstance(missing_keys, list):
            for key in missing_keys:
                ks = str(key or "").strip()
                if ks:
                    out.append((entity_id, f"mapping_missing:{ks}"))
        for key in _required_semantic_keys(entity):
            if not _has_semantic_value(normalized.get(key)):
                out.append((entity_id, f"normalized_missing:{key}"))
            elif not _has_semantic_value(provenance.get(key)):
                out.append((entity_id, f"provenance_missing:{key}"))
    return out


def _resolve_default_drawing1_path() -> Optional[Path]:
    env_path = os.environ.get("DRAWING1_DWG_PATH", "").strip()
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists() and p.is_file():
            return p

    desktop = Path.home() / "Desktop"
    if desktop.exists():
        for candidate in desktop.rglob("Drawing1.dwg"):
            if candidate.is_file():
                return candidate.resolve()

    return None


def _copy_to_ascii_path(src: Path) -> Tuple[Path, Path]:
    tmp_dir = Path(tempfile.mkdtemp(prefix="dwg-tree-check-"))
    dst = tmp_dir / "Drawing1_ascii.dwg"
    shutil.copy2(src, dst)
    return dst, tmp_dir


def _flatten_leaf_nodes(nodes: Iterable[Dict[str, object]]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    stack = list(nodes)
    while stack:
        node = stack.pop()
        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    stack.append(child)
        kind = str(node.get("node_kind") or "").strip().lower()
        if kind in ("entity", "block_ref"):
            out.append(node)
    return out


def _count_by_type(items: Iterable[Dict[str, object]]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for item in items:
        counter[str(item.get("type") or "").strip().upper()] += 1
    return counter


def _normalize_dim_subtype(kind_raw: object) -> str:
    kind = str(kind_raw or "").strip().lower()
    if kind == "aligned":
        return "DIM_ALIGNED"
    if kind == "rotated":
        return "DIM_ROTATED"
    if kind == "angular":
        return "DIM_ANGULAR"
    if kind == "radius":
        return "DIM_RADIUS"
    if kind == "diameter":
        return "DIM_DIAMETER"
    if kind == "ordinate":
        return "DIM_ORDINATE"
    if kind == "arc_length":
        return "DIM_ARC_LENGTH"
    return "DIM_GENERIC"


def _entity_subtype(entity: Dict[str, object]) -> str:
    semantic = str(entity.get("semantic_subtype") or "").strip().upper()
    if semantic:
        return semantic
    etype = str(entity.get("type") or "").strip().upper()
    if etype == "DIMENSION":
        geom = entity.get("geom") if isinstance(entity.get("geom"), dict) else {}
        dim_payload = geom.get("dimension_payload") if isinstance(geom.get("dimension_payload"), dict) else {}
        return _normalize_dim_subtype(dim_payload.get("dim_kind") or geom.get("dim_kind"))
    return etype or "UNKNOWN"


def _node_subtype(node: Dict[str, object]) -> str:
    entity_subtype = str(node.get("entity_subtype") or "").strip().upper()
    if entity_subtype:
        return entity_subtype
    semantic = str(node.get("semantic_subtype") or "").strip().upper()
    if semantic:
        return semantic
    return str(node.get("type") or "").strip().upper() or "UNKNOWN"


def _count_entity_subtypes(items: Iterable[Dict[str, object]]) -> Counter[str]:
    out: Counter[str] = Counter()
    for item in items:
        out[_entity_subtype(item)] += 1
    return out


def _count_node_subtypes(items: Iterable[Dict[str, object]]) -> Counter[str]:
    out: Counter[str] = Counter()
    for item in items:
        out[_node_subtype(item)] += 1
    return out


def _normalize_entity_ids(values: Iterable[object]) -> List[str]:
    out: List[str] = []
    for value in values:
        entity_id = str(value or "").strip()
        if entity_id:
            out.append(entity_id)
    return out


def _set_diff(left: Iterable[str], right: Iterable[str]) -> List[str]:
    right_set = set(right)
    out = sorted({item for item in left if item not in right_set})
    return out


def _missing_required_fields(nodes: Iterable[Dict[str, object]]) -> List[Tuple[str, List[str]]]:
    out: List[Tuple[str, List[str]]] = []
    for node in nodes:
        missing: List[str] = []
        for field in REQUIRED_NODE_FIELDS:
            raw = node.get(field)
            if field == "render_state":
                if not isinstance(raw, dict):
                    missing.append(field)
                continue
            if raw is None or str(raw).strip() == "":
                missing.append(field)
        if missing:
            out.append((str(node.get("node_id") or ""), missing))
    return out


def _print_summary(title: str, values: Dict[str, object]) -> None:
    print(f"[{title}]")
    for key, value in values.items():
        print(f"{key}: {value}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Drawing1 DWG tree consistency (entities vs hierarchy).")
    parser.add_argument("--dwg-path", type=str, default="", help="Path to Drawing1.dwg. Defaults to DRAWING1_DWG_PATH or Desktop recursive search.")
    parser.add_argument("--space-id", type=str, default="model", help="Space id to check (default: model).")
    parser.add_argument("--limit", type=int, default=500000, help="Entity API limit for check run.")
    args = parser.parse_args()

    drawing_path: Optional[Path]
    if args.dwg_path.strip():
        drawing_path = Path(args.dwg_path).expanduser().resolve()
        if not drawing_path.exists():
            print(f"[error] DWG file not found: {drawing_path}")
            return 2
    else:
        drawing_path = _resolve_default_drawing1_path()
        if drawing_path is None:
            print("[error] Drawing1.dwg not found. Set --dwg-path or DRAWING1_DWG_PATH.")
            return 2

    if drawing_path.name.lower() != "drawing1.dwg":
        print(f"[warn] input file name is {drawing_path.name} (expected Drawing1.dwg)")

    core = DwgServiceCore(REPO_ROOT / "server" / "uploads")
    ascii_copy, tmp_dir = _copy_to_ascii_path(drawing_path)
    doc_id = ""
    try:
        print(f"[info] source={drawing_path}")
        print(f"[info] open_copy={ascii_copy}")
        opened = core.open_document(ascii_copy, drawing_path.name)
        doc_id = str(opened.get("doc_id") or "").strip()
        if not doc_id:
            print("[error] empty doc_id from open_document")
            return 3

        entities_resp = core.list_entities(doc_id, space_id=args.space_id, limit=max(1000, int(args.limit))) or {}
        hierarchy_resp = core.list_hierarchy(doc_id, space_id=args.space_id) or {}
        hierarchy_resp_2 = core.list_hierarchy(doc_id, space_id=args.space_id) or {}

        entities = [item for item in (entities_resp.get("entities") or []) if isinstance(item, dict)]
        hierarchy_nodes = [item for item in (hierarchy_resp.get("nodes") or []) if isinstance(item, dict)]
        hierarchy_nodes_2 = [item for item in (hierarchy_resp_2.get("nodes") or []) if isinstance(item, dict)]

        leaf_nodes = _flatten_leaf_nodes(hierarchy_nodes)
        leaf_nodes_2 = _flatten_leaf_nodes(hierarchy_nodes_2)

        entity_ids = _normalize_entity_ids(item.get("id") for item in entities)
        hierarchy_ids = _normalize_entity_ids(item.get("entity_id") for item in leaf_nodes)
        hierarchy_ids_2 = _normalize_entity_ids(item.get("entity_id") for item in leaf_nodes_2)

        entity_type_counter = _count_by_type(entities)
        node_type_counter = _count_by_type(leaf_nodes)
        entity_subtype_counter = _count_entity_subtypes(entities)
        node_subtype_counter = _count_node_subtypes(leaf_nodes)

        type_mismatches: List[Tuple[str, int, int]] = []
        for t in CRITICAL_TYPES:
            ec = entity_type_counter.get(t, 0)
            hc = node_type_counter.get(t, 0)
            if ec != hc:
                type_mismatches.append((t, ec, hc))
        subtype_mismatches: List[Tuple[str, int, int]] = []
        for s in CRITICAL_SUBTYPES:
            ec = entity_subtype_counter.get(s, 0)
            hc = node_subtype_counter.get(s, 0)
            if ec != hc:
                subtype_mismatches.append((s, ec, hc))

        missing_in_tree = _set_diff(entity_ids, hierarchy_ids)
        extra_in_tree = _set_diff(hierarchy_ids, entity_ids)
        required_missing = _missing_required_fields(leaf_nodes)
        semantic_issues = _semantic_issues(entities)
        order_stable = hierarchy_ids == hierarchy_ids_2

        _print_summary(
            "summary",
            {
                "space_id": args.space_id,
                "entity_count": len(entities),
                "hierarchy_leaf_count": len(leaf_nodes),
                "entity_type_counts": dict(entity_type_counter),
                "hierarchy_type_counts": dict(node_type_counter),
                "entity_subtype_counts": dict(entity_subtype_counter),
                "hierarchy_subtype_counts": dict(node_subtype_counter),
                "type_mismatches": type_mismatches,
                "subtype_mismatches": subtype_mismatches,
                "missing_in_tree_count": len(missing_in_tree),
                "extra_in_tree_count": len(extra_in_tree),
                "required_fields_missing_count": len(required_missing),
                "semantic_issue_count": len(semantic_issues),
                "order_stable_requery": order_stable,
            },
        )

        if missing_in_tree:
            print(f"[missing_in_tree] sample={missing_in_tree[:20]}")
        if extra_in_tree:
            print(f"[extra_in_tree] sample={extra_in_tree[:20]}")
        if required_missing:
            preview = [{"node_id": nid, "missing": miss} for nid, miss in required_missing[:10]]
            print(f"[missing_required_fields] sample={preview}")
        if semantic_issues:
            preview = [{"entity_id": eid, "issue": issue} for eid, issue in semantic_issues[:20]]
            print(f"[semantic_issues] sample={preview}")

        failed = (
            len(type_mismatches) > 0
            or len(subtype_mismatches) > 0
            or len(missing_in_tree) > 0
            or len(extra_in_tree) > 0
            or len(required_missing) > 0
            or len(semantic_issues) > 0
            or not order_stable
        )
        if failed:
            print("[result] FAIL")
            return 1

        print("[result] PASS")
        return 0
    finally:
        if doc_id:
            core.close_document(doc_id)
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
