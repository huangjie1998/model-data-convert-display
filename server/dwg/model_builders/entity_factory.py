from __future__ import annotations

from typing import Dict, Type

from server.dwg.model_core.diagnostics import diagnostic
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.ac_db_entity import AcDbEntity
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Basics import (
    AcDbBlockReference,
    AcDbCamera,
    AcDbFace,
    AcDbFrame,
    AcDbHatch,
    AcDbLight,
    AcDbMInsertBlock,
    AcDbMLeader,
    AcDbMText,
    AcDbMline,
    AcDbOle2Frame,
    AcDbOleFrame,
    AcDbPoint,
    AcDbPointCloud,
    AcDbPointCloudEx,
    AcDbPolyFaceMesh,
    AcDbPolygonMesh,
    AcDbProxyEntity,
    AcDbRasterImage,
    AcDbSection,
    AcDbShape,
    AcDbSolid,
    AcDbTable,
    AcDbText,
    AcDbViewRepBlockReference,
    AcDbViewport,
    AcDbWipeout,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Basics.AcDbText import (
    AcDbAttribute,
    AcDbAttributeDefinition,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.BracketEntities import (
    AcDbBlockBegin,
    AcDbBlockEnd,
    AcDbSequenceEnd,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Curves.AcDbCurve import (
    AcDb2dPolyline,
    AcDb3dPolyline,
    AcDbArc,
    AcDbCircle,
    AcDbEllipse,
    AcDbHelix,
    AcDbLeader,
    AcDbLine,
    AcDbPolyline,
    AcDbSpline,
    AcDbXline,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Dimensions.AcDbDimension import (
    AcDbAlignedDimension,
    AcDbAngularDimension,
    AcDbArcDimension,
    AcDbDiametricDimension,
    AcDbOrdinateDimension,
    AcDbRadialDimension,
    AcDbRadialDimensionLarge,
    AcDbRotatedDimension,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.ModelDocumentation import (
    AcDbViewBorder,
    AcDbViewSymbol,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Modeling2D3D import (
    AcDb3dSolid,
    AcDbBody,
    AcDbRegion,
    AcDbSubDMesh,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Surfaces import AcDbSurface
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Surfaces.AcDbSurface import (
    AcDbExtrudedSurface,
    AcDbNurbSurface,
    AcDbPlaneSurface,
    AcDbRevolvedSurface,
    AcDbSweptSurface,
)
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Underlays import AcDbUnderlayReference
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.VertexSubentities import AcDbVertex
from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.VertexSubentities.AcDbVertex import (
    AcDb2dVertex,
    AcDb3dPolylineVertex,
    AcDbFaceRecord,
    AcDbPolyFaceMeshVertex,
    AcDbPolygonMeshVertex,
)
from server.dwg.model_builders.entity_common import entity_bbox, entity_geometry, entity_style
from server.dwg.model_core.identity.object_id import cad_object_id

_ENTITY_CLASSES: Dict[str, Type[AcDbEntity]] = {
    "LINE": AcDbLine,
    "CIRCLE": AcDbCircle,
    "ARC": AcDbArc,
    "ELLIPSE": AcDbEllipse,
    "POLYLINE": AcDbPolyline,
    "2DPOLYLINE": AcDb2dPolyline,
    "2D_POLYLINE": AcDb2dPolyline,
    "3DPOLYLINE": AcDb3dPolyline,
    "3D_POLYLINE": AcDb3dPolyline,
    "LWPOLYLINE": AcDbPolyline,
    "XLINE": AcDbXline,
    "RAY": AcDbXline,
    "SPLINE": AcDbSpline,
    "HELIX": AcDbHelix,
    "MLINE": AcDbMline,
    "HATCH": AcDbHatch,
    "SOLID": AcDbSolid,
    "TRACE": AcDbSolid,
    "3DFACE": AcDbFace,
    "FACE": AcDbFace,
    "WIPEOUT": AcDbWipeout,
    "VIEWPORT": AcDbViewport,
    "CAMERA": AcDbCamera,
    "LIGHT": AcDbLight,
    "SECTION": AcDbSection,
    "VIEWBORDER": AcDbViewBorder,
    "VIEW_BORDER": AcDbViewBorder,
    "VIEWSYMBOL": AcDbViewSymbol,
    "VIEW_SYMBOL": AcDbViewSymbol,
    "SHAPE": AcDbShape,
    "UNDERLAY": AcDbUnderlayReference,
    "UNDERLAYREFERENCE": AcDbUnderlayReference,
    "UNDERLAY_REFERENCE": AcDbUnderlayReference,
    "PDFUNDERLAY": AcDbUnderlayReference,
    "DGNUNDERLAY": AcDbUnderlayReference,
    "DWFUNDERLAY": AcDbUnderlayReference,
    "TEXT": AcDbText,
    "MTEXT": AcDbMText,
    "ATTRIB": AcDbAttribute,
    "ATTDEF": AcDbAttributeDefinition,
    "LEADER": AcDbLeader,
    "MLEADER": AcDbMLeader,
    "MULTILEADER": AcDbMLeader,
    "VERTEX": AcDbVertex,
    "2DVERTEX": AcDb2dVertex,
    "2D_VERTEX": AcDb2dVertex,
    "3DPOLYLINEVERTEX": AcDb3dPolylineVertex,
    "3D_POLYLINE_VERTEX": AcDb3dPolylineVertex,
    "FACERECORD": AcDbFaceRecord,
    "FACE_RECORD": AcDbFaceRecord,
    "POLYFACEMESHVERTEX": AcDbPolyFaceMeshVertex,
    "POLY_FACE_MESH_VERTEX": AcDbPolyFaceMeshVertex,
    "POLYGONMESHVERTEX": AcDbPolygonMeshVertex,
    "POLYGON_MESH_VERTEX": AcDbPolygonMeshVertex,
    "SEQEND": AcDbSequenceEnd,
    "SEQUENCEEND": AcDbSequenceEnd,
    "SEQUENCE_END": AcDbSequenceEnd,
    "BLOCKBEGIN": AcDbBlockBegin,
    "BLOCK_BEGIN": AcDbBlockBegin,
    "BLOCKEND": AcDbBlockEnd,
    "BLOCK_END": AcDbBlockEnd,
    "INSERT": AcDbBlockReference,
    "BLOCK_REFERENCE": AcDbBlockReference,
    "BLOCKREF": AcDbBlockReference,
    "MINSERTBLOCK": AcDbMInsertBlock,
    "MINSERT": AcDbMInsertBlock,
    "VIEWREPBLOCKREFERENCE": AcDbViewRepBlockReference,
    "VIEW_REP_BLOCK_REFERENCE": AcDbViewRepBlockReference,
    "TABLE": AcDbTable,
    "ACAD_TABLE": AcDbTable,
    "POINT": AcDbPoint,
    "3DSOLID": AcDb3dSolid,
    "BODY": AcDbBody,
    "SURFACE": AcDbSurface,
    "EXTRUDEDSURFACE": AcDbExtrudedSurface,
    "EXTRUDED_SURFACE": AcDbExtrudedSurface,
    "NURBSURFACE": AcDbNurbSurface,
    "NURB_SURFACE": AcDbNurbSurface,
    "PLANESURFACE": AcDbPlaneSurface,
    "PLANE_SURFACE": AcDbPlaneSurface,
    "REVOLVEDSURFACE": AcDbRevolvedSurface,
    "REVOLVED_SURFACE": AcDbRevolvedSurface,
    "SWEPTSURFACE": AcDbSweptSurface,
    "SWEPT_SURFACE": AcDbSweptSurface,
    "REGION": AcDbRegion,
    "MESH": AcDbSubDMesh,
    "SUBDMESH": AcDbSubDMesh,
    "SUBD_MESH": AcDbSubDMesh,
    "POLYGONMESH": AcDbPolygonMesh,
    "POLYGON_MESH": AcDbPolygonMesh,
    "POLYFACEMESH": AcDbPolyFaceMesh,
    "POLY_FACE_MESH": AcDbPolyFaceMesh,
    "MPOLYGON": AcDbHatch,
    "POINTCLOUD": AcDbPointCloud,
    "POINT_CLOUD": AcDbPointCloud,
    "POINTCLOUDEX": AcDbPointCloudEx,
    "POINT_CLOUD_EX": AcDbPointCloudEx,
    "IMAGE": AcDbRasterImage,
    "RASTERIMAGE": AcDbRasterImage,
    "FRAME": AcDbFrame,
    "OLEFRAME": AcDbOleFrame,
    "OLE2FRAME": AcDbOle2Frame,
    "ACAD_PROXY_ENTITY": AcDbProxyEntity,
    "PROXY_ENTITY": AcDbProxyEntity,
    "PROXY": AcDbProxyEntity,
}

_DIMENSION_CLASSES: Dict[str, Type[AcDbEntity]] = {
    "aligned": AcDbAlignedDimension,
    "linear": AcDbRotatedDimension,
    "rotated": AcDbRotatedDimension,
    "angular": AcDbAngularDimension,
    "arc_length": AcDbArcDimension,
    "diameter": AcDbDiametricDimension,
    "diametric": AcDbDiametricDimension,
    "radius": AcDbRadialDimension,
    "radial": AcDbRadialDimension,
    "ordinate": AcDbOrdinateDimension,
}


def build_entity_from_raw(raw: Dict[str, object], *, space_id: str, index: int, block_reference: bool = False) -> AcDbEntity:
    entity_type = str(raw.get("type") or "UNKNOWN").strip().upper() or "UNKNOWN"
    geom = entity_geometry(raw)
    cls = _entity_class(entity_type, geom)
    object_id_value = str(raw.get("id") or raw.get("handle") or f"{space_id}:{entity_type}:{index}")
    handle = str(raw.get("handle") or "")
    unsupported = cls is AcDbEntity
    entity = cls(
        object_id=cad_object_id(object_id_value, handle=handle),
        object_type="BLOCK_REFERENCE" if block_reference else "ENTITY",
        handle=handle,
        owner_id=str(raw.get("parent_block_id") or space_id),
        raw_properties=dict(raw),
        normalized_properties=dict(raw.get("normalized_semantics")) if isinstance(raw.get("normalized_semantics"), dict) else {},
        entity_type=entity_type,
        owner_space_id=space_id,
        layer=str(raw.get("layer") or "0"),
        bbox=entity_bbox(raw),
        geometry=geom,
        style=entity_style(raw),
        resolved=dict(raw.get("resolved")) if isinstance(raw.get("resolved"), dict) else {},
        semantic_type=str(raw.get("semantic_type") or "unknown"),
        semantic_subtype=str(raw.get("semantic_subtype") or entity_type),
        source_acdb_type=str(raw.get("source_acdb_type") or ""),
        raw_entity=dict(raw),
    )
    if unsupported:
        entity.add_diagnostic(diagnostic("unsupported_entity_type", f"Unsupported entity type: {entity_type}", object_id=entity.id, entity_type=entity_type))
    return entity


def _entity_class(entity_type: str, geom: Dict[str, object]) -> Type[AcDbEntity]:
    if entity_type == "DIMENSION":
        dim_kind = str(geom.get("dim_kind") or "").strip().lower()
        return _DIMENSION_CLASSES.get(dim_kind, AcDbRotatedDimension)
    return _ENTITY_CLASSES.get(entity_type, AcDbEntity)
