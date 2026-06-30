from __future__ import annotations

from server.dwg.cad_model.document import CadDocument
from server.dwg.cad_model.queries.render_inputs import iter_renderable_entities
from .intent import CadEntityRenderIntent, CadRenderIntent


def build_render_intent(document: CadDocument, space_id: str) -> CadRenderIntent:
    intent = CadRenderIntent(doc_id=document.doc_id, space_id=space_id)
    for entity in iter_renderable_entities(document.database, space_id):
        intent.entities.append(CadEntityRenderIntent(
            owner_object_id=entity.id,
            entity_type=entity.entity_type,
            kind=entity.semantic_type or entity.entity_type.lower(),
            payload=dict(entity.raw_entity),
            diagnostics=[diag.message for diag in entity.diagnostics],
        ))
    return intent
