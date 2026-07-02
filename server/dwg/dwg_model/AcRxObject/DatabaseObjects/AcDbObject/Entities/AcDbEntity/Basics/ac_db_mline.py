from __future__ import annotations

from dataclasses import dataclass

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Curves.ac_db_curve import AcDbCurve


@dataclass
class AcDbMline(AcDbCurve):
    pass
