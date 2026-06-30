from __future__ import annotations

from typing import Dict

from server.dwg.cad_model.tables.blocks import CadBlockTable


def block_entity_id_map(block_table: CadBlockTable) -> Dict[str, list[str]]:
    return {name: list(record.entity_ids) for name, record in block_table.records.items()}
