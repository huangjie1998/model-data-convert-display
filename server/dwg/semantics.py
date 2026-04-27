from __future__ import annotations

import math
from typing import Dict, List, Optional


TEXT_ENTITY_TYPES = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}


def is_text_entity_type(ent_type: object) -> bool:
    return str(ent_type or "").strip().upper() in TEXT_ENTITY_TYPES


def dimension_subtype_from_kind(dim_kind: object) -> str:
    kind = str(dim_kind or "").strip().lower()
    if not kind:
        return "DIM_GENERIC"
    token = kind.replace("-", "_").replace(" ", "_").upper()
    if token == "ARC":
        token = "ARC_LENGTH"
    return f"DIM_{token}"


def entity_semantic_type(ent_type: object) -> str:
    entity_type = str(ent_type or "").strip().upper()
    if entity_type == "DIMENSION":
        return "dimension"
    if is_text_entity_type(entity_type):
        return "text"
    if entity_type in ("INSERT", "BLOCK_REFERENCE", "BLOCKREF"):
        return "block_ref"
    if entity_type in ("TABLE", "ACAD_TABLE"):
        return "table"
    if entity_type in ("HATCH", "SOLID", "TRACE", "WIPEOUT"):
        return "fill"
    if entity_type:
        return "graphic"
    return "unknown"


def entity_semantic_subtype(
    ent_type: object,
    geom: Optional[Dict[str, object]] = None,
    source_acdb_type: object = None,
) -> str:
    entity_type = str(ent_type or "").strip().upper()
    if entity_type == "DIMENSION":
        dim_kind = ""
        if isinstance(geom, dict):
            dim_kind = str(geom.get("dim_kind", "")).strip().lower()
        return dimension_subtype_from_kind(dim_kind)

    if entity_type == "TEXT":
        source = str(source_acdb_type or "").strip().upper()
        if source == "ACDBMTEXT":
            return "MTEXT"
        if source == "ACDBATTRIBUTEDEFINITION":
            return "ATTDEF"
        if source == "ACDBATTRIBUTE":
            return "ATTRIB"
        if isinstance(geom, dict):
            if bool(geom.get("is_mtext")):
                return "MTEXT"
            if bool(geom.get("is_attribute")):
                attr_kind = str(geom.get("attribute_kind", "")).strip().upper()
                if attr_kind in ("ATTDEF", "ATTRIB"):
                    return attr_kind
                return "ATTRIB"
        return "TEXT"

    if entity_type in ("MTEXT", "ATTRIB", "ATTDEF"):
        return entity_type
    if entity_type in ("INSERT", "BLOCK_REFERENCE", "BLOCKREF"):
        return "BLOCK_REF"
    if entity_type in ("TABLE", "ACAD_TABLE"):
        return "TABLE"
    if entity_type:
        return entity_type
    return "UNKNOWN"


def hierarchy_category_label(category_key: object) -> str:
    key = str(category_key or "").strip().upper()
    if not key:
        return "UNKNOWN"
    if key.startswith("DIM_"):
        dim_kind = key[4:].lower()
        if dim_kind == "generic":
            return "DIMENSION"
        if dim_kind == "arc_length":
            return "DIMENSION: ARC_LENGTH"
        return f"DIMENSION: {dim_kind.upper()}"
    return key


def has_semantic_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def required_semantic_keys(ent_type: str) -> List[str]:
    required = ["layer", "color_index", "lineweight_mm", "linetype"]
    if ent_type in ("TEXT", "MTEXT"):
        required.extend(["text", "text_position", "text_style"])
    elif ent_type in ("ATTRIB", "ATTDEF"):
        required.extend(["text_position", "text_style"])
    if ent_type == "DIMENSION":
        required.extend(["dim_kind", "dimension_style", "text_position", "text_height", "primitive_count"])
    return required


def build_mapping_status(
    *,
    ent_type: str,
    raw_semantics: Dict[str, object],
    normalized_semantics: Dict[str, object],
    provenance: Dict[str, object],
) -> Dict[str, object]:
    raw_to_normalized: Dict[str, str] = {
        "layer": "layer",
        "color_index": "color_index",
        "color": "color_rgb",
        "lineweight": "lineweight_mm",
        "linetype": "linetype",
        "text_style": "text_style",
        "text": "text",
        "text_position": "text_position",
        "text_height": "text_height",
        "dimension_style": "dimension_style",
        "dim_kind": "dim_kind",
        "arrow_block1": "arrow_block1",
        "arrow_block2": "arrow_block2",
        "text_mask": "text_mask",
        "text_mask_color": "text_mask_color",
        "primitive_count": "primitive_count",
    }
    missing_keys: List[str] = []
    extra_keys: List[str] = []

    for raw_key, raw_value in raw_semantics.items():
        if not has_semantic_value(raw_value):
            continue
        mapped_key = raw_to_normalized.get(raw_key)
        if not mapped_key:
            extra_keys.append(raw_key)
            continue
        if not has_semantic_value(normalized_semantics.get(mapped_key)):
            missing_keys.append(mapped_key)

    required = required_semantic_keys(ent_type)
    for key in required:
        if not has_semantic_value(normalized_semantics.get(key)):
            missing_keys.append(key)

    dedup_missing = sorted(set(missing_keys))
    dedup_extra = sorted(set(extra_keys))
    source_trace_complete = True
    for key in required:
        if not has_semantic_value(normalized_semantics.get(key)):
            continue
        if not has_semantic_value(provenance.get(key)):
            source_trace_complete = False
            break

    return {
        "ok": len(dedup_missing) == 0 and source_trace_complete,
        "missing_keys": dedup_missing,
        "extra_keys": dedup_extra,
        "source_trace_complete": source_trace_complete,
    }


def decorate_primitives_with_semantics(
    *,
    ent_type: str,
    primitives: List[Dict[str, object]],
    normalized_semantics: Dict[str, object],
    provenance: Dict[str, object],
    annotation_context: Dict[str, object],
    style_ref: Dict[str, object],
) -> List[Dict[str, object]]:
    if ent_type not in ("DIMENSION", "TEXT", "MTEXT", "ATTDEF", "ATTRIB"):
        return primitives

    decorated: List[Dict[str, object]] = []
    for primitive in primitives:
        if not isinstance(primitive, dict):
            continue
        out = dict(primitive)
        existing_resolved = out.get("resolved")
        resolved_out: Dict[str, object] = dict(existing_resolved) if isinstance(existing_resolved, dict) else {}
        resolved_out.setdefault("color_index", normalized_semantics.get("color_index"))
        resolved_out.setdefault("color_rgb", normalized_semantics.get("color_rgb"))
        resolved_out.setdefault("lineweight_mm", normalized_semantics.get("lineweight_mm"))
        resolved_out.setdefault("linetype", normalized_semantics.get("linetype"))
        out["resolved"] = resolved_out

        existing_provenance = out.get("provenance")
        provenance_out: Dict[str, object] = dict(existing_provenance) if isinstance(existing_provenance, dict) else {}
        provenance_out.setdefault("color_index", provenance.get("color_index"))
        provenance_out.setdefault("lineweight_mm", provenance.get("lineweight_mm"))
        provenance_out.setdefault("linetype", provenance.get("linetype"))
        provenance_out.setdefault("text_style", provenance.get("text_style"))
        out["provenance"] = provenance_out

        out["annotation_context"] = annotation_context
        existing_style_ref = out.get("style_ref")
        style_ref_out: Dict[str, object] = dict(existing_style_ref) if isinstance(existing_style_ref, dict) else {}
        style_ref_out.setdefault("layer", style_ref.get("layer"))
        style_ref_out.setdefault("linetype", style_ref.get("linetype"))
        style_ref_out.setdefault("text_style", style_ref.get("text_style"))
        style_ref_out.setdefault("dim_style", style_ref.get("dim_style"))
        out["style_ref"] = style_ref_out
        decorated.append(out)
    return decorated
