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

CRITICAL_TYPES = ("DIMENSION", "TEXT", "MTEXT", "ATTRIB", "ATTDEF", "POLYLINE", "LINE")
CRITICAL_SEMANTIC_TYPES = ("DIMENSION", "TEXT", "MTEXT", "ATTRIB", "ATTDEF")
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
RENDERABLE_KINDS = {"line", "polyline", "polygon", "arc", "circle", "ellipse", "point", "text"}


def _resolve_file_from_env_or_search(
    explicit_path: str,
    env_var: str,
    exact_name: Optional[str],
    fuzzy_glob: Optional[str],
) -> Optional[Path]:
    if explicit_path.strip():
        p = Path(explicit_path).expanduser().resolve()
        if p.exists() and p.is_file():
            return p
        return None

    env_path = os.environ.get(env_var, "").strip()
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists() and p.is_file():
            return p
        return None

    desktop = Path.home() / "Desktop"
    if not desktop.exists():
        return None

    if exact_name:
        for candidate in desktop.rglob(exact_name):
            if candidate.is_file():
                return candidate.resolve()

    if fuzzy_glob:
        for candidate in desktop.rglob(fuzzy_glob):
            if candidate.is_file():
                return candidate.resolve()

    return None


def _copy_to_ascii_path(src: Path) -> Tuple[Path, Path]:
    tmp_dir = Path(tempfile.mkdtemp(prefix="dwg-accept-"))
    safe_name = src.name.encode("ascii", errors="ignore").decode("ascii")
    dst = (tmp_dir / safe_name) if safe_name else (tmp_dir / "input_ascii.dwg")
    if dst.suffix.lower() != ".dwg":
        dst = tmp_dir / "input_ascii.dwg"
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


def _filter_nodes_by_kind(nodes: Iterable[Dict[str, object]], node_kind: str) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    for node in nodes:
        if str(node.get("node_kind") or "").strip().lower() == node_kind:
            out.append(node)
    return out


def _count_by_type(items: Iterable[Dict[str, object]]) -> Counter[str]:
    out: Counter[str] = Counter()
    for item in items:
        out[str(item.get("type") or "").strip().upper()] += 1
    return out


def _normalize_entity_id(v: object) -> str:
    return str(v or "").strip()


def _set_diff(left: Iterable[str], right: Iterable[str]) -> List[str]:
    right_set = set(right)
    return sorted({item for item in left if item not in right_set})


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


def _count_entity_subtypes(entities: Iterable[Dict[str, object]]) -> Counter[str]:
    out: Counter[str] = Counter()
    for entity in entities:
        out[_entity_subtype(entity)] += 1
    return out


def _count_node_subtypes(nodes: Iterable[Dict[str, object]]) -> Counter[str]:
    out: Counter[str] = Counter()
    for node in nodes:
        out[_node_subtype(node)] += 1
    return out


def _is_renderable_primitive(primitive: Dict[str, object]) -> bool:
    kind = str(primitive.get("kind") or "").strip().lower()
    return kind in RENDERABLE_KINDS


def _entity_renderable(core: DwgServiceCore, entity: Dict[str, object]) -> Tuple[bool, int, bool, List[Dict[str, object]]]:
    primitives = [p for p in core._entity_primitives(entity) if isinstance(p, dict)]  # pylint: disable=protected-access
    renderable = any(_is_renderable_primitive(p) for p in primitives)
    has_text = any(str(p.get("kind") or "").strip().lower() == "text" for p in primitives)
    return renderable, len(primitives), has_text, primitives


def _normalize_dim_block_name(raw: object) -> str:
    token = str(raw or "").strip()
    if token.lower() in ("", "none", "null"):
        return ""
    return token


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


def _required_semantic_keys_for_entity(entity: Dict[str, object]) -> List[str]:
    etype = str(entity.get("type") or "").strip().upper()
    required = ["layer", "color_index", "lineweight_mm", "linetype"]
    if etype in ("TEXT", "MTEXT"):
        required.extend(["text", "text_position", "text_style"])
    elif etype in ("ATTRIB", "ATTDEF"):
        required.extend(["text_position", "text_style"])
    if etype == "DIMENSION":
        required.extend(
            [
                "dim_kind",
                "dimension_style",
                "text_position",
                "text_height",
                "primitive_count",
            ]
        )
    return required


def _validate_entity_semantics(entity: Dict[str, object]) -> List[str]:
    etype = str(entity.get("type") or "").strip().upper()
    if etype not in CRITICAL_SEMANTIC_TYPES:
        return []

    issues: List[str] = []
    mapping = entity.get("mapping_status") if isinstance(entity.get("mapping_status"), dict) else {}
    normalized = entity.get("normalized_semantics") if isinstance(entity.get("normalized_semantics"), dict) else {}
    provenance = entity.get("provenance") if isinstance(entity.get("provenance"), dict) else {}

    if not mapping:
        issues.append("missing_mapping_status")
        return issues

    if mapping.get("ok") is not True:
        issues.append("mapping_not_ok")
    if mapping.get("source_trace_complete") is not True:
        issues.append("source_trace_incomplete")

    missing_keys = mapping.get("missing_keys")
    if isinstance(missing_keys, list):
        for key in missing_keys:
            key_s = str(key or "").strip()
            if key_s:
                issues.append(f"mapping_missing:{key_s}")
    else:
        issues.append("mapping_missing_keys_invalid")

    for key in _required_semantic_keys_for_entity(entity):
        if not _has_semantic_value(normalized.get(key)):
            issues.append(f"normalized_missing:{key}")
            continue
        if not _has_semantic_value(provenance.get(key)):
            issues.append(f"provenance_missing:{key}")

    return issues


def _validate_dimension_style(entity: Dict[str, object], primitives: List[Dict[str, object]]) -> List[str]:
    issues: List[str] = []
    geom = entity.get("geom") if isinstance(entity.get("geom"), dict) else {}

    text_primitives = [
        p
        for p in primitives
        if str(p.get("kind") or "").strip().lower() == "text"
        and str(p.get("subtype") or "").strip().lower() == "dimension_text"
    ]
    text_primitive = text_primitives[0] if text_primitives else None

    text_mask_expected = geom.get("text_mask") is True
    if text_mask_expected:
        if not text_primitive:
            issues.append("missing_dimension_text_primitive_for_mask")
        elif text_primitive.get("text_mask") is not True:
            issues.append("dimension_text_mask_not_propagated")

    if geom.get("text_color") is not None:
        if not text_primitive:
            issues.append("missing_dimension_text_primitive_for_text_color")
        elif text_primitive.get("color") is None:
            issues.append("dimension_text_color_not_propagated")

    if text_mask_expected and geom.get("text_mask_color") is not None:
        if not text_primitive:
            issues.append("missing_dimension_text_primitive_for_mask_color")
        elif text_primitive.get("text_mask_color") is None:
            issues.append("dimension_text_mask_color_not_propagated")

    expected_start_block = _normalize_dim_block_name(geom.get("arrow_block1") or geom.get("arrow_block"))
    expected_end_block = _normalize_dim_block_name(geom.get("arrow_block2") or geom.get("arrow_block"))
    arrow_blocks_seen = {
        str(p.get("arrow_block") or "").strip()
        for p in primitives
        if str(p.get("subtype") or "").strip().lower().startswith("dim_arrow")
    }
    if arrow_blocks_seen:
        if expected_start_block and expected_start_block not in arrow_blocks_seen:
            issues.append(f"start_arrow_block_not_propagated:{expected_start_block}")
        if expected_end_block and expected_end_block not in arrow_blocks_seen:
            issues.append(f"end_arrow_block_not_propagated:{expected_end_block}")

    return issues


def _check_one_file(
    core: DwgServiceCore,
    *,
    src_path: Path,
    display_name: str,
    space_id: str,
    limit: int,
    strict_profile: str,
) -> Tuple[bool, Dict[str, object]]:
    ascii_copy, tmp_dir = _copy_to_ascii_path(src_path)
    doc_id = ""
    try:
        opened = core.open_document(ascii_copy, display_name)
        doc_id = str(opened.get("doc_id") or "").strip()
        if not doc_id:
            return False, {"error": "empty doc_id"}

        entities_resp = core.list_entities(doc_id, space_id=space_id, limit=limit) or {}
        hierarchy_resp = core.list_hierarchy(doc_id, space_id=space_id) or {}
        style_tables = entities_resp.get("style_tables") if isinstance(entities_resp.get("style_tables"), dict) else {}
        style_table_missing_keys: List[str] = []
        for required_table in ("layers", "linetypes", "text_styles", "dim_styles", "blocks"):
            if required_table not in style_tables or not isinstance(style_tables.get(required_table), dict):
                style_table_missing_keys.append(required_table)
        entities = [item for item in (entities_resp.get("entities") or []) if isinstance(item, dict)]
        hierarchy_nodes = [item for item in (hierarchy_resp.get("nodes") or []) if isinstance(item, dict)]
        leaves = _flatten_leaf_nodes(hierarchy_nodes)
        entity_leaves = _filter_nodes_by_kind(leaves, "entity")
        block_ref_leaves = _filter_nodes_by_kind(leaves, "block_ref")

        entity_type_counter = _count_by_type(entities)
        hierarchy_type_counter = _count_by_type(entity_leaves)
        type_mismatches: List[Tuple[str, int, int]] = []
        for t in CRITICAL_TYPES:
            ec = entity_type_counter.get(t, 0)
            hc = hierarchy_type_counter.get(t, 0)
            if ec != hc:
                type_mismatches.append((t, ec, hc))

        entity_subtype_counter = _count_entity_subtypes(entities)
        hierarchy_subtype_counter = _count_node_subtypes(entity_leaves)
        subtype_mismatches: List[Tuple[str, int, int]] = []
        for subtype in CRITICAL_SUBTYPES:
            ec = entity_subtype_counter.get(subtype, 0)
            hc = hierarchy_subtype_counter.get(subtype, 0)
            if ec != hc:
                subtype_mismatches.append((subtype, ec, hc))

        entity_ids = [_normalize_entity_id(item.get("id")) for item in entities]
        leaf_ids = [_normalize_entity_id(item.get("entity_id")) for item in entity_leaves]
        missing_in_tree = _set_diff(entity_ids, leaf_ids)
        extra_in_tree = _set_diff(leaf_ids, entity_ids)

        by_type_renderable: Dict[str, Dict[str, int]] = {}
        missing_entity_ids: List[str] = []
        dim_total = 0
        dim_renderable = 0
        dim_with_text = 0
        dim_kind_counter: Counter[str] = Counter()
        dim_missing_ids: List[str] = []
        dim_style_issue_counter: Counter[str] = Counter()
        dim_style_issue_ids: List[str] = []
        semantic_issue_counter: Counter[str] = Counter()
        semantic_issue_ids: List[str] = []

        for entity in entities:
            etype = str(entity.get("type") or "").strip().upper() or "UNKNOWN"
            rid = _normalize_entity_id(entity.get("id"))
            bucket = by_type_renderable.setdefault(etype, {"input": 0, "renderable": 0, "missing": 0})
            bucket["input"] += 1

            renderable, primitive_count, has_text, primitives = _entity_renderable(core, entity)
            if renderable:
                bucket["renderable"] += 1
            else:
                bucket["missing"] += 1
                if rid:
                    missing_entity_ids.append(rid)

            if etype == "DIMENSION":
                dim_total += 1
                geom = entity.get("geom") if isinstance(entity.get("geom"), dict) else {}
                dim_payload = geom.get("dimension_payload") if isinstance(geom.get("dimension_payload"), dict) else {}
                kind = str(dim_payload.get("dim_kind") or geom.get("dim_kind") or "").strip().lower() or "dimension"
                dim_kind_counter[kind] += 1
                if renderable and primitive_count > 0:
                    dim_renderable += 1
                else:
                    if rid:
                        dim_missing_ids.append(rid)
                if has_text:
                    dim_with_text += 1
                style_issues = _validate_dimension_style(entity, primitives)
                if style_issues:
                    for issue in style_issues:
                        dim_style_issue_counter[issue] += 1
                    if rid:
                        dim_style_issue_ids.append(rid)

            semantic_issues = _validate_entity_semantics(entity)
            if semantic_issues:
                for issue in semantic_issues:
                    semantic_issue_counter[issue] += 1
                if rid:
                    semantic_issue_ids.append(rid)

        dim_renderable_ratio = float(dim_renderable) / float(dim_total) if dim_total > 0 else 1.0
        dim_text_ratio = float(dim_with_text) / float(dim_total) if dim_total > 0 else 1.0

        summary: Dict[str, object] = {
            "source": str(src_path),
            "space_id": space_id,
            "entity_count": len(entities),
            "hierarchy_leaf_count": len(leaves),
            "hierarchy_entity_leaf_count": len(entity_leaves),
            "hierarchy_block_ref_leaf_count": len(block_ref_leaves),
            "type_mismatches": type_mismatches,
            "subtype_mismatches": subtype_mismatches,
            "missing_in_tree_count": len(missing_in_tree),
            "extra_in_tree_count": len(extra_in_tree),
            "missing_entity_ids_count": len(missing_entity_ids),
            "missing_entity_ids_sample": missing_entity_ids[:15],
            "by_type_renderable": by_type_renderable,
            "entity_subtype_counter": dict(entity_subtype_counter),
            "hierarchy_subtype_counter": dict(hierarchy_subtype_counter),
            "dimension_total": dim_total,
            "dimension_renderable": dim_renderable,
            "dimension_with_text": dim_with_text,
            "dimension_renderable_ratio": round(dim_renderable_ratio, 4),
            "dimension_text_ratio": round(dim_text_ratio, 4),
            "dimension_kind_counter": dict(dim_kind_counter),
            "dimension_missing_ids_sample": dim_missing_ids[:15],
            "dimension_style_issue_counter": dict(dim_style_issue_counter),
            "dimension_style_issue_ids_sample": dim_style_issue_ids[:15],
            "semantic_issue_counter": dict(semantic_issue_counter),
            "semantic_issue_ids_sample": semantic_issue_ids[:15],
            "style_table_missing_keys": style_table_missing_keys,
            "style_table_counts": {
                "layers": len(style_tables.get("layers") or {}) if isinstance(style_tables.get("layers"), dict) else 0,
                "linetypes": len(style_tables.get("linetypes") or {}) if isinstance(style_tables.get("linetypes"), dict) else 0,
                "text_styles": len(style_tables.get("text_styles") or {}) if isinstance(style_tables.get("text_styles"), dict) else 0,
                "dim_styles": len(style_tables.get("dim_styles") or {}) if isinstance(style_tables.get("dim_styles"), dict) else 0,
                "blocks": len(style_tables.get("blocks") or {}) if isinstance(style_tables.get("blocks"), dict) else 0,
            },
        }

        ok = True
        if type_mismatches or subtype_mismatches or missing_in_tree or extra_in_tree:
            ok = False

        if strict_profile == "drawing1":
            required_kinds = {"aligned", "rotated", "angular"}
            if dim_total < 3:
                ok = False
            if not required_kinds.issubset(set(dim_kind_counter.keys())):
                ok = False
            if dim_renderable < dim_total or dim_with_text < dim_total:
                ok = False
        elif strict_profile == "drawing2":
            if dim_total < 1:
                ok = False
            if dim_renderable < dim_total or dim_with_text < dim_total:
                ok = False
        else:
            if dim_total > 0 and (dim_renderable_ratio < 0.99 or dim_text_ratio < 0.99):
                ok = False
        if dim_style_issue_counter:
            ok = False
        if semantic_issue_counter:
            ok = False
        if core.mode == "oda_cli" and style_table_missing_keys:
            ok = False

        summary["ok"] = ok
        return ok, summary
    finally:
        if doc_id:
            core.close_document(doc_id)
        shutil.rmtree(tmp_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="DWG acceptance check for Drawing1 + Drawing2 + 01--平面图.")
    parser.add_argument("--drawing1-path", type=str, default="")
    parser.add_argument("--drawing2-path", type=str, default="")
    parser.add_argument("--plan-path", type=str, default="")
    parser.add_argument("--space-id", type=str, default="model")
    parser.add_argument("--limit", type=int, default=500000)
    args = parser.parse_args()

    drawing1 = _resolve_file_from_env_or_search(
        explicit_path=args.drawing1_path,
        env_var="DRAWING1_DWG_PATH",
        exact_name="Drawing1.dwg",
        fuzzy_glob="Drawing1*.dwg",
    )
    drawing2 = _resolve_file_from_env_or_search(
        explicit_path=args.drawing2_path,
        env_var="DRAWING2_DWG_PATH",
        exact_name="Drawing2.dwg",
        fuzzy_glob="Drawing2*.dwg",
    )
    plan = _resolve_file_from_env_or_search(
        explicit_path=args.plan_path,
        env_var="PLAN01_DWG_PATH",
        exact_name="01--平面图.dwg",
        fuzzy_glob="*01*平面图*.dwg",
    )

    if drawing1 is None:
        print("[error] Drawing1.dwg not found. Set --drawing1-path or DRAWING1_DWG_PATH")
        return 2
    if drawing2 is None:
        print("[error] Drawing2.dwg not found. Set --drawing2-path or DRAWING2_DWG_PATH")
        return 2
    if plan is None:
        print("[error] 01--平面图.dwg not found. Set --plan-path or PLAN01_DWG_PATH")
        return 2

    core = DwgServiceCore(REPO_ROOT / "server" / "uploads")
    print(f"[info] mode={core.mode}")
    print(f"[info] drawing1={drawing1}")
    print(f"[info] drawing2={drawing2}")
    print(f"[info] plan={plan}")

    ok1, sum1 = _check_one_file(
        core,
        src_path=drawing1,
        display_name=drawing1.name,
        space_id=args.space_id,
        limit=max(1000, args.limit),
        strict_profile="drawing1",
    )
    print("[drawing1]")
    for k, v in sum1.items():
        print(f"{k}: {v}")

    ok2, sum2 = _check_one_file(
        core,
        src_path=drawing2,
        display_name=drawing2.name,
        space_id=args.space_id,
        limit=max(1000, args.limit),
        strict_profile="drawing2",
    )
    print("[drawing2]")
    for k, v in sum2.items():
        print(f"{k}: {v}")

    ok3, sum3 = _check_one_file(
        core,
        src_path=plan,
        display_name=plan.name,
        space_id=args.space_id,
        limit=max(1000, args.limit),
        strict_profile="plan",
    )
    print("[plan01]")
    for k, v in sum3.items():
        print(f"{k}: {v}")

    if ok1 and ok2 and ok3:
        print("[result] PASS")
        return 0
    print("[result] FAIL")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
