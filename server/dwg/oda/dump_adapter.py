from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import re
from typing import Dict, List, Optional, Tuple

from server.dwg.common.parse_utils import (
    _ENTITY_START_RE,
    _parse_float_value,
    _parse_int_value,
    _parse_label_value,
    _parse_point_value,
)

_ACDB_TAG_RE = re.compile(r"^\s*<(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*(?:\[(?P<handle>[0-9A-Fa-f]+)\])?\s*$")
_TABLE_RECORD_TYPES = {
    "AcDbLayerTableRecord",
    "AcDbLinetypeTableRecord",
    "AcDbTextStyleTableRecord",
    "AcDbDimStyleTableRecord",
    "AcDbBlockTableRecord",
    "AcDbViewTableRecord",
    "AcDbViewportTableRecord",
    "AcDbUCSTableRecord",
    "AcDbRegAppTableRecord",
}


class OdaRecordCategory(str, Enum):
    HEADER = "header"
    TABLE = "table"
    BLOCK = "block"
    ENTITY = "entity"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class OdaSourceSpan:
    start_line: int
    end_line: int


@dataclass
class OdaDumpRecord:
    source_type: str
    category: OdaRecordCategory
    handle: str = ""
    raw_lines: List[str] = field(default_factory=list)
    source_span: OdaSourceSpan = field(default_factory=lambda: OdaSourceSpan(0, 0))
    raw_properties: Dict[str, object] = field(default_factory=dict)
    parsed_properties: Dict[str, object] = field(default_factory=dict)
    diagnostics: List[str] = field(default_factory=list)


@dataclass
class OdaDumpDocument:
    header_records: List[OdaDumpRecord] = field(default_factory=list)
    table_records_by_type: Dict[str, List[OdaDumpRecord]] = field(default_factory=dict)
    block_records: List[OdaDumpRecord] = field(default_factory=list)
    entity_records_by_type: Dict[str, List[OdaDumpRecord]] = field(default_factory=dict)
    unknown_records: List[OdaDumpRecord] = field(default_factory=list)
    diagnostics: List[str] = field(default_factory=list)

    @property
    def table_records(self) -> List[OdaDumpRecord]:
        return [record for records in self.table_records_by_type.values() for record in records]

    @property
    def entity_records(self) -> List[OdaDumpRecord]:
        return [record for records in self.entity_records_by_type.values() for record in records]

    def records_by_category(self, category: OdaRecordCategory) -> List[OdaDumpRecord]:
        if category == OdaRecordCategory.HEADER:
            return list(self.header_records)
        if category == OdaRecordCategory.TABLE:
            return self.table_records
        if category == OdaRecordCategory.BLOCK:
            return list(self.block_records)
        if category == OdaRecordCategory.ENTITY:
            return self.entity_records
        return list(self.unknown_records)


def parse_oda_dump_document(dump_text: str) -> OdaDumpDocument:
    document = OdaDumpDocument()
    header_lines: List[Tuple[int, str]] = []
    current_type: Optional[str] = None
    current_handle = ""
    current_start_line = 0
    current_lines: List[str] = []

    def finalize_current(end_line: int) -> None:
        nonlocal current_type, current_handle, current_start_line, current_lines, header_lines
        if current_type is None:
            return
        record = _build_record(
            source_type=current_type,
            handle=current_handle,
            raw_lines=current_lines,
            start_line=current_start_line,
            end_line=end_line,
        )
        _append_record(document, record)
        current_type = None
        current_handle = ""
        current_start_line = 0
        current_lines = []

    lines = dump_text.splitlines()
    for index, raw in enumerate(lines, start=1):
        entity_match = _ENTITY_START_RE.match(raw)
        tag_match = _ACDB_TAG_RE.match(raw)
        if entity_match or tag_match:
            finalize_current(index - 1)
            if current_type is None and not document.header_records and header_lines:
                header_record = _build_record(
                    source_type="HEADER",
                    handle="",
                    raw_lines=[line for _line_no, line in header_lines],
                    start_line=header_lines[0][0],
                    end_line=header_lines[-1][0],
                    category=OdaRecordCategory.HEADER,
                )
                document.header_records.append(header_record)
                header_lines = []
            match = entity_match or tag_match
            current_type = str(match.group("etype"))
            current_handle = str(match.group("handle") or "")
            current_start_line = index
            current_lines = [raw]
            continue

        if current_type is None:
            if raw.strip():
                header_lines.append((index, raw))
            continue
        current_lines.append(raw)

    finalize_current(len(lines))
    if not document.header_records and header_lines:
        document.header_records.append(
            _build_record(
                source_type="HEADER",
                handle="",
                raw_lines=[line for _line_no, line in header_lines],
                start_line=header_lines[0][0],
                end_line=header_lines[-1][0],
                category=OdaRecordCategory.HEADER,
            )
        )
    return document


def _build_record(
    *,
    source_type: str,
    handle: str,
    raw_lines: List[str],
    start_line: int,
    end_line: int,
    category: Optional[OdaRecordCategory] = None,
) -> OdaDumpRecord:
    raw_properties: Dict[str, object] = {}
    parsed_properties: Dict[str, object] = {}
    diagnostics: List[str] = []
    for raw in raw_lines[1:] if source_type != "HEADER" else raw_lines:
        label, value = _parse_label_value(raw)
        if not label or value is None:
            continue
        _store_property(raw_properties, label, value)
        parsed = _parse_scalar_value(value)
        if parsed is not None:
            _store_property(parsed_properties, label, parsed)
    return OdaDumpRecord(
        source_type=source_type,
        category=category or _record_category(source_type),
        handle=handle,
        raw_lines=list(raw_lines),
        source_span=OdaSourceSpan(start_line=start_line, end_line=max(start_line, end_line)),
        raw_properties=raw_properties,
        parsed_properties=parsed_properties,
        diagnostics=diagnostics,
    )


def _append_record(document: OdaDumpDocument, record: OdaDumpRecord) -> None:
    if record.category == OdaRecordCategory.HEADER:
        document.header_records.append(record)
    elif record.category == OdaRecordCategory.TABLE:
        document.table_records_by_type.setdefault(record.source_type, []).append(record)
        if record.source_type == "AcDbBlockTableRecord":
            document.block_records.append(record)
    elif record.category == OdaRecordCategory.BLOCK:
        document.block_records.append(record)
    elif record.category == OdaRecordCategory.ENTITY:
        document.entity_records_by_type.setdefault(record.source_type, []).append(record)
    else:
        document.unknown_records.append(record)


def _record_category(source_type: str) -> OdaRecordCategory:
    if source_type == "HEADER":
        return OdaRecordCategory.HEADER
    if source_type in _TABLE_RECORD_TYPES:
        return OdaRecordCategory.TABLE
    if source_type.startswith("AcDb"):
        return OdaRecordCategory.ENTITY
    return OdaRecordCategory.UNKNOWN


def _store_property(target: Dict[str, object], label: str, value: object) -> None:
    existing = target.get(label)
    if existing is None:
        target[label] = value
    elif isinstance(existing, list):
        existing.append(value)
    else:
        target[label] = [existing, value]


def _parse_scalar_value(value: str) -> object:
    point = _parse_point_value(value)
    if point is not None:
        return point
    stripped = value.strip()
    lower = stripped.lower()
    if lower in ("true", "false", "ktrue", "kfalse"):
        return lower in ("true", "ktrue")
    parsed_int = _parse_int_value(stripped)
    if parsed_int is not None and re.fullmatch(r"[-+]?\d+", stripped):
        return parsed_int
    parsed_float = _parse_float_value(stripped)
    if parsed_float is not None:
        return parsed_float
    return None
