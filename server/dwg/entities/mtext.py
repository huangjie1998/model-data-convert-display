from __future__ import annotations

from typing import List

from .primitives_common import Entity, Geom, Primitive, PrimitiveBuildContext
from .text import build_text_primitives


def build_mtext_primitives(ent: Entity, geom: Geom, context: PrimitiveBuildContext) -> List[Primitive]:
    return build_text_primitives(ent, geom, context)
