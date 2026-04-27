from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Pattern, Tuple


EntityBuilder = Callable[..., Optional[Dict[str, object]]]
FontMetaAttacher = Callable[[Dict[str, object], Dict[str, Dict[str, object]]], Dict[str, object]]
LabelParser = Callable[[str], Tuple[Optional[str], Optional[str]]]
PointParser = Callable[[str], Optional[Dict[str, float]]]


@dataclass(frozen=True)
class OdaBlockParseContext:
    build_entity_from_oda: EntityBuilder
    attach_text_font_meta: FontMetaAttacher
    parse_label_value: LabelParser
    parse_point_value: PointParser
    entity_start_re: Pattern[str]
    dim_styles: Dict[str, Dict[str, object]]
    header_dim_defaults: Dict[str, object]
    text_styles: Dict[str, Dict[str, object]]


@dataclass(frozen=True)
class OdaBlockParseResult:
    block_order: List[str]
    block_is_layout: Dict[str, bool]
    block_entities: Dict[str, List[Dict[str, object]]]
    block_origin_by_name: Dict[str, Dict[str, float]]


def parse_oda_block_records(dump_text: str, context: OdaBlockParseContext) -> OdaBlockParseResult:
    current_block_name: Optional[str] = None
    current_block_layout = False
    current_block_origin: Optional[Dict[str, float]] = None
    current_block_entities: List[Dict[str, object]] = []
    current_entity: Optional[Dict[str, object]] = None

    block_order: List[str] = []
    block_is_layout: Dict[str, bool] = {}
    block_entities: Dict[str, List[Dict[str, object]]] = {}
    block_origin_by_name: Dict[str, Dict[str, float]] = {}

    def finalize_entity() -> None:
        nonlocal current_entity
        if not current_entity:
            current_entity = None
            return

        ent = context.build_entity_from_oda(
            etype=str(current_entity["etype"]),
            handle=str(current_entity["handle"]),
            lines=list(current_entity["lines"]),
            space_id="block",
            dim_styles=context.dim_styles,
            header_dim_defaults=context.header_dim_defaults,
        )
        if ent is not None:
            current_block_entities.append(context.attach_text_font_meta(ent, context.text_styles))
        current_entity = None

    def finalize_block() -> None:
        nonlocal current_block_name, current_block_layout, current_block_entities, current_block_origin
        if current_block_name:
            name = current_block_name
            if name not in block_is_layout:
                block_order.append(name)
            block_is_layout[name] = bool(current_block_layout)
            block_entities[name] = list(current_block_entities)
            block_origin_by_name[name] = dict(current_block_origin) if isinstance(current_block_origin, dict) else {"x": 0.0, "y": 0.0, "z": 0.0}
        current_block_name = None
        current_block_layout = False
        current_block_origin = None
        current_block_entities = []

    for raw in dump_text.splitlines():
        line = raw.rstrip("\r\n")
        stripped = line.strip()

        if stripped == "<AcDbBlockTableRecord>":
            finalize_entity()
            finalize_block()
            continue

        ent_match = context.entity_start_re.match(line)
        if ent_match:
            finalize_entity()
            current_entity = {
                "etype": ent_match.group("etype"),
                "handle": ent_match.group("handle"),
                "lines": [],
            }
            continue

        if current_entity is not None:
            current_entity["lines"].append(line)
            continue

        label, value = context.parse_label_value(line)
        if label == "name" and value:
            current_block_name = value
        elif label == "layout" and value:
            current_block_layout = value.lower() == "true"
        elif label == "origin" and value:
            origin = context.parse_point_value(value)
            if origin is not None:
                current_block_origin = origin

    finalize_entity()
    finalize_block()

    return OdaBlockParseResult(
        block_order=block_order,
        block_is_layout=block_is_layout,
        block_entities=block_entities,
        block_origin_by_name=block_origin_by_name,
    )
