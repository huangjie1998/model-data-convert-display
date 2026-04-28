# Web CAD Bundle v1 设计文档

本文定义项目自研的 **Web CAD Bundle** 数据结构。它不是 DWG 数据库的完整复刻，而是服务于 Web 端浏览、渲染、拾取、属性面板、图层控制和诊断的中间数据协议。

## 1. 设计目标

Web CAD Bundle 的目标是把 DWG 解析后的数据从“散落在多个接口、多个前端转换步骤里”收敛为一个稳定协议：

```text
DWG
  ↓ ODA / 后端解析
Web CAD Bundle
  ↓ 前端 CAD runtime
渲染 / 拾取 / 属性 / 图层 / 诊断
```

第一版目标：

- 统一前后端 DWG 数据入口，减少字段在多处重复解释。
- 明确区分 CAD 语义实体、渲染数据、拾取索引、属性面板数据和原始保真数据。
- 支持 AutoCAD 风格属性栏，且每种实体类别有独立属性 section。
- 保留 ODA/AutoCAD 原始字段，避免为了“没建模的字段”重新解析 DWG。
- 为后续二进制化、大图纸增量加载、图层快速显隐、拾取性能优化预留结构。

非目标：

- 不在 v1 复刻完整 DWG object database。
- 不要求 v1 覆盖 AutoCAD 所有实体、字典、扩展对象和垂直产品对象。
- 不把 `render` 数据当作唯一真相；渲染结果只是实体语义的一种展开。

## 2. 核心原则

### 2.1 分层保真

Bundle 由三类数据共同组成：

```text
entities / tables / properties  规范化 CAD 语义
render / pick / hierarchy       Web 交互和性能数据
raw                             ODA/AutoCAD 原始字段保真
```

规范化字段只覆盖当前明确理解和使用的内容；未规范化字段进入 `raw`，未来需要时再提升为正式字段。

### 2.2 渲染、属性、拾取分离

同一个实体可能对应多个渲染 primitive，例如 `DIMENSION` 可能展开为尺寸线、界线、箭头、多段线和文字。反过来，属性面板需要显示的是 CAD 语义，而不是渲染三角形。因此必须分离：

- `entities`：这是什么 CAD 对象。
- `render`：应该怎么画。
- `pick`：应该怎么选。
- `properties`：属性面板应该怎么展示。
- `raw`：原始字段是什么。

### 2.3 所有样式都必须可解释

颜色、线型、线宽、字体、标注样式等不能只给最终值，还要给来源：

```json
{
  "mode": "ByLayer",
  "raw": 256,
  "resolved": "#ffffff",
  "source": "layer:WALL",
  "provenance": ["entity.colorIndex=256", "layer.WALL.color=#ffffff"]
}
```

这样可以解释 DIMENSION 文字颜色、尺寸线颜色、普通 TEXT 颜色、ByLayer/ByBlock 等问题。

### 2.4 0 是合法值

所有数字字段必须用 `value != null && isFinite(value)` 判断，不能用 truthy 判断。典型例子：

```json
{
  "startWidth": 0,
  "endWidth": 2
}
```

`startWidth: 0` 是有效 CAD 语义，表示宽多段线的一端坍缩为尖端。

### 2.5 定义值、实际值、bbox 值分开

TEXT/MTEXT/DIMENSION_TEXT 中，定义宽度、实际文字宽度和 bbox 宽度含义不同：

- `definedWidth`：AutoCAD MTEXT 布局框宽度。
- `actualWidth`：ODA 或 bbox 推导的实际内容宽度。
- `bboxWidth`：包围盒投影宽度。

渲染不能把 `definedWidth` 直接当作横向拉伸目标。

### 2.6 Schema 可扩展

v1 必须允许未知实体和扩展字段：

```json
{
  "extensions": {
    "oda": {},
    "app": {}
  }
}
```

未知对象不应导致 bundle 加载失败，应以 `type: "UNKNOWN"`、`geom.kind: "unknown"` 和 `rawRef` 保留。

## 3. 顶层结构

```ts
export interface WebCadBundle {
  manifest: CadBundleManifest;
  document: CadDocumentInfo;
  tables: CadTables;
  entities: CadEntity[];
  render: CadRenderData;
  pick: CadPickData;
  hierarchy: CadHierarchy;
  properties: CadProperties;
  diagnostics: CadDiagnostics;
  raw?: CadRawStore;
  extensions?: Record<string, unknown>;
}
```

JSON 形态：

```json
{
  "manifest": {},
  "document": {},
  "tables": {},
  "entities": [],
  "render": {},
  "pick": {},
  "hierarchy": {},
  "properties": {},
  "diagnostics": {},
  "raw": {},
  "extensions": {}
}
```

## 4. manifest

`manifest` 描述 Bundle 版本、来源和能力。

```ts
export interface CadBundleManifest {
  format: "web-cad-bundle";
  version: 1;
  source: {
    fileName: string;
    fileSize?: number;
    sourceFormat: "DWG" | "DXF" | "UNKNOWN";
    parser: "ODA" | "stub" | "external";
    parserVersion?: string;
    createdAt: string;
  };
  capabilities: {
    hasRawFields: boolean;
    hasRenderPrimitives: boolean;
    hasPickIndex: boolean;
    hasProperties: boolean;
    hasBinaryBuffers: boolean;
  };
}
```

示例：

```json
{
  "format": "web-cad-bundle",
  "version": 1,
  "source": {
    "fileName": "0#总体_t3.dwg",
    "fileSize": 12345678,
    "sourceFormat": "DWG",
    "parser": "ODA",
    "parserVersion": "2026.03.25-v1",
    "createdAt": "2026-04-28T12:00:00+08:00"
  },
  "capabilities": {
    "hasRawFields": true,
    "hasRenderPrimitives": true,
    "hasPickIndex": true,
    "hasProperties": true,
    "hasBinaryBuffers": false
  }
}
```

## 5. document

`document` 保存图纸级信息、空间、范围和 header variables。

```ts
export interface CadDocumentInfo {
  units?: {
    insunits?: number;
    label?: string;
  };
  extents?: Record<string, CadBBox>;
  spaces: Array<{
    id: string;
    name: string;
    type: "model" | "layout";
  }>;
  defaultSpace: string;
  headerVars?: Record<string, unknown>;
}
```

## 6. tables

`tables` 保存常用符号表。每个表记录既包含规范化字段，也允许 `rawRef` 指向原始数据。

```ts
export interface CadTables {
  layers: Record<string, CadLayerRecord>;
  linetypes: Record<string, CadLinetypeRecord>;
  textStyles: Record<string, CadTextStyleRecord>;
  dimStyles: Record<string, CadDimStyleRecord>;
  blocks: Record<string, CadBlockRecord>;
}
```

### 6.1 Layer

```ts
export interface CadLayerRecord {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
  frozen?: boolean;
  color?: CadResolvedValue;
  lineweight?: CadResolvedValue;
  linetype?: CadResolvedValue;
  rawRef?: string;
}
```

### 6.2 Text Style

```ts
export interface CadTextStyleRecord {
  id: string;
  name: string;
  font?: string;
  bigfont?: string;
  vertical?: boolean;
  widthFactor?: number;
  oblique?: number;
  shapeFile?: boolean;
  rawRef?: string;
}
```

### 6.3 Dimension Style

```ts
export interface CadDimStyleRecord {
  id: string;
  name: string;
  dimclrd?: CadResolvedValue;
  dimclre?: CadResolvedValue;
  dimclrt?: CadResolvedValue;
  dimtxt?: number;
  dimasz?: number;
  dimscale?: number;
  raw?: Record<string, unknown>;
  rawRef?: string;
}
```

### 6.4 Block

```ts
export interface CadBlockRecord {
  id: string;
  name: string;
  origin?: CadPoint;
  entityIds?: string[];
  anonymous?: boolean;
  layout?: boolean;
  rawRef?: string;
}
```

## 7. entities

`entities` 是 CAD 语义核心。

```ts
export interface CadEntity {
  id: string;
  handle?: string;
  className?: string;
  type: CadEntityType;
  category?: "geometry" | "annotation" | "block" | "surface" | "unknown";
  space: string;
  layer: string;
  owner?: {
    block?: string;
    layout?: string;
  };
  blockPath?: string[];
  style?: CadEntityStyle;
  geom: CadGeometry;
  bbox?: CadBBox;
  renderRefs?: string[];
  pickRef?: string;
  propertyRef?: string;
  rawRef?: string;
  diagnostics?: CadEntityIssue[];
  extensions?: Record<string, unknown>;
}
```

### 7.1 通用几何类型

```ts
export type CadPoint = [number, number, number?];

export interface CadBBox {
  min: CadPoint;
  max: CadPoint;
}

export type CadGeometry =
  | CadLineGeometry
  | CadPolylineGeometry
  | CadCircleGeometry
  | CadArcGeometry
  | CadEllipseGeometry
  | CadSplineGeometry
  | CadTextGeometry
  | CadMTextGeometry
  | CadDimensionGeometry
  | CadHatchGeometry
  | CadInsertGeometry
  | CadUnknownGeometry;
```

### 7.2 LINE

```ts
export interface CadLineGeometry {
  kind: "line";
  start: CadPoint;
  end: CadPoint;
}
```

### 7.3 POLYLINE / LWPOLYLINE

```ts
export interface CadPolylineGeometry {
  kind: "polyline";
  vertices: CadPoint[];
  closed?: boolean;
  globalWidth?: number;
  startWidth?: number;
  endWidth?: number;
  segmentWidths?: Array<{
    segment: number;
    startWidth?: number;
    endWidth?: number;
  }>;
  bulges?: number[];
  linetypeGeneration?: boolean;
}
```

约束：

- `startWidth: 0` 和 `endWidth: 0` 必须保留。
- 若同时存在 `segmentWidths` 和实体级 `globalWidth/startWidth/endWidth`，渲染优先级为：
  1. `segmentWidths`
  2. 显式实体级 `startWidth/endWidth`
  3. `globalWidth`
- `globalWidth` 不应覆盖显式端点宽度。

### 7.4 ARC / CIRCLE / ELLIPSE

```ts
export interface CadCircleGeometry {
  kind: "circle";
  center: CadPoint;
  radius: number;
}

export interface CadArcGeometry {
  kind: "arc";
  center: CadPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise?: boolean;
}

export interface CadEllipseGeometry {
  kind: "ellipse";
  center: CadPoint;
  majorAxis: CadPoint;
  minorAxis?: CadPoint;
  axisRatio?: number;
  startParameter?: number;
  endParameter?: number;
  rotation?: number;
}
```

### 7.5 TEXT

```ts
export interface CadTextGeometry {
  kind: "text";
  text: string;
  position: CadPoint;
  height: number;
  rotation?: number;
  widthFactor?: number;
  oblique?: number;
  styleName?: string;
  fontKey?: string;
  fontName?: string;
  fontFamily?: string;
  fontKind?: "shx" | "ttf" | "unknown";
  fontSource?: string;
  actualWidth?: number;
  actualHeight?: number;
  bboxWidth?: number;
  bboxHeight?: number;
  textVertical?: boolean;
  horizontalMode?: string;
  verticalMode?: string;
  attachment?: string;
  mirroredX?: boolean;
  mirroredY?: boolean;
  extentsSource?: "oda_actual_width" | "oda_bbox" | "estimated" | string;
}
```

### 7.6 MTEXT

MTEXT 必须区分定义宽度和实际内容宽度。

```ts
export interface CadMTextGeometry {
  kind: "mtext";
  rawText: string;
  plainText: string;
  position: CadPoint;
  height: number;
  rotation?: number;
  definedWidth?: number;
  actualWidth?: number;
  actualHeight?: number;
  bboxWidth?: number;
  bboxHeight?: number;
  lineCount?: number;
  lineSpacingFactor?: number;
  attachment?: string;
  styleName?: string;
  fontKey?: string;
  fontName?: string;
  fontKind?: "shx" | "ttf" | "unknown";
  textVertical?: boolean;
  backgroundMask?: boolean;
  backgroundMaskPadding?: number;
}
```

约束：

- `definedWidth` 是 AutoCAD MTEXT 布局框宽度，不等于实际文字宽度。
- 渲染层不能用 `definedWidth` 直接拉伸文字。
- `actualWidth` 可用于诊断或谨慎拟合，但不应作用于竖排文字、标注文字或未确认方向的多行文字。

### 7.7 DIMENSION

```ts
export interface CadDimensionGeometry {
  kind: "dimension";
  dimensionType: string;
  measurement?: number;
  displayText?: string;
  textPosition?: CadPoint;
  textRotation?: number;
  definitionPoints?: Record<string, CadPoint>;
  dimStyleName?: string;
  dimVars?: Record<string, unknown>;
  anonymousBlockName?: string;
  colors?: {
    dimensionLine?: CadResolvedValue;
    extensionLine?: CadResolvedValue;
    text?: CadResolvedValue;
  };
}
```

DIMENSION 的渲染 primitive 应挂在 `render`，不要把渲染展开结果混入 `geom` 作为唯一真相。

### 7.8 HATCH

```ts
export interface CadHatchGeometry {
  kind: "hatch";
  patternName?: string;
  solid?: boolean;
  scale?: number;
  angle?: number;
  loops?: CadHatchLoop[];
  boundaryCount?: number;
  area?: number;
}
```

### 7.9 INSERT

```ts
export interface CadInsertGeometry {
  kind: "insert";
  blockName: string;
  position: CadPoint;
  scale?: CadPoint;
  rotation?: number;
  attributes?: Array<{
    tag: string;
    text: string;
    position?: CadPoint;
  }>;
}
```

### 7.10 UNKNOWN

```ts
export interface CadUnknownGeometry {
  kind: "unknown";
  rawRef?: string;
}
```

## 8. style 和 resolved value

```ts
export interface CadResolvedValue<T = unknown> {
  mode?: "ByLayer" | "ByBlock" | "Explicit" | "Default" | "DimStyle" | "Unknown";
  raw?: unknown;
  resolved?: T;
  source?: string;
  provenance?: string[];
}

export interface CadEntityStyle {
  color?: CadResolvedValue<string>;
  colorIndex?: CadResolvedValue<number>;
  lineweight?: CadResolvedValue<number | string>;
  linetype?: CadResolvedValue<string>;
  textStyle?: CadResolvedValue<string>;
  dimStyle?: CadResolvedValue<string>;
}
```

## 9. render

`render` 是 Web 渲染层，第一版可使用 primitives；第二阶段再引入 buckets/binary buffers。

```ts
export interface CadRenderData {
  primitives: CadRenderPrimitive[];
  buckets?: CadRenderBucket[];
  buffers?: CadBufferDescriptor[];
}

export interface CadRenderPrimitive {
  id: string;
  entityId: string;
  kind:
    | "line"
    | "polyline"
    | "widePolyline"
    | "polygon"
    | "circle"
    | "arc"
    | "ellipse"
    | "spline"
    | "text"
    | "point";
  layer: string;
  style?: CadEntityStyle;
  bbox?: CadBBox;
  data: Record<string, unknown>;
  rawRef?: string;
}
```

宽 polyline 示例：

```json
{
  "id": "R:AA01:0",
  "entityId": "H:AA01",
  "kind": "widePolyline",
  "layer": "WALL",
  "data": {
    "points": [[0, 0, 0], [100, 0, 0]],
    "segmentWidths": [
      { "segment": 0, "startWidth": 0, "endWidth": 2 }
    ]
  }
}
```

## 10. pick

`pick` 服务交互，不应强依赖渲染 geometry 反查全量实体。

```ts
export interface CadPickData {
  entities: Record<string, CadPickEntity>;
  index?: CadPickGrid;
}

export interface CadPickEntity {
  bbox: CadBBox;
  primitiveRefs: string[];
  layer: string;
  type: string;
}

export interface CadPickGrid {
  type: "grid";
  origin: [number, number];
  cellSize: number;
  cells: Record<string, string[]>;
}
```

v1 可先只提供 `pick.entities`，后续再生成 grid/R-tree。

## 11. hierarchy

```ts
export interface CadHierarchy {
  roots: string[];
  nodes: Record<string, CadHierarchyNode>;
}

export interface CadHierarchyNode {
  id: string;
  type: "space" | "layer" | "block" | "insert" | "entity" | "category";
  label: string;
  entityId?: string;
  layer?: string;
  children?: string[];
  counts?: Record<string, number>;
}
```

层级树不应由前端临时扫描全部实体生成；后端应输出稳定树结构和计数，前端只负责展示、折叠和虚拟滚动。

## 12. properties

属性栏数据由 Bundle 提供，前端不再到处根据 entity 临时猜字段。

```ts
export interface CadProperties {
  entities: Record<string, CadEntityProperties>;
}

export interface CadEntityProperties {
  sections: CadPropertySection[];
}

export interface CadPropertySection {
  id: string;
  title: string;
  collapsed?: boolean;
  rows?: CadPropertyRow[];
  rawRef?: string;
}

export interface CadPropertyRow {
  key: string;
  label: string;
  value: unknown;
  display?: string;
  unit?: string;
  source?: string;
  editable?: boolean;
  raw?: unknown;
}
```

推荐 section：

- `common`：类型、Handle、图层、颜色、线型、线宽、空间、bbox。
- `geometry`：通用几何信息，例如长度、面积、顶点数。
- `line` / `polyline` / `text` / `mtext` / `dimension` / `hatch` / `insert`：类别专属属性。
- `raw`：原始字段，默认折叠。

Polyline 属性示例：

```json
{
  "sections": [
    {
      "id": "common",
      "title": "常规",
      "rows": [
        { "key": "type", "label": "类型", "value": "LWPOLYLINE" },
        { "key": "layer", "label": "图层", "value": "WALL" }
      ]
    },
    {
      "id": "polyline",
      "title": "多段线",
      "rows": [
        { "key": "closed", "label": "闭合", "value": false },
        { "key": "vertexCount", "label": "顶点数", "value": 2 },
        { "key": "startWidth", "label": "起始宽度", "value": 0 },
        { "key": "endWidth", "label": "终止宽度", "value": 2 }
      ]
    },
    {
      "id": "raw",
      "title": "原始数据",
      "collapsed": true,
      "rawRef": "raw:entity:AA01"
    }
  ]
}
```

## 13. diagnostics

```ts
export interface CadDiagnostics {
  summary: {
    entityCount: number;
    renderPrimitiveCount: number;
    renderedCount?: number;
    skippedCount?: number;
    missingGlyphCount?: number;
    warningCount: number;
    errorCount: number;
  };
  issues: CadDiagnosticIssue[];
}

export interface CadDiagnosticIssue {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  entityIds?: string[];
  layer?: string;
  details?: Record<string, unknown>;
}
```

常见 issue code：

- `missing-font`
- `missing-glyph`
- `unsupported-entity`
- `render-skipped`
- `hierarchy-entity-mismatch`
- `polyline-width-conflict`
- `dimension-style-fallback`
- `hatch-pattern-fallback`

## 14. raw store

`raw` 是保真层，不要求前端默认全部展示。

```ts
export interface CadRawStore {
  mode: "summary" | "full" | "external";
  entities?: Record<string, CadRawEntity>;
  tables?: Record<string, CadRawRecord>;
  externalRefs?: Record<string, string>;
}

export interface CadRawEntity {
  source: "oda" | "dxf" | "external";
  className?: string;
  handle?: string;
  fields: CadRawField[];
  sections?: CadRawRecord[];
  xdata?: CadRawRecord[];
  extensionDictionary?: CadRawRecord | null;
}

export interface CadRawField {
  label: string;
  normalizedLabel?: string;
  value: unknown;
  parsed?: unknown;
}

export interface CadRawRecord {
  id?: string;
  label?: string;
  fields?: CadRawField[];
}
```

v1 推荐：

- 默认内嵌 summary raw。
- 完整 raw dump 后端缓存，不默认发送给前端。
- 属性面板展开“原始数据”时再懒加载完整 raw。

## 15. 示例：Polyline

```json
{
  "id": "H:AA01",
  "handle": "AA01",
  "className": "AcDbPolyline",
  "type": "LWPOLYLINE",
  "category": "geometry",
  "space": "model",
  "layer": "WALL",
  "style": {
    "color": {
      "mode": "ByLayer",
      "raw": 256,
      "resolved": "#ffffff",
      "source": "layer:WALL"
    }
  },
  "geom": {
    "kind": "polyline",
    "vertices": [[0, 0, 0], [100, 0, 0]],
    "closed": false,
    "startWidth": 0,
    "endWidth": 2,
    "segmentWidths": [
      { "segment": 0, "startWidth": 0, "endWidth": 2 }
    ],
    "bulges": [0]
  },
  "bbox": {
    "min": [0, -1, 0],
    "max": [100, 1, 0]
  },
  "renderRefs": ["R:AA01:0"],
  "pickRef": "P:AA01",
  "propertyRef": "H:AA01",
  "rawRef": "raw:entity:AA01"
}
```

## 16. 示例：MTEXT

```json
{
  "id": "H:TXT01",
  "handle": "TXT01",
  "className": "AcDbMText",
  "type": "MTEXT",
  "category": "annotation",
  "space": "model",
  "layer": "TEXT",
  "geom": {
    "kind": "mtext",
    "rawText": "{\\fSimSun|b0|i0;设备房}",
    "plainText": "设备房",
    "position": [100, 200, 0],
    "height": 250,
    "rotation": 0,
    "definedWidth": 10000,
    "actualWidth": 900,
    "actualHeight": 250,
    "lineCount": 1,
    "textVertical": false,
    "styleName": "HZTXT",
    "fontName": "xd-hzs.shx",
    "fontKind": "shx"
  },
  "rawRef": "raw:entity:TXT01"
}
```

## 17. API 规划

第一阶段新增：

```http
GET /api/dwg/bundle?doc_id=<doc_id>&space=model
```

响应：

```json
{
  "ok": true,
  "bundle": {}
}
```

后续可拆分：

```http
GET /api/dwg/bundle/manifest
GET /api/dwg/bundle/render
GET /api/dwg/bundle/raw-entity?entity_id=H:AA01
```

## 18. 演进路线

### Phase 1：JSON Bundle 原型

- 后端生成完整 JSON Bundle。
- 前端通过 `bundleToGlx` 适配现有 runtime。
- 保留旧接口回退。

### Phase 2：Render Buckets

- 后端生成按 layer/color/kind 分桶的 render buckets。
- 图层显隐改成 bucket visible，不重建场景。

### Phase 3：Pick Index

- 后端生成 grid/R-tree。
- 点击拾取只扫描候选实体。

### Phase 4：二进制几何

- JSON 保留元数据。
- 大数组进入 `bundle.bin`。
- 前端用 `Float32Array` 直接加载。

### Phase 5：增量和缓存

- 大图纸按 space/layer/tile 分块加载。
- Bundle 结果按 DWG 文件 hash 缓存。

## 19. v1 必须规范化的对象

第一版必须覆盖：

- `LINE`
- `POLYLINE` / `LWPOLYLINE`
- `CIRCLE`
- `ARC`
- `ELLIPSE`
- `SPLINE`
- `TEXT`
- `MTEXT`
- `DIMENSION`
- `HATCH`
- `SOLID`
- `WIPEOUT`
- `POINT`
- `INSERT`
- `ATTRIB`
- `ATTDEF`

其他对象允许进入 `UNKNOWN + rawRef`。

## 20. 实现建议

后端建议新增：

```text
server/dwg/bundle/
├─ __init__.py
├─ builder.py
├─ manifest.py
├─ tables.py
├─ entities.py
├─ geometry.py
├─ render.py
├─ hierarchy.py
├─ properties.py
├─ pick.py
├─ diagnostics.py
└─ raw.py
```

前端建议新增：

```text
src/components/viewer/cadEngine/bundle/
├─ bundleTypes.ts
├─ loadCadBundle.ts
├─ normalizeCadBundle.ts
├─ bundleToGlx.ts
├─ bundlePickIndex.ts
├─ bundleLayerRuntime.ts
└─ properties/
   ├─ common.ts
   ├─ polyline.ts
   ├─ text.ts
   ├─ mtext.ts
   ├─ dimension.ts
   ├─ hatch.ts
   └─ index.ts
```

## 21. 验收标准

Bundle v1 原型完成后，必须满足：

- 同一个 DWG 的 `entityCount`、`hierarchy`、`render.primitives` 数量可诊断。
- `POLYLINE startWidth=0` 不丢失。
- `MTEXT definedWidth` 和 `actualWidth` 分开。
- DIMENSION 的尺寸线、尺寸界线、文字颜色能给出 provenance。
- 属性面板只消费 `properties`，不再在 UI 里重复推断关键 CAD 字段。
- 图层树和实体树从 `hierarchy` 读取。
- 前端仍能通过现有回归图纸完成渲染。
