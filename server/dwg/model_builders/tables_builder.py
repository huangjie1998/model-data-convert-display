from __future__ import annotations

from typing import Dict

from server.dwg.model_core.identity.object_id import cad_object_id
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import (
    AcDbBlockTableRecord,
    AcDbDimStyleTableRecord,
    AcDbLayerTableRecord,
    AcDbLinetypeTableRecord,
    AcDbTextStyleTableRecord,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTables.AcDbSymbolTable import (
    AcDbBlockTable,
    AcDbDimStyleTable,
    AcDbLayerTable,
    AcDbLinetypeTable,
    AcDbTextStyleTable,
)


def build_layer_table(raw: Dict[str, Dict[str, object]]) -> AcDbLayerTable:
    table = AcDbLayerTable()
    for name, props in raw.items():
        record = AcDbLayerTableRecord(
            object_id=cad_object_id(f"layer:{name}"),
            object_type="LAYER_RECORD",
            name=str(name),
            table_name="layers",
            color_index=_optional_int(props.get("color_index")),
            color_rgb=str(props.get("color_rgb") or props.get("color") or ""),
            linetype=str(props.get("linetype") or ""),
            lineweight_mm=_optional_float(props.get("lineweight_mm")),
            properties=dict(props),
            raw_properties=dict(props),
            normalized_properties=dict(props),
        )
        table.add(record)
    return table


def build_linetype_table(raw: Dict[str, Dict[str, object]]) -> AcDbLinetypeTable:
    table = AcDbLinetypeTable()
    for name, props in raw.items():
        table.add(AcDbLinetypeTableRecord(
            object_id=cad_object_id(f"linetype:{name}"),
            object_type="LINETYPE_RECORD",
            name=str(name),
            table_name="linetypes",
            pattern=dict(props),
            raw_properties=dict(props),
            normalized_properties=dict(props),
        ))
    return table


def build_text_style_table(raw: Dict[str, Dict[str, object]]) -> AcDbTextStyleTable:
    table = AcDbTextStyleTable()
    for name, props in raw.items():
        table.add(AcDbTextStyleTableRecord(
            object_id=cad_object_id(f"text_style:{name}"),
            object_type="TEXT_STYLE_RECORD",
            name=str(name),
            table_name="text_styles",
            font_name=str(props.get("font_name") or ""),
            bigfont_name=str(props.get("bigfont_name") or props.get("big_font_name") or ""),
            font_key=str(props.get("font_key") or ""),
            bigfont_key=str(props.get("bigfont_key") or props.get("big_font_key") or ""),
            properties=dict(props),
            raw_properties=dict(props),
            normalized_properties=dict(props),
        ))
    return table


def build_dim_style_table(raw: Dict[str, Dict[str, object]]) -> AcDbDimStyleTable:
    table = AcDbDimStyleTable()
    for name, props in raw.items():
        table.add(AcDbDimStyleTableRecord(
            object_id=cad_object_id(f"dim_style:{name}"),
            object_type="DIM_STYLE_RECORD",
            name=str(name),
            table_name="dim_styles",
            variables=dict(props),
            raw_properties=dict(props),
            normalized_properties=dict(props),
        ))
    return table


def build_block_table(raw: Dict[str, Dict[str, object]]) -> AcDbBlockTable:
    table = AcDbBlockTable()
    for name, props in raw.items():
        entity_ids_raw = props.get("entity_ids") if isinstance(props, dict) else None
        entity_ids = [str(v) for v in entity_ids_raw] if isinstance(entity_ids_raw, list) else []
        table.add(AcDbBlockTableRecord(
            object_id=cad_object_id(f"block:{name}"),
            object_type="BLOCK_RECORD",
            name=str(name),
            table_name="blocks",
            origin=dict(props.get("origin")) if isinstance(props.get("origin"), dict) else {},
            entity_ids=entity_ids,
            properties=dict(props),
            raw_properties=dict(props),
            normalized_properties=dict(props),
        ))
    return table


def _optional_int(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except Exception:
        return None


def _optional_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except Exception:
        return None
