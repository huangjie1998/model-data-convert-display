from .ac_db_ole2_frame import AcDbOle2Frame

__all__ = ["AcDbOle2Frame"]

import sys as _sys
from ..ac_db_ole_frame import AcDbOleFrame as _AcDbOleFrame
_sys.modules[__package__.rsplit(".", 1)[0]].AcDbOleFrame = _AcDbOleFrame
