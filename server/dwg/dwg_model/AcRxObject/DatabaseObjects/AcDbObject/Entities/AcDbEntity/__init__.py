from __future__ import annotations

from typing import Any

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.ac_db_entity import AcDbEntity

_EXPORTS = {
    "AcDb3dSolid": ".Modeling2D3D",
    "AcDbBlockBegin": ".BracketEntities",
    "AcDbBlockEnd": ".BracketEntities",
    "AcDbBlockReference": ".Basics",
    "AcDbBody": ".Modeling2D3D",
    "AcDbCamera": ".Basics",
    "AcDbCurve": ".Curves",
    "AcDbDimension": ".Dimensions",
    "AcDbFace": ".Basics",
    "AcDbFrame": ".Basics",
    "AcDbHatch": ".Basics",
    "AcDbImage": ".Basics",
    "AcDbLight": ".Basics",
    "AcDbMInsertBlock": ".Basics",
    "AcDbMLeader": ".Basics",
    "AcDbMText": ".Basics",
    "AcDbMline": ".Basics",
    "AcDbOle2Frame": ".Basics",
    "AcDbOleFrame": ".Basics",
    "AcDbPoint": ".Basics",
    "AcDbPointCloud": ".Basics",
    "AcDbPointCloudEx": ".Basics",
    "AcDbPolyFaceMesh": ".Basics",
    "AcDbPolygonMesh": ".Basics",
    "AcDbProxyEntity": ".Basics",
    "AcDbRasterImage": ".Basics",
    "AcDbRegion": ".Modeling2D3D",
    "AcDbSection": ".Basics",
    "AcDbSequenceEnd": ".BracketEntities",
    "AcDbShape": ".Basics",
    "AcDbSolid": ".Basics",
    "AcDbSubDMesh": ".Modeling2D3D",
    "AcDbSurface": ".Surfaces",
    "AcDbTable": ".Basics",
    "AcDbText": ".Basics",
    "AcDbUnderlayReference": ".Underlays",
    "AcDbVertex": ".VertexSubentities",
    "AcDbViewBorder": ".ModelDocumentation",
    "AcDbViewRepBlockReference": ".Basics",
    "AcDbViewSymbol": ".ModelDocumentation",
    "AcDbViewport": ".Basics",
}


def __getattr__(name: str) -> Any:
    if name in _EXPORTS:
        import importlib

        value = getattr(importlib.import_module(_EXPORTS[name], __name__), name)
        globals()[name] = value
        return value
    raise AttributeError(name)


__all__ = ["AcDbEntity", *sorted(_EXPORTS)]

import sys as _sys
_sys.modules[__package__.rsplit(".", 1)[0]].AcDbEntity = AcDbEntity
