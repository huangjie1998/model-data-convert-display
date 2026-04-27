from __future__ import annotations


def resolve_dimension_kind(oda_type: str) -> str:
    et = str(oda_type or "").lower()
    if et == "acdbaligneddimension":
        return "aligned"
    if et in ("acdbrotateddimension", "acdb2linedimension"):
        return "rotated"
    if et in ("acdb2lineangulardimension", "acdb3pointangulardimension"):
        return "angular"
    if et in ("acdbarcdimension", "acdbarclengthdimension"):
        return "arc_length"
    if et in ("acdbradialdimension", "acdbradialdimensionlarge"):
        return "radius"
    if et == "acdbdiametricdimension":
        return "diameter"
    if et == "acdbordinatedimension":
        return "ordinate"
    return "dimension"
