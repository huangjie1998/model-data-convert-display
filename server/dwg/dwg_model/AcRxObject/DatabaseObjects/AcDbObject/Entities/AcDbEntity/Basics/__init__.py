from __future__ import annotations

from typing import Any

_EXPORTS = {
    "AcDbBlockReference": ".ac_db_block_reference",
    "AcDbCamera": ".ac_db_camera",
    "AcDbFace": ".ac_db_face",
    "AcDbFrame": ".ac_db_frame",
    "AcDbHatch": ".ac_db_hatch",
    "AcDbImage": ".ac_db_image",
    "AcDbLight": ".ac_db_light",
    "AcDbMLeader": ".ac_db_mleader",
    "AcDbMText": ".ac_db_mtext",
    "AcDbMline": ".ac_db_mline",
    "AcDbPoint": ".ac_db_point",
    "AcDbPointCloud": ".ac_db_point_cloud",
    "AcDbPointCloudEx": ".ac_db_point_cloud_ex",
    "AcDbPolyFaceMesh": ".ac_db_poly_face_mesh",
    "AcDbPolygonMesh": ".ac_db_polygon_mesh",
    "AcDbProxyEntity": ".ac_db_proxy_entity",
    "AcDbSection": ".ac_db_section",
    "AcDbShape": ".ac_db_shape",
    "AcDbSolid": ".ac_db_solid",
    "AcDbText": ".ac_db_text",
    "AcDbViewport": ".ac_db_viewport",
    "AcDbMInsertBlock": ".AcDbBlockReference",
    "AcDbTable": ".AcDbBlockReference",
    "AcDbViewRepBlockReference": ".AcDbBlockReference",
    "AcDbOleFrame": ".AcDbFrame",
    "AcDbOle2Frame": ".AcDbFrame",
    "AcDbRasterImage": ".AcDbImage",
    "AcDbWipeout": ".AcDbImage",
}


def __getattr__(name: str) -> Any:
    if name in _EXPORTS:
        import importlib

        value = getattr(importlib.import_module(_EXPORTS[name], __name__), name)
        globals()[name] = value
        return value
    raise AttributeError(name)


__all__ = sorted(_EXPORTS)
import importlib as _importlib
import sys as _sys
import types as _types

_CLASS_EXPORTS = {'AcDbBlockReference': ('server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Basics.ac_db_block_reference', 'AcDbBlockReference'), 'AcDbFrame': ('server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Basics.ac_db_frame', 'AcDbFrame'), 'AcDbImage': ('server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Basics.ac_db_image', 'AcDbImage'), 'AcDbText': ('server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.Entities.AcDbEntity.Basics.ac_db_text', 'AcDbText')}

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
