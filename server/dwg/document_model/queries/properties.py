from __future__ import annotations

from typing import Dict

from server.dwg.document_model.database import CadDatabase
from server.dwg.document_model.dbobjects.base import CadDbObject


def build_properties_payload(database: CadDatabase, obj: CadDbObject) -> Dict[str, object]:
    payload: Dict[str, object] = {
        "id": obj.id,
        "handle": obj.handle,
        "type": obj.object_type,
        "owner_id": obj.owner_id,
        "properties": dict(obj.raw_properties),
        "normalized": dict(obj.normalized_properties),
        "diagnostics": [diag.__dict__ for diag in obj.diagnostics],
    }
    layer = getattr(obj, "layer", "")
    if layer:
        payload["layer"] = layer
        layer_record = database.layers.get(str(layer))
        if layer_record:
            payload["layer_properties"] = dict(layer_record.raw_properties)
    return payload
