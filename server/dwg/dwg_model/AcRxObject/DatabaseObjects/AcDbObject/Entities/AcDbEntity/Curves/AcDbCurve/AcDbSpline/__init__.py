from .ac_db_helix import AcDbHelix

__all__ = ["AcDbHelix"]

import sys as _sys
from ..ac_db_spline import AcDbSpline as _AcDbSpline
_sys.modules[__package__.rsplit(".", 1)[0]].AcDbSpline = _AcDbSpline
