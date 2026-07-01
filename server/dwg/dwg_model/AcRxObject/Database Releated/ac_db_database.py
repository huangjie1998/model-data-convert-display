from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from server.dwg.dwg_model import AcDbObject, AcDbEntity
from server.dwg.dwg_model.classes import (
    AcDbBlockTable,
    AcDbBlockTableRecord,
    AcDbDictionary,
    AcDbDimStyleTable,
    AcDbLayerTable,
    AcDbLinetypeTable,
    AcDbTextStyleTable,
)


@dataclass
class AcDbDatabase:
    spaces: Dict[str, AcDbBlockTableRecord] = field(default_factory=dict)
    objects: Dict[str, AcDbObject] = field(default_factory=dict)
    entities: Dict[str, AcDbEntity] = field(default_factory=dict)
    dictionaries: Dict[str, AcDbDictionary] = field(default_factory=dict)
    block_references_by_space: Dict[str, list[AcDbEntity]] = field(default_factory=dict)
    layers: AcDbLayerTable = field(default_factory=AcDbLayerTable)
    linetypes: AcDbLinetypeTable = field(default_factory=AcDbLinetypeTable)
    text_styles: AcDbTextStyleTable = field(default_factory=AcDbTextStyleTable)
    dim_styles: AcDbDimStyleTable = field(default_factory=AcDbDimStyleTable)
    blocks: AcDbBlockTable = field(default_factory=AcDbBlockTable)
    header_dim_defaults: Dict[str, object] = field(default_factory=dict)

    def add_object(self, obj: AcDbObject) -> None:
        self.objects[obj.id] = obj

    def add_space(self, space: AcDbBlockTableRecord) -> None:
        self.spaces[space.name] = space
        self.blocks.add(space)
        self.add_object(space)

    def add_dictionary(self, dictionary: AcDbDictionary) -> None:
        self.dictionaries[dictionary.name] = dictionary
        self.add_object(dictionary)

    def add_entity(self, entity: AcDbEntity) -> None:
        self.entities[entity.id] = entity
        self.add_object(entity)
        if entity.owner_space_id in self.spaces:
            self.spaces[entity.owner_space_id].entity_ids.append(entity.id)

    def get_object(self, object_id: str) -> Optional[AcDbObject]:
        return self.objects.get(object_id)
