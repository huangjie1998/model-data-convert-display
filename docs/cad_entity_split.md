# CAD Entity Split

这次拆分的目标是把 AutoCAD 类别边界固定下来：一个类别的问题只进入本类别的解析、fallback、渲染或文字布局文件，避免 TEXT、MTEXT、DIMENSION_TEXT 这类逻辑互相影响。

## Current Routing

| AutoCAD 类别 | 后端边界 | 前端 fallback/entity 边界 | 前端 renderer 边界 | Runtime 文字布局 |
| --- | --- | --- | --- | --- |
| `TEXT` / `ATTRIB` / `ATTDEF` | `server/dwg/entities/text.py` | `src/components/viewer/cadEngine/glx/entities/textEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/text/textEntityRenderer.ts` | `src/vendor/cad-engine-whitebox/runtime/text/singleLineTextLayout.js` |
| `MTEXT` | `server/dwg/entities/mtext.py` | `src/components/viewer/cadEngine/glx/entities/mtextEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/text/mtextEntityRenderer.ts` | `src/vendor/cad-engine-whitebox/runtime/text/mtextLayout.js` |
| `DIMENSION` | `server/dwg/dimension/primitives.py` | `src/components/viewer/cadEngine/glx/entities/dimensionEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/dimensionRenderer.ts` | `src/vendor/cad-engine-whitebox/runtime/text/dimensionTextLayout.js` |
| `LINE` | `server/dwg/entities/line.py` | `src/components/viewer/cadEngine/glx/entities/lineEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/lineRenderer.ts` | 不适用 |
| `LWPOLYLINE` / `POLYLINE` | `server/dwg/entities/polyline.py` | `src/components/viewer/cadEngine/glx/entities/polylineEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/polylineRenderer.ts` | 不适用 |
| `ARC` | `server/dwg/entities/arc.py` | `src/components/viewer/cadEngine/glx/entities/arcEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/arcRenderer.ts` | 不适用 |
| `CIRCLE` | `server/dwg/entities/circle.py` | `src/components/viewer/cadEngine/glx/entities/circleEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/circleRenderer.ts` | 不适用 |
| `ELLIPSE` | `server/dwg/entities/ellipse.py` | `src/components/viewer/cadEngine/glx/entities/ellipseEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/ellipseRenderer.ts` | 不适用 |
| `SPLINE` | `server/dwg/entities/spline.py` | `src/components/viewer/cadEngine/glx/entities/splineEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/polylineRenderer.ts` | 不适用 |
| `HATCH` | `server/dwg/entities/hatch.py` | `src/components/viewer/cadEngine/glx/entities/hatchEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/polygonRenderer.ts` | 不适用 |
| `INSERT` / `BLOCK_REFERENCE` / `BLOCKREF` | `server/dwg/entities/block.py` | `src/components/viewer/cadEngine/glx/entities/blockEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/blockRenderer.ts` | 不适用 |
| `POINT` | `server/dwg/entities/point.py` | `src/components/viewer/cadEngine/glx/entities/pointEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/pointRenderer.ts` | 不适用 |
| `TABLE` / `ACAD_TABLE` | `server/dwg/entities/table.py` | `src/components/viewer/cadEngine/glx/entities/tableEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/tableRenderer.ts` | 不适用 |
| `WIPEOUT` / `SOLID` / `TRACE` | `server/dwg/entities/surface.py` | `src/components/viewer/cadEngine/glx/entities/hatchEntity.ts` | `src/components/viewer/cadEngine/glx/renderers/polygonRenderer.ts` | 不适用 |
| `LEADER` | `server/dwg/entities/leader.py` | 后续补独立前端 entity 文件 | polyline / polygon renderer | 不适用 |

## Backend Runtime Split

- 后端 primitive 生成总入口已经切到 `server/dwg/entities/primitive_builder.py`。
- `server/dwg_service_core.py` 现在只在 `_entity_primitives` 中创建上下文并调用分类 builder，不再作为各类 primitive 的活跃实现位置。
- 旧的 `_legacy_entity_primitives` 大块备份已经删除，避免以后误改旧逻辑。
- `server/dwg/entities/primitives_common.py` 只放跨类别基础类型、点清洗、数值保护和上下文对象。
- 标注箭头、标注文字、标注 fallback primitive 集中在 `server/dwg/dimension/primitives.py`，不再和普通文字/普通几何共用实现。
- 标注诊断 payload 集中在 `server/dwg/dimension/payload.py`，主服务只注入颜色、距离和文字解析回调。
- 语义分类、语义 subtype、mapping status、primitive semantic decoration 集中在 `server/dwg/semantics.py`。
- ODA dump 中的 layer/text style/linetype/dim style 表提取集中在 `server/dwg/styles.py`。
- ODA dump 的 block table/entity record 扫描集中在 `server/dwg/oda/blocks.py`。
- ODA dump 的单实体字段解析集中在 `server/dwg/oda/entity_builder.py`；`server/dwg_service_core.py` 只注入解析回调，不保留旧实体解析大块。
- 普通 `INSERT` / nested block reference 展开、block ref 节点生成、递归深度/循环/未解析引用诊断集中在 `server/dwg/block/expander.py`。
- DIMENSION 匿名块 primitive 收集集中在 `server/dwg/dimension/block_expander.py`。
- DIMENSION 匿名块箭头/弧长/角度/半径低精度修复集中在 `server/dwg/dimension/arrow_repair.py`。

## Rules For Future Fixes

- 修 `TEXT` 只改 `textEntityRenderer.ts`、`textEntity.ts`、`singleLineTextLayout.js` 或后端 `entities/text.py`。
- 修 `MTEXT` 只改 `mtextEntityRenderer.ts`、`mtextEntity.ts`、`mtextLayout.js` 或后端 `entities/mtext.py`。
- 修标注文字只改 `dimensionTextEntityRenderer.ts`、`dimensionTextLayout.js` 或 `server/dwg/dimension/`。
- 修普通几何实体时，优先进入 `glx/entities/<type>Entity.ts` 和对应 `glx/renderers/<type>Renderer.ts`。
- `src/components/viewer/cadEngine/glx/fallback/entityPrimitiveResolver.ts` 只保留调度，不再承载具体类别算法。
- `src/components/viewer/cadEngine/glx/renderers/textRenderer.ts` 只保留 TEXT / MTEXT / DIMENSION_TEXT 分派，不再承载具体布局规则。
- `server/dwg_service_core.py` 仍是 API/session 总入口；新增后端 primitive 或解析逻辑应进入 `server/dwg/entities/` 或 `server/dwg/dimension/`，不要再写回 `_entity_primitives`。
