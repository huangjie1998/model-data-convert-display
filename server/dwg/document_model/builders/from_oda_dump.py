from __future__ import annotations

from typing import Dict, Iterable, List

from server.dwg.document_model.database import CadDatabase
from server.dwg.document_model.document import CadDocument
from server.dwg.document_model.entities.base import CadEntity
from server.dwg.document_model.builders.entity_factory import build_entity_from_raw
from server.dwg.document_model.builders.spaces_builder import build_spaces
from server.dwg.document_model.builders.tables_builder import (
    build_block_table,
    build_dim_style_table,
    build_layer_table,
    build_linetype_table,
    build_text_style_table,
)


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
) -> CadDocument:
    database = CadDatabase()
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
        refs: list[CadEntity] = []
        for index, raw in enumerate(raw_refs):
            ref = build_entity_from_raw(raw, space_id=space_id, index=index, block_reference=True)
            refs.append(ref)
            database.add_entity(ref)
            if space_id in database.spaces:
                database.spaces[space_id].block_reference_ids.append(ref.id)
        database.block_references_by_space[space_id] = refs

    return CadDocument(doc_id=doc_id, database=database, source=source, warnings=[str(w) for w in warnings])


def build_cad_document_from_oda_dump(*args: object, **kwargs: object) -> CadDocument:
    raise NotImplementedError("Build CadDocument from parsed ODA session data while ODA text parsing is migrated.")
