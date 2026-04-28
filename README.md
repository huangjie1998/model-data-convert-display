# Model Data Convert Display

用于浏览、转换和诊断建筑图纸与模型文件的 Web 应用。当前重点能力是 **DWG/DXF/CAD 图纸浏览**、**SKP/3D 模型转换** 和 **CAD 属性/图层/层级树分析**。

## 当前重点

- DWG 通过后端 ODA runtime 解析，前端使用自研 CAD runtime 渲染。
- CAD viewer 支持图层树、实体树、属性面板、选择、高亮、文字/标注/填充/块等 DWG 语义。
- 项目正在规划自研 **Web CAD Bundle**，用于统一后端解析结果、前端渲染、拾取、属性栏和诊断数据结构。

Web CAD Bundle 设计文档见：

- `docs/cad/web-cad-bundle-v1.md`

## 支持格式

### 2D 图纸

| 格式 | 当前处理方式 | 说明 |
| --- | --- | --- |
| DWG | 后端 ODA 解析 + 前端 CAD runtime | 当前重点维护路径 |
| DXF | 前端/后端 CAD 数据解析 | 适合作为开放 CAD 交换格式 |
| PDF | 浏览器预览 | 用于导出的图纸文档 |
| PNG/JPG | 浏览器预览 | 用于普通图片图纸 |

### 3D 模型

| 格式 | 当前处理方式 | 说明 |
| --- | --- | --- |
| GLTF/GLB | 前端直接浏览 | 推荐的 Web 3D 格式 |
| OBJ/FBX | 前端浏览或转换 | 依赖 Three.js 加载能力 |
| SKP | 后端转换 | 依赖 SketchUp/ODA/转换工具链 |

## 架构概览

```text
DWG/DXF/SKP/GLB
  ↓
server/
  ├─ DWG: ODA OdReadEx / OdVectorizeEx
  ├─ SKP: 转换服务
  └─ API: Flask
  ↓
src/
  ├─ CAD viewer
  ├─ CAD runtime bridge
  ├─ 图层 / 层级树 / 属性面板
  └─ 3D viewer
```

DWG 当前链路：

```text
DWG
  ↓ ODA dump
server/dwg_service_core.py
  ↓ server/dwg/*
entities / hierarchy / primitives / diagnostics
  ↓ src/services/dwgApi.ts
src/components/viewer/CADViewerCadEngine.tsx
  ↓ cadEngine/glx
public/vendor/cad-engine-runtime.js
```

规划中的 Web CAD Bundle 链路：

```text
DWG
  ↓ ODA / 后端解析
Web CAD Bundle
  ├─ manifest
  ├─ document / tables
  ├─ entities
  ├─ render
  ├─ pick
  ├─ hierarchy
  ├─ properties
  ├─ diagnostics
  └─ raw
  ↓
前端 CAD runtime
```

## Web CAD Bundle

Web CAD Bundle 是项目后续 DWG 架构的核心协议。它不是完整 DWG 数据库复刻，而是：

- 用 `entities` 保存规范化 CAD 语义。
- 用 `render` 保存 Web 渲染 primitive/bucket。
- 用 `pick` 保存拾取索引。
- 用 `hierarchy` 保存图层/块/实体树。
- 用 `properties` 保存 AutoCAD 风格属性栏数据。
- 用 `raw` 保存 ODA/AutoCAD 原始字段，作为保真和排查兜底。

关键原则：

- `0` 是合法值，例如 `startWidth: 0` 不能被过滤。
- `MTEXT.definedWidth`、`actualWidth`、`bboxWidth` 必须分开。
- 颜色、线宽、字体、标注样式必须带 `source/provenance`。
- 渲染、拾取、属性和原始字段分层维护。

详细 schema 见 `docs/cad/web-cad-bundle-v1.md`。

## 开发环境

要求：

- Node.js 20+
- Python 3.10+
- Windows 环境建议使用 Python 3.11+
- DWG 真解析需要配置 ODA runtime

安装依赖：

```powershell
npm install
cd server
pip install -r requirements.txt
```

启动前端：

```powershell
npm run dev
```

启动后端：

```powershell
cd server
python app.py
```

常用地址：

- 前端：`http://localhost:5174`
- 后端：`http://localhost:5000`
- DWG 健康检查：`http://localhost:5000/api/dwg/health`

## ODA Runtime

项目支持把 ODA runtime 放在仓库管理目录下：

```text
server/vendor/oda/win-x64/2026.03.25-v1/bin
server/vendor/oda/win-x64/2026.03.25-v1/manifest.json
```

同步本机 ODA runtime：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-oda-runtime.ps1 -Clean
```

后端查找顺序：

1. `ODA_READ_EXE`
2. `ODA_RUNTIME_ROOT`
3. `server/vendor/oda/<profile>/<version>/bin/OdReadEx(.exe)`
4. 系统 PATH / fallback

健康检查：

```powershell
curl http://localhost:5000/api/dwg/health
```

期望字段：

- `mode: oda_cli`
- `oda_runtime_in_project: true`
- `oda_profile: win-x64`
- `oda_version: 2026.03.25-v1`

如果看到 stub mode 警告，需要检查 `ODA_READ_EXE`、`ODA_RUNTIME_ROOT` 或项目内 ODA runtime 是否存在。

## 常用命令

构建：

```powershell
npm run build
```

只构建 CAD runtime：

```powershell
npm run build:cad-runtime
```

后端 Python 编译检查：

```powershell
py -m compileall -q server\dwg server\dwg_service_core.py
```

DWG 回归：

```powershell
npm run test:drawing1-tree-consistency
npm run test:dwg-acceptance
```

Lint：

```powershell
npm run lint
```

## 项目结构

```text
src/
  components/viewer/
    CADViewerCadEngine.tsx        CAD 主 viewer
    Drawing2DViewer.tsx           2D viewer 路由入口
    cadEngine/                    CAD 前端 runtime、GLX、属性、图层和 hooks
  services/
    dwgApi.ts                     DWG API 类型和请求
server/
  app.py                          后端入口
  app_skp_api.py                  Flask API 集成
  dwg_service_core.py             DWG session/API 编排
  dwg/                            DWG parser、实体、标注、块、样式、文本、查询模块
docs/
  cad/
    web-cad-bundle-v1.md          Web CAD Bundle 协议设计
scripts/
  cad-engine/                     CAD runtime 构建脚本
public/vendor/
  cad-engine-runtime.js           生成的 CAD runtime
```

## DWG 维护重点

当前 DWG viewer 重点关注：

- `POLYLINE/LWPOLYLINE` 起止宽度、逐段宽度、bulge。
- `TEXT/MTEXT` 字体、SHX、大字体、方向、实际 bbox。
- `DIMENSION` 尺寸线颜色、尺寸界线颜色、文字颜色、匿名块展开。
- `HATCH` 图案、边界、性能和缓存。
- `INSERT/BLOCK` 块内 ARC/ELLIPSE/POLYLINE 几何变换。
- 图层/实体树隐藏显示性能。
- 大图纸加载、二次 loading、拾取性能。

新增 DWG 字段时，应优先考虑是否需要进入 Web CAD Bundle 的：

- `entities[].geom`
- `entities[].style`
- `properties`
- `render`
- `pick`
- `raw`

## 清理策略

仓库保留正式回归脚本：

- `server/scripts/check_dwg_acceptance.py`
- `server/scripts/check_drawing1_tree_consistency.py`

临时 dump、调试输出和本地 DWG 样例不应提交。相关路径已加入 `.gitignore`：

- `tmp_dwg/`
- `tmp_dimension_block.txt`
- `server/uploads/`
- `server/converted/`

## 许可证

MIT License
