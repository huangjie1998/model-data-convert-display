from __future__ import annotations

from typing import Callable, Dict, Iterable, List

from server.dwg.dwg_model.ac_db_database import AcDbDatabase
from server.dwg.model_document import CadDocument
from server.dwg.dwg_model import AcDbEntity
from server.dwg.model_builders.entity_factory import build_entity_from_raw
from server.dwg.model_builders.spaces_builder import build_spaces
from server.dwg.model_builders.tables_builder import (
    build_block_table,
    build_dim_style_table,
    build_layer_table,
    build_linetype_table,
    build_text_style_table,
)
from server.dwg.oda.dump_adapter import OdaDumpDocument, parse_oda_dump_document


def build_cad_document_from_session_data(
    *,
    doc_id: str,
    spaces: Iterable[Dict[str, object]],
    entities_by_space: Dict[str, List[Dict[str, object]]],
    block_refs_by_space: Dict[str, List[Dict[str, object]]],
    layer_styles: Dict[str, Dict[str, object]],
    linetype_styles: Dict[str, Dict[str, object]],
    text_styles: Dict[str, Dict[str, object]],
    dim_styles: Dict[str, Dict[str, object]],
    header_dim_defaults: Dict[str, object],
    block_catalog: Dict[str, Dict[str, object]],
    warnings: Iterable[str] = (),
    source: str = "oda_cli",
    oda_dump_document: OdaDumpDocument | None = None,
) -> CadDocument:
    document = _build_cad_document_from_compatibility_data(
        doc_id=doc_id,
        spaces=spaces,
        entities_by_space=entities_by_space,
        block_refs_by_space=block_refs_by_space,
        layer_styles=layer_styles,
        linetype_styles=linetype_styles,
        text_styles=text_styles,
        dim_styles=dim_styles,
        header_dim_defaults=header_dim_defaults,
        block_catalog=block_catalog,
        warnings=warnings,
        source=source,
    )
    if oda_dump_document is not None:
        _attach_oda_dump_summary(document, oda_dump_document)
    return document


def build_cad_document_from_oda_dump(
    *,
    doc_id: str,
    dump_text: str,
    parse_legacy_dump: Callable[[str], Dict[str, object]],
    source: str = "oda_cli",
) -> CadDocument:
    oda_dump_document = parse_oda_dump_document(dump_text)
    parsed = parse_legacy_dump(dump_text)
    document = build_cad_document_from_session_data(
        doc_id=doc_id,
        spaces=_list_dict(parsed.get("spaces")),
        entities_by_space=_dict_list_dict(parsed.get("entities_by_space")),
        block_refs_by_space=_dict_list_dict(parsed.get("block_refs_by_space")),
        layer_styles=_dict_dict(parsed.get("layer_styles")),
        linetype_styles=_dict_dict(parsed.get("linetype_styles")),
        text_styles=_dict_dict(parsed.get("text_styles")),
        dim_styles=_dict_dict(parsed.get("dim_styles")),
        header_dim_defaults=dict(parsed.get("header_dim_defaults") or {}),
        block_catalog=_dict_dict(parsed.get("block_catalog")),
        warnings=[str(w) for w in parsed.get("warnings") or []],
        source=source,
        oda_dump_document=oda_dump_document,
    )
    return document


def _build_cad_document_from_compatibility_data(
    *,
    doc_id: str,
    spaces: Iterable[Dict[str, object]],
    entities_by_space: Dict[str, List[Dict[str, object]]],
    block_refs_by_space: Dict[str, List[Dict[str, object]]],
    layer_styles: Dict[str, Dict[str, object]],
    linetype_styles: Dict[str, Dict[str, object]],
    text_styles: Dict[str, Dict[str, object]],
    dim_styles: Dict[str, Dict[str, object]],
    header_dim_defaults: Dict[str, object],
    block_catalog: Dict[str, Dict[str, object]],
    warnings: Iterable[str] = (),
    source: str = "oda_cli",
) -> CadDocument:
    database = AcDbDatabase()
    database.layers = build_layer_table(layer_styles)
    database.linetypes = build_linetype_table(linetype_styles)
    database.text_styles = build_text_style_table(text_styles)
    database.dim_styles = build_dim_style_table(dim_styles)
    database.blocks = build_block_table(block_catalog)
    database.header_dim_defaults = dict(header_dim_defaults)

    for space in build_spaces(spaces).values():
        database.add_space(space)

    for space_id, raw_entities in entities_by_space.items():
        for index, raw in enumerate(raw_entities):
            database.add_entity(build_entity_from_raw(raw, space_id=space_id, index=index))

    for space_id, raw_refs in block_refs_by_space.items():
        refs: list[AcDbEntity] = []
        for index, raw in enumerate(raw_refs):
            ref = build_entity_from_raw(raw, space_id=space_id, index=index, block_reference=True)
            refs.append(ref)
            database.add_entity(ref)
            if space_id in database.spaces:
                database.spaces[space_id].block_reference_ids.append(ref.id)
        database.block_references_by_space[space_id] = refs

    return CadDocument(doc_id=doc_id, database=database, source=source, warnings=[str(w) for w in warnings])


def _attach_oda_dump_summary(document: CadDocument, oda_dump_document: OdaDumpDocument) -> None:
    document.metadata["oda_dump"] = {
        "header_record_count": len(oda_dump_document.header_records),
        "table_record_count": len(oda_dump_document.table_records),
        "block_record_count": len(oda_dump_document.block_records),
        "entity_record_count": len(oda_dump_document.entity_records),
        "unknown_record_count": len(oda_dump_document.unknown_records),
    }


def _list_dict(value: object) -> List[Dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _dict_list_dict(value: object) -> Dict[str, List[Dict[str, object]]]:
    if not isinstance(value, dict):
        return {}
    out: Dict[str, List[Dict[str, object]]] = {}
    for key, items in value.items():
        if isinstance(items, list):
            out[str(key)] = [dict(item) for item in items if isinstance(item, dict)]
    return out


def _dict_dict(value: object) -> Dict[str, Dict[str, object]]:
    if not isinstance(value, dict):
        return {}
    out: Dict[str, Dict[str, object]] = {}
    for key, item in value.items():
        if isinstance(item, dict):
            out[str(key)] = dict(item)
    return out
