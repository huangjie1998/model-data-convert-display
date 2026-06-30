from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from server.dwg.cad_model.dbobjects.base import CadDbObject
from server.dwg.cad_model.entities.base import CadEntity
from server.dwg.cad_model.spaces.base import CadSpace
from server.dwg.cad_model.tables.blocks import CadBlockTable
from server.dwg.cad_model.tables.dim_styles import CadDimStyleTable
from server.dwg.cad_model.tables.layers import CadLayerTable
from server.dwg.cad_model.tables.linetypes import CadLinetypeTable
from server.dwg.cad_model.tables.text_styles import CadTextStyleTable


@dataclass
class CadDatabase:
    spaces: Dict[str, CadSpace] = field(default_factory=dict)
    objects: Dict[str, CadDbObject] = field(default_factory=dict)
    entities: Dict[str, CadEntity] = field(default_factory=dict)
    block_references_by_space: Dict[str, list[CadEntity]] = field(default_factory=dict)
    layers: CadLayerTable = field(default_factory=CadLayerTable)
    linetypes: CadLinetypeTable = field(default_factory=CadLinetypeTable)
    text_styles: CadTextStyleTable = field(default_factory=CadTextStyleTable)
    dim_styles: CadDimStyleTable = field(default_factory=CadDimStyleTable)
    blocks: CadBlockTable = field(default_factory=CadBlockTable)
    header_dim_defaults: Dict[str, object] = field(default_factory=dict)

    def add_object(self, obj: CadDbObject) -> None:
        self.objects[obj.id] = obj

    def add_space(self, space: CadSpace) -> None:
        self.spaces[space.name] = space
        self.add_object(space)

    def add_entity(self, entity: CadEntity) -> None:
        self.entities[entity.id] = entity
        self.add_object(entity)
        if entity.owner_space_id in self.spaces:
            self.spaces[entity.owner_space_id].entity_ids.append(entity.id)

    def get_object(self, object_id: str) -> Optional[CadDbObject]:
        return self.objects.get(object_id)
