from __future__ import annotations

from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTables.AcDbSymbolTable import AcDbBlockTable


def block_entity_id_map(block_table: AcDbBlockTable) -> Dict[str, list[str]]:
    return {name: list(record.entity_ids) for name, record in block_table.records.items()}
