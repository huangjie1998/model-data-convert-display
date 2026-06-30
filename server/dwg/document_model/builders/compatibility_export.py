from __future__ import annotations

from typing import Dict, List

from server.dwg.document_model.document import CadDocument


def export_compatibility_data(document: CadDocument) -> Dict[str, object]:
    entities_by_space: Dict[str, List[Dict[str, object]]] = {space_id: [] for space_id in document.database.spaces.keys()}
    block_refs_by_space: Dict[str, List[Dict[str, object]]] = {space_id: [] for space_id in document.database.spaces.keys()}

    for entity in document.database.entities.values():
        target = block_refs_by_space if entity.object_type == "BLOCK_REFERENCE" else entities_by_space
        target.setdefault(entity.owner_space_id, []).append(dict(entity.raw_entity))

    return {
        "spaces": [dict(space.raw_properties) if space.raw_properties else {"id": space.name, "display_name": space.display_name, "kind": space.kind} for space in document.database.spaces.values()],
        "entities_by_space": entities_by_space,
        "block_refs_by_space": block_refs_by_space,
        "layer_styles": _table_raw(document.database.layers.records),
        "linetype_styles": _table_raw(document.database.linetypes.records),
        "text_styles": _table_raw(document.database.text_styles.records),
        "dim_styles": _table_raw(document.database.dim_styles.records),
        "header_dim_defaults": dict(document.database.header_dim_defaults),
        "block_catalog": _table_raw(document.database.blocks.records),
    }


def _table_raw(records: Dict[str, object]) -> Dict[str, Dict[str, object]]:
    out: Dict[str, Dict[str, object]] = {}
    for name, record in records.items():
        raw = getattr(record, "raw_properties", {})
        out[name] = dict(raw) if isinstance(raw, dict) else {}
    return out
