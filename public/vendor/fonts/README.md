# CadEngine font assets

CadPreview's `GlxLoader` requires a Three.js `typeface.json` font asset before parsing GLX.

Default typeface fallback URL:

- `/vendor/fonts/FangSong_GB2312_Regular.json`

Default SHX single-line stroke URLs:

- `/vendor/fonts/shx/txt.shx`
- `/vendor/fonts/shx/EngineeringChinese.shx`
- `/vendor/fonts/shx/EngineeringChinese.gb2312-map.json`

You can override it with:

- `VITE_CAD_ENGINE_FONT_URL`
- `VITE_CAD_ENGINE_SHX_STROKE_TEXT_ENABLED=false` disables the SHX stroke path.
- `VITE_CAD_ENGINE_SHX_FONT_URL`
- `VITE_CAD_ENGINE_SHX_BIGFONT_URL`
- `VITE_CAD_ENGINE_SHX_BIGFONT_MAP_URL`
- `VITE_CAD_ENGINE_SHX_BIGFONT_SCALE` controls Chinese bigfont stroke scale. The default is `0.56` because `EngineeringChinese.shx` renders about 1.35-1.40x taller than the requested CAD text height when parsed directly.
- `VITE_CAD_ENGINE_SHX_TEXT_HEIGHT_SCALE` controls single-line SHX text render height. The default is `1.12`.
- `VITE_CAD_ENGINE_SHX_MTEXT_HEIGHT_SCALE` controls MTEXT SHX render height. The default is `1.08`.
- `VITE_CAD_ENGINE_TEXT_CURVE_SEGMENTS` controls Three.js text curve smoothness. The default is `1` to match `cadPreivew.min.js`; use `4`/`6`/`8` for smoother text.

`FangSong_GB2312_Regular.json` is generated from the local project font `server/fonts/SIMFANG.TTF` with the facetype.js/OpenType conversion format used by Three.js `FontLoader`. It is intentionally named after the asset expected by the legacy `cadPreivew.min.js` loader.

Runtime behavior:

- The viewer now prefers the SHX assets above and renders text as `THREE.LineSegments` pen strokes, avoiding filled/outline typeface geometry for normal CAD text.
- The default SHX pair is intentionally more neutral than the earlier single-line FangSong assets: `txt.shx` handles Latin/symbol text, and `EngineeringChinese.shx` handles GB2312 Chinese bigfont text.
- The bigfont map converts decoded Unicode Chinese text back to the GB2312 code points used by `EngineeringChinese.shx`.
- The Chinese bigfont scales X/Y independently: Y is compressed to match CAD text height, while X remains full-width so Chinese does not become unnaturally narrow.
- MTEXT height prefers the declared character height when available; `actual_height` is only used as a fallback because it may represent the whole MTEXT bounding height.
- MTEXT wrapping uses SHX `lastPoint` advance first, then applies the width factor to compare against the defined MTEXT width; MTEXT attachment uses the defined width as the alignment box.
- If SHX assets cannot be loaded or a text object cannot be stroked, the runtime falls back to the existing Three.js typeface/sprite path and reports the render mode in diagnostics.

The previous FangSong stroke assets are still kept for comparison or override:

- `/vendor/fonts/shx/Single-line FangSong.shx`
- `/vendor/fonts/shx/Single-line FangSongbig.shx`
- `/vendor/fonts/shx/Single-line FangSongbig.gb2312-map.json`

Legacy cadPreview behavior used as reference:

- Font path fallback: `public/vendor/cadPreivew.min.js:56649`
- Text geometry: `generateShapes(entity.extras.text, entity.extras.h)` plus `ShapeGeometry(shapes, 1)` at `public/vendor/cadPreivew.min.js:56773`

If the asset is missing or unreadable, the viewer now fails fast and reports the asset error in the diagnostics panel.
