# ODA Entity Parser Split

This document records the backend ODA entity parsing boundary used by the DWG pipeline.

## Active Routing

- `server/dwg/oda/entity_builder.py` remains the field-scanning entry point and top-level parser dispatcher.
- The old in-file non-DIMENSION construction branches have been physically removed from `server/dwg/oda/entity_builder.py`; non-DIMENSION entities now have a single active backend parser path.
- Non-DIMENSION entity construction is routed through `server/dwg/oda/entities/__init__.py`.
- `DIMENSION` construction is routed through `server/dwg/oda/entities/dimension_parser.py`.
- DIMENSION field collection from the generic ODA entity state lives in `server/dwg/oda/entities/dimension_state.py`.
- DIMENSION type recognition (`aligned`, `rotated`, `angular`, `arc_length`, `radius`, `diameter`, `ordinate`) lives in `server/dwg/oda/entities/dimension_kind_parser.py`.
- Linear/aligned DIMENSION text-angle and implicit text-position handling lives in `server/dwg/oda/entities/dimension_linear_parser.py`.
- Angular DIMENSION geometry lives in `server/dwg/oda/entities/dimension_angular_parser.py`.
- Arc-length DIMENSION geometry lives in `server/dwg/oda/entities/dimension_arc_length_parser.py`.
- Radius, diameter, and ordinate DIMENSION geometry live in `server/dwg/oda/entities/dimension_radius_parser.py`, `server/dwg/oda/entities/dimension_diameter_parser.py`, and `server/dwg/oda/entities/dimension_ordinate_parser.py`.
- Shared DIMENSION point helpers live in `server/dwg/oda/entities/dimension_geometry_common.py`.
- Non-standard DIMENSION fallback point selection and final `line_start` / `line_end` / `bbox` completion live in `server/dwg/oda/entities/dimension_fallback_points.py`.
- DIMENSION style resolution (`dimtxsty`, `dimblk`, `dimblk1`, `dimblk2`, `dimasz`, `dimtxt`, `dimclrt`, `dimtfill`, `dimtfillclr`) lives in `server/dwg/oda/entities/dimension_style_resolver.py`.
- Final DIMENSION `geom` and entity payload assembly lives in `server/dwg/oda/entities/dimension_payload_builder.py`.
- `dimension_parser.py` passes an explicit `payload_values` dictionary into the payload builder; do not pass `locals()` across module boundaries.
- Curve-like ODA entities are dispatched by `server/dwg/oda/entities/curve_parser.py`, but each concrete curve type has its own parser file.
- `LINE` lives in `server/dwg/oda/entities/line_parser.py`.
- `POLYLINE` / `LWPOLYLINE` / 2D / 3D polyline construction lives in `server/dwg/oda/entities/polyline_parser.py`.
- `CIRCLE`, `ARC`, `XLINE` / `RAY`, `ELLIPSE`, and `SPLINE` live in their matching parser files under `server/dwg/oda/entities/`.
- Block references live in `server/dwg/oda/entities/block_reference_parser.py`.
- Text-like ODA entities are dispatched by `server/dwg/oda/entities/text_parser.py`, but each concrete text category has its own parser file.
- `TEXT` lives in `server/dwg/oda/entities/text_single_parser.py`.
- `MTEXT` lives in `server/dwg/oda/entities/mtext_parser.py`.
- `ATTDEF` lives in `server/dwg/oda/entities/attdef_parser.py`.
- `ATTRIB` lives in `server/dwg/oda/entities/attrib_parser.py`.
- `LEADER` lives in `server/dwg/oda/entities/leader_parser.py`.
- `POINT` lives in `server/dwg/oda/entities/point_parser.py`.
- Surface-like ODA entities are dispatched by `server/dwg/oda/entities/surface_parser.py`, but each concrete surface category has its own parser file.
- `HATCH` lives in `server/dwg/oda/entities/hatch_parser.py`.
- `WIPEOUT` lives in `server/dwg/oda/entities/wipeout_parser.py`.
- `SOLID` / `TRACE` / `FACE` live in `server/dwg/oda/entities/solid_parser.py`.

## Maintenance Rule

- Fix parsed geometry for one AutoCAD category in the matching `server/dwg/oda/entities/*_parser.py` file first.
- For curve geometry, prefer the exact file (`line_parser.py`, `arc_parser.py`, `ellipse_parser.py`, etc.) rather than the curve dispatcher.
- For filled or mask-like geometry, prefer `hatch_parser.py`, `wipeout_parser.py`, or `solid_parser.py` rather than the surface dispatcher.
- For parsed text payloads, prefer `text_single_parser.py`, `mtext_parser.py`, `attdef_parser.py`, or `attrib_parser.py` rather than the text dispatcher.
- For parsed dimension payloads, keep shared DIMENSION assembly in `dimension_parser.py`; subtype-specific geometry belongs in `dimension_*_parser.py`.
- For missing/partial DIMENSION geometry, use `dimension_fallback_points.py`; do not put fallback point-selection loops back into `dimension_parser.py`.
- For DIMENSION style, arrow, text-height, text-color, or text-mask source resolution, use `dimension_style_resolver.py`; do not put style precedence logic back into `dimension_parser.py`.
- For final DIMENSION API payload fields, use `dimension_payload_builder.py`; do not put `geom_dim` construction back into `dimension_parser.py`.
- For cross-module DIMENSION state, pass explicit dictionaries (`geometry_state`, `geometry_source`, `payload_values`) rather than entire function locals.
- For raw DIMENSION field extraction, update `DimensionParseState` in `dimension_state.py`; do not add new `state.get(...)` chains to `dimension_parser.py`.
- Keep `server/dwg/oda/entity_builder.py` focused on ODA line scanning, shared style assembly, and top-level dispatch.
- Avoid mixing `TEXT`, `MTEXT`, `DIMENSION`, and geometry parser changes in one module unless the change is explicitly cross-cutting.
