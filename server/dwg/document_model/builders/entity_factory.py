from __future__ import annotations

from typing import Dict, Type

from server.dwg.document_model.diagnostics import diagnostic
from server.dwg.document_model.entities.annotations.shape import CadShape
from server.dwg.document_model.entities.annotations.underlay import CadUnderlay
from server.dwg.document_model.entities.base import CadEntity, UnsupportedCadEntity
from server.dwg.document_model.entities.blocks.block_begin import CadBlockBegin
from server.dwg.document_model.entities.blocks.block_end import CadBlockEnd
from server.dwg.document_model.entities.blocks.insert import CadBlockReference
from server.dwg.document_model.entities.blocks.minsert_block import CadMInsertBlock
from server.dwg.document_model.entities.blocks.view_rep_block_reference import CadViewRepBlockReference
from server.dwg.document_model.entities.common import entity_bbox, entity_geometry, entity_style
from server.dwg.document_model.entities.curves.arc import CadArc
from server.dwg.document_model.entities.curves.circle import CadCircle
from server.dwg.document_model.entities.curves.ellipse import CadEllipse
from server.dwg.document_model.entities.curves.helix import CadHelix
from server.dwg.document_model.entities.curves.line import CadLine
from server.dwg.document_model.entities.curves.lwpolyline import CadLwPolyline
from server.dwg.document_model.entities.curves.mline import CadMLine
from server.dwg.document_model.entities.curves.polyline import CadPolyline
from server.dwg.document_model.entities.curves.polyline2d import Cad2dPolyline
from server.dwg.document_model.entities.curves.polyline3d import Cad3dPolyline
from server.dwg.document_model.entities.curves.spline import CadSpline
from server.dwg.document_model.entities.curves.xline import CadXline
from server.dwg.document_model.entities.dimensions.aligned import CadAlignedDimension
from server.dwg.document_model.entities.dimensions.angular import CadAngularDimension
from server.dwg.document_model.entities.dimensions.arc_length import CadArcLengthDimension
from server.dwg.document_model.entities.dimensions.diametric import CadDiametricDimension
from server.dwg.document_model.entities.dimensions.feature_control_frame import CadFeatureControlFrame
from server.dwg.document_model.entities.dimensions.linear import CadLinearDimension
from server.dwg.document_model.entities.dimensions.ordinate import CadOrdinateDimension
from server.dwg.document_model.entities.dimensions.radial import CadRadialDimension
from server.dwg.document_model.entities.dimensions.tolerance import CadTolerance
from server.dwg.document_model.entities.leaders.leader import CadLeader
from server.dwg.document_model.entities.leaders.mleader import CadMLeader
from server.dwg.document_model.entities.ole.frame import CadFrame
from server.dwg.document_model.entities.ole.ole_frame import CadOleFrame
from server.dwg.document_model.entities.ole.ole2frame import CadOle2Frame
from server.dwg.document_model.entities.planar.face3d import Cad3dFace
from server.dwg.document_model.entities.planar.hatch import CadHatch
from server.dwg.document_model.entities.planar.solid import CadSolid
from server.dwg.document_model.entities.planar.wipeout import CadWipeout
from server.dwg.document_model.entities.pointcloud.point_cloud import CadPointCloud
from server.dwg.document_model.entities.pointcloud.point_cloud_ex import CadPointCloudEx
from server.dwg.document_model.entities.points.point import CadPoint
from server.dwg.document_model.entities.proxy.proxy_entity import CadProxyEntity
from server.dwg.document_model.entities.raster.image import CadRasterImage
from server.dwg.document_model.entities.solids3d.body import CadBody
from server.dwg.document_model.entities.solids3d.extruded_surface import CadExtrudedSurface
from server.dwg.document_model.entities.solids3d.mesh import CadMesh
from server.dwg.document_model.entities.solids3d.nurb_surface import CadNurbSurface
from server.dwg.document_model.entities.solids3d.plane_surface import CadPlaneSurface
from server.dwg.document_model.entities.solids3d.poly_face_mesh import CadPolyFaceMesh
from server.dwg.document_model.entities.solids3d.polygon_mesh import CadPolygonMesh
from server.dwg.document_model.entities.solids3d.region import CadRegion
from server.dwg.document_model.entities.solids3d.revolved_surface import CadRevolvedSurface
from server.dwg.document_model.entities.solids3d.solid3d import Cad3dSolid
from server.dwg.document_model.entities.solids3d.surface import CadSurface
from server.dwg.document_model.entities.solids3d.swept_surface import CadSweptSurface
from server.dwg.document_model.entities.tables.table import CadTable
from server.dwg.document_model.entities.text.attribute import CadAttribute
from server.dwg.document_model.entities.text.attribute_definition import CadAttributeDefinition
from server.dwg.document_model.entities.text.mtext import CadMText
from server.dwg.document_model.entities.text.text import CadDbText
from server.dwg.document_model.entities.topology.face_record import CadFaceRecord
from server.dwg.document_model.entities.topology.poly_face_mesh_vertex import CadPolyFaceMeshVertex
from server.dwg.document_model.entities.topology.polygon_mesh_vertex import CadPolygonMeshVertex
from server.dwg.document_model.entities.topology.polyline_vertex3d import Cad3dPolylineVertex
from server.dwg.document_model.entities.topology.sequence_end import CadSequenceEnd
from server.dwg.document_model.entities.topology.vertex import CadVertex
from server.dwg.document_model.entities.topology.vertex2d import Cad2dVertex
from server.dwg.document_model.entities.visual.camera import CadCamera
from server.dwg.document_model.entities.visual.light import CadLight
from server.dwg.document_model.entities.visual.section import CadSection
from server.dwg.document_model.entities.visual.view_border import CadViewBorder
from server.dwg.document_model.entities.visual.view_symbol import CadViewSymbol
from server.dwg.document_model.entities.viewports.viewport import CadViewport
from server.dwg.document_model.identity.object_id import cad_object_id

_ENTITY_CLASSES: Dict[str, Type[CadEntity]] = {
    "LINE": CadLine,
    "CIRCLE": CadCircle,
    "ARC": CadArc,
    "ELLIPSE": CadEllipse,
    "POLYLINE": CadPolyline,
    "2DPOLYLINE": Cad2dPolyline,
    "2D_POLYLINE": Cad2dPolyline,
    "3DPOLYLINE": Cad3dPolyline,
    "3D_POLYLINE": Cad3dPolyline,
    "LWPOLYLINE": CadLwPolyline,
    "XLINE": CadXline,
    "RAY": CadXline,
    "SPLINE": CadSpline,
    "HELIX": CadHelix,
    "MLINE": CadMLine,
    "HATCH": CadHatch,
    "SOLID": CadSolid,
    "TRACE": CadSolid,
    "3DFACE": Cad3dFace,
    "FACE": Cad3dFace,
    "WIPEOUT": CadWipeout,
    "VIEWPORT": CadViewport,
    "CAMERA": CadCamera,
    "LIGHT": CadLight,
    "SECTION": CadSection,
    "VIEWBORDER": CadViewBorder,
    "VIEW_BORDER": CadViewBorder,
    "VIEWSYMBOL": CadViewSymbol,
    "VIEW_SYMBOL": CadViewSymbol,
    "SHAPE": CadShape,
    "UNDERLAY": CadUnderlay,
    "UNDERLAYREFERENCE": CadUnderlay,
    "UNDERLAY_REFERENCE": CadUnderlay,
    "PDFUNDERLAY": CadUnderlay,
    "DGNUNDERLAY": CadUnderlay,
    "DWFUNDERLAY": CadUnderlay,
    "TEXT": CadDbText,
    "MTEXT": CadMText,
    "ATTRIB": CadAttribute,
    "ATTDEF": CadAttributeDefinition,
    "LEADER": CadLeader,
    "MLEADER": CadMLeader,
    "MULTILEADER": CadMLeader,
    "TOLERANCE": CadTolerance,
    "FCF": CadFeatureControlFrame,
    "FEATURECONTROLFRAME": CadFeatureControlFrame,
    "FEATURE_CONTROL_FRAME": CadFeatureControlFrame,
    "VERTEX": CadVertex,
    "2DVERTEX": Cad2dVertex,
    "2D_VERTEX": Cad2dVertex,
    "3DPOLYLINEVERTEX": Cad3dPolylineVertex,
    "3D_POLYLINE_VERTEX": Cad3dPolylineVertex,
    "FACERECORD": CadFaceRecord,
    "FACE_RECORD": CadFaceRecord,
    "POLYFACEMESHVERTEX": CadPolyFaceMeshVertex,
    "POLY_FACE_MESH_VERTEX": CadPolyFaceMeshVertex,
    "POLYGONMESHVERTEX": CadPolygonMeshVertex,
    "POLYGON_MESH_VERTEX": CadPolygonMeshVertex,
    "SEQEND": CadSequenceEnd,
    "SEQUENCEEND": CadSequenceEnd,
    "SEQUENCE_END": CadSequenceEnd,
    "BLOCKBEGIN": CadBlockBegin,
    "BLOCK_BEGIN": CadBlockBegin,
    "BLOCKEND": CadBlockEnd,
    "BLOCK_END": CadBlockEnd,
    "INSERT": CadBlockReference,
    "BLOCK_REFERENCE": CadBlockReference,
    "BLOCKREF": CadBlockReference,
    "MINSERTBLOCK": CadMInsertBlock,
    "MINSERT": CadMInsertBlock,
    "VIEWREPBLOCKREFERENCE": CadViewRepBlockReference,
    "VIEW_REP_BLOCK_REFERENCE": CadViewRepBlockReference,
    "TABLE": CadTable,
    "ACAD_TABLE": CadTable,
    "POINT": CadPoint,
    "3DSOLID": Cad3dSolid,
    "BODY": CadBody,
    "SURFACE": CadSurface,
    "EXTRUDEDSURFACE": CadExtrudedSurface,
    "EXTRUDED_SURFACE": CadExtrudedSurface,
    "NURBSURFACE": CadNurbSurface,
    "NURB_SURFACE": CadNurbSurface,
    "PLANESURFACE": CadPlaneSurface,
    "PLANE_SURFACE": CadPlaneSurface,
    "REVOLVEDSURFACE": CadRevolvedSurface,
    "REVOLVED_SURFACE": CadRevolvedSurface,
    "SWEPTSURFACE": CadSweptSurface,
    "SWEPT_SURFACE": CadSweptSurface,
    "REGION": CadRegion,
    "MESH": CadMesh,
    "SUBDMESH": CadMesh,
    "SUBD_MESH": CadMesh,
    "POLYGONMESH": CadPolygonMesh,
    "POLYGON_MESH": CadPolygonMesh,
    "POLYFACEMESH": CadPolyFaceMesh,
    "POLY_FACE_MESH": CadPolyFaceMesh,
    "MPOLYGON": CadHatch,
    "POINTCLOUD": CadPointCloud,
    "POINT_CLOUD": CadPointCloud,
    "POINTCLOUDEX": CadPointCloudEx,
    "POINT_CLOUD_EX": CadPointCloudEx,
    "IMAGE": CadRasterImage,
    "RASTERIMAGE": CadRasterImage,
    "FRAME": CadFrame,
    "OLEFRAME": CadOleFrame,
    "OLE2FRAME": CadOle2Frame,
    "ACAD_PROXY_ENTITY": CadProxyEntity,
    "PROXY_ENTITY": CadProxyEntity,
    "PROXY": CadProxyEntity,
}

_DIMENSION_CLASSES: Dict[str, Type[CadEntity]] = {
    "aligned": CadAlignedDimension,
    "linear": CadLinearDimension,
    "rotated": CadLinearDimension,
    "angular": CadAngularDimension,
    "arc_length": CadArcLengthDimension,
    "diameter": CadDiametricDimension,
    "diametric": CadDiametricDimension,
    "radius": CadRadialDimension,
    "radial": CadRadialDimension,
    "ordinate": CadOrdinateDimension,
}


def build_entity_from_raw(raw: Dict[str, object], *, space_id: str, index: int, block_reference: bool = False) -> CadEntity:
    entity_type = str(raw.get("type") or "UNKNOWN").strip().upper() or "UNKNOWN"
    geom = entity_geometry(raw)
    cls = _entity_class(entity_type, geom)
    object_id_value = str(raw.get("id") or raw.get("handle") or f"{space_id}:{entity_type}:{index}")
    handle = str(raw.get("handle") or "")
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
    if isinstance(entity, UnsupportedCadEntity):
        entity.add_diagnostic(diagnostic("unsupported_entity_type", f"Unsupported entity type: {entity_type}", object_id=entity.id, entity_type=entity_type))
    return entity


def _entity_class(entity_type: str, geom: Dict[str, object]) -> Type[CadEntity]:
    if entity_type == "DIMENSION":
        dim_kind = str(geom.get("dim_kind") or "").strip().lower()
        return _DIMENSION_CLASSES.get(dim_kind, CadLinearDimension)
    return _ENTITY_CLASSES.get(entity_type, UnsupportedCadEntity)
