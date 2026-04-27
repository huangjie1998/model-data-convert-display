from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EntityCategory:
    name: str
    autocad_types: tuple[str, ...]
    parser_module: str
    frontend_entity_module: str
    renderer_module: str


ENTITY_CATEGORIES: tuple[EntityCategory, ...] = (
    EntityCategory("text", ("TEXT", "ATTRIB", "ATTDEF"), "server.dwg.entities.text", "glx/entities/textEntity.ts", "glx/renderers/text/textEntityRenderer.ts"),
    EntityCategory("mtext", ("MTEXT",), "server.dwg.entities.mtext", "glx/entities/mtextEntity.ts", "glx/renderers/text/mtextEntityRenderer.ts"),
    EntityCategory("dimension", ("DIMENSION",), "server.dwg.dimension", "glx/entities/dimensionEntity.ts", "glx/renderers/dimensionRenderer.ts"),
    EntityCategory("line", ("LINE",), "server.dwg.entities.line", "glx/entities/lineEntity.ts", "glx/renderers/lineRenderer.ts"),
    EntityCategory("polyline", ("LWPOLYLINE", "POLYLINE"), "server.dwg.entities.polyline", "glx/entities/polylineEntity.ts", "glx/renderers/polylineRenderer.ts"),
    EntityCategory("arc", ("ARC",), "server.dwg.entities.arc", "glx/entities/arcEntity.ts", "glx/renderers/arcRenderer.ts"),
    EntityCategory("circle", ("CIRCLE",), "server.dwg.entities.circle", "glx/entities/circleEntity.ts", "glx/renderers/circleRenderer.ts"),
    EntityCategory("ellipse", ("ELLIPSE",), "server.dwg.entities.ellipse", "glx/entities/ellipseEntity.ts", "glx/renderers/ellipseRenderer.ts"),
    EntityCategory("spline", ("SPLINE",), "server.dwg.entities.spline", "glx/entities/splineEntity.ts", "glx/renderers/polylineRenderer.ts"),
    EntityCategory("hatch", ("HATCH",), "server.dwg.entities.hatch", "glx/entities/hatchEntity.ts", "glx/renderers/polygonRenderer.ts"),
    EntityCategory("block", ("INSERT", "BLOCK_REFERENCE", "BLOCKREF"), "server.dwg.entities.block", "glx/entities/blockEntity.ts", "glx/renderers/blockRenderer.ts"),
    EntityCategory("point", ("POINT",), "server.dwg.entities.point", "glx/entities/pointEntity.ts", "glx/renderers/pointRenderer.ts"),
    EntityCategory("table", ("TABLE", "ACAD_TABLE"), "server.dwg.entities.table", "glx/entities/tableEntity.ts", "glx/renderers/tableRenderer.ts"),
    EntityCategory("wipeout_solid_trace", ("WIPEOUT", "SOLID", "TRACE"), "server.dwg.entities.surface", "glx/entities/hatchEntity.ts", "glx/renderers/polygonRenderer.ts"),
)


def categorize_entity_type(raw_type: object) -> EntityCategory | None:
    entity_type = str(raw_type or "").strip().upper()
    if not entity_type:
        return None
    for category in ENTITY_CATEGORIES:
        if entity_type in category.autocad_types:
            return category
    return None
