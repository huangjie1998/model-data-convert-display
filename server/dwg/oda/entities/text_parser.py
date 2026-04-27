from __future__ import annotations

from typing import Dict

from server.dwg.oda.entities.attdef_parser import build_attdef_entity
from server.dwg.oda.entities.attrib_parser import build_attrib_entity
from server.dwg.oda.entities.common import NOT_HANDLED
from server.dwg.oda.entities.mtext_parser import build_mtext_entity
from server.dwg.oda.entities.text_single_parser import build_single_line_text_entity


def build_text_entity(state: Dict[str, object], context) -> Dict[str, object] | None | object:
    for builder in (
        build_single_line_text_entity,
        build_mtext_entity,
        build_attdef_entity,
        build_attrib_entity,
    ):
        result = builder(state, context)
        if result is not NOT_HANDLED:
            return result
    return NOT_HANDLED
