from .ac_db_arc import AcDbArc
from .ac_db_circle import AcDbCircle
from .ac_db_ellipse import AcDbEllipse
from .ac_db_leader import AcDbLeader
from .ac_db_line import AcDbLine
from .ac_db_polyline import AcDbPolyline
from .ac_db_spline import AcDbSpline
from .ac_db_xline import AcDbXline
from .ac_db_2d_polyline import AcDb2dPolyline
from .ac_db_3d_polyline import AcDb3dPolyline
from .ac_db_lw_polyline import AcDbPolyline
from .AcDbSpline import AcDbHelix

__all__ = [
    "AcDbLeader",
    "AcDbLine",
    "AcDbCircle",
    "AcDbArc",
    "AcDbEllipse",
    "AcDbPolyline",
    "AcDb2dPolyline",
    "AcDb3dPolyline",
    "AcDbPolyline",
    "AcDbXline",
    "AcDbSpline",
    "AcDbHelix",
]

import sys as _sys
from ..ac_db_curve import AcDbCurve as _AcDbCurve
_sys.modules[__package__.rsplit(".", 1)[0]].AcDbCurve = _AcDbCurve
import importlib as _importlib
import sys as _sys
import types as _types

_CLASS_EXPORTS = {'AcDbSpline': ('server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Curves.AcDbCurve.ac_db_spline', 'AcDbSpline')}

class _LayerModule(_types.ModuleType):
    def __getattribute__(self, name: str):
        exports = _types.ModuleType.__getattribute__(self, "__dict__").get("_CLASS_EXPORTS", {})
        if name in exports:
            current = _types.ModuleType.__getattribute__(self, "__dict__").get(name)
            if isinstance(current, _types.ModuleType):
                module_name, attr_name = exports[name]
                value = getattr(_importlib.import_module(module_name), attr_name)
                _types.ModuleType.__getattribute__(self, "__dict__")[name] = value
                return value
        return _types.ModuleType.__getattribute__(self, name)

_sys.modules[__name__].__class__ = _LayerModule
