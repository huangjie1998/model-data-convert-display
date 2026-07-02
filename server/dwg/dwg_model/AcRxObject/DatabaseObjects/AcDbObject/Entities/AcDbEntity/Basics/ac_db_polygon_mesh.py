from __future__ import annotations

from dataclasses import dataclass

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Modeling2D3D import AcDbSubDMesh


@dataclass
class AcDbPolygonMesh(AcDbSubDMesh):
    pass
