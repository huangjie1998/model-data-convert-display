from .ac_db_attribute import AcDbAttribute
from .ac_db_attribute_definition import AcDbAttributeDefinition

__all__ = ["AcDbAttribute", "AcDbAttributeDefinition"]

import sys as _sys
from ..ac_db_text import AcDbText as _AcDbText
_sys.modules[__package__.rsplit(".", 1)[0]].AcDbText = _AcDbText
