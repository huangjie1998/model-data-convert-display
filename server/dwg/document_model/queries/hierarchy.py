from __future__ import annotations

from typing import Dict, List

from server.dwg.document_model.database import CadDatabase


def build_hierarchy_nodes(database: CadDatabase) -> List[Dict[str, object]]:
    nodes: List[Dict[str, object]] = []
    for space in database.spaces.values():
        nodes.append({"id": space.id, "type": "SPACE", "name": space.name, "kind": space.kind, "children": list(space.entity_ids)})
    return nodes
