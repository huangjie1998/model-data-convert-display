# 建筑图纸浏览器

一个用于上传、查看和管理建筑图纸及 3D 模型的 Web 应用程序。支持直接在浏览器中查看多种格式的文件，并提供后端转换服务处理专有格式。

## 功能特性

### 支持的文件格式

#### 3D 模型
| 格式 | 浏览器直接支持 | 后端转换 |
|------|-------------|---------|
| GLTF/GLB | ✅ | - |
| OBJ | ✅ | - |
| FBX | ✅ | - |
| SKP (SketchUp) | ❌ | ✅ 转换为 GLB |

#### 2D 图纸
| 格式 | 浏览器直接支持 | 后端转换 |
|------|-------------|---------|
| PDF | ✅ | - |
| PNG/JPG | ✅ | - |
| DXF | ✅ (内置查看器) | - |
| DWG (AutoCAD) | ❌ | ✅ 转换为 PDF |

### 主要功能

- 🎯 **拖拽上传**: 支持拖拽文件到上传区域
- 🔧 **格式转换**: 后端服务自动将 SKP 和 DWG 转换为可查看格式
- 👁️ **3D 模型查看**: 使用 Three.js 渲染，支持旋转、缩放、平移
- 📐 **2D 图纸查看**: 支持缩放、平移、旋转，内置 DXF 渲染器
- 📁 **文件管理**: 侧边栏管理已上传的文件
- 📱 **响应式设计**: 适配不同屏幕尺寸

## 快速开始

### 环境要求

- Node.js 20+
- Python 3.10+ (后端转换服务)
- Docker & Docker Compose (推荐部署方式)

### 安装依赖

```bash
# 安装前端依赖
npm install

# 安装后端依赖 (如不使用 Docker)
cd server
pip install -r requirements.txt
```

### 开发模式

```bash
# 启动前端开发服务器
npm run dev

# 在另一个终端启动后端服务 (可选)
cd server
python app.py
```

前端将运行在 http://localhost:5174，后端在 http://localhost:5000

### 生产部署

#### 方式一：使用 Docker Compose (推荐)

```bash
# 构建前端
cd server
npm run build
cd ..

# 启动所有服务
docker-compose up -d
```

访问 http://localhost 即可使用。

#### 方式二：手动部署

1. 构建前端
```bash
npm run build
```

2. 配置 Web 服务器 (如 Nginx) 指向 `dist` 目录

3. 启动后端服务
```bash
cd server
python app.py
```

## 文件格式说明

### SKP (SketchUp)

SKP 是 SketchUp 的专有格式，**浏览器无法直接解析**。

**解决方案：**
1. **启用后端服务**: 后端使用 ODA File Converter 或 Blender 自动转换
2. **手动转换**: 在 SketchUp 中导出为 GLTF/GLB 格式
   - 安装 Khronos glTF 导出插件
   - 文件 → 导出 → 3D模型 → 选择 GLTF/GLB

### DWG (AutoCAD)

DWG 是 AutoCAD 的专有格式，**浏览器无法直接解析**。

**解决方案：**
1. **启用后端服务**: 后端使用 ODA File Converter 转换为 PDF
2. **转换为 DXF**: 在 AutoCAD 中另存为 DXF 格式（前端内置 DXF 查看器）
3. **导出为 PDF**: 在 AutoCAD 中导出为 PDF

### DXF

DXF 是 CAD 数据交换的标准格式。本项目**内置 DXF 查看器**，可直接在浏览器中渲染：
- 支持 LINE、CIRCLE、ARC、LWPOLYLINE 等实体
- 图层管理
- 坐标系显示
- 缩放、平移、旋转

## 后端转换服务

后端服务基于 Flask，提供以下 API：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/upload` | POST | 上传并转换文件 |
| `/api/download/<filename>` | GET | 下载文件 |
| `/api/converters/status` | GET | 查看转换工具状态 |
| `/api/cleanup` | POST | 清理临时文件 |

### 转换工具

后端依赖以下工具进行格式转换：

- **ODA File Converter**: DWG ↔ DXF/DWF/PDF (最可靠)
- **LibreCAD**: DWG/DXF 查看和转换
- **Assimp**: 3D 模型格式转换
- **Inkscape**: 矢量图形处理

### Docker 部署注意事项

由于 ODA File Converter 需要从 ODA 官网下载，且可能需要许可，Docker 镜像中：
1. 尝试自动下载并安装 ODA File Converter
2. 如失败，则使用 LibreCAD 作为备选方案
3. 建议在宿主机安装 ODA File Converter 并挂载到容器

## 项目结构

```
.
├── src/                      # 前端源码
│   ├── components/
│   │   ├── viewer/          # 查看器组件
│   │   │   ├── Model3DViewer.tsx    # 3D 模型查看器
│   │   │   ├── Drawing2DViewer.tsx  # 2D 图纸查看器
│   │   │   └── DXFViewer.tsx        # DXF 专用查看器
│   │   ├── upload/          # 上传组件
│   │   └── FormatConverter.tsx      # 格式转换指南
│   ├── services/
│   │   └── converterApi.ts  # 后端 API 接口
│   └── App.tsx              # 主应用组件
├── server/                   # 后端服务
│   ├── app.py               # Flask 应用
│   ├── converter.py         # 转换器类
│   ├── requirements.txt     # Python 依赖
│   └── Dockerfile           # Docker 构建文件
├── docker-compose.yml       # Docker Compose 配置
└── nginx.conf               # Nginx 配置
```

## 技术栈

### 前端
- React 19 + TypeScript
- Vite 7
- Tailwind CSS 3
- shadcn/ui 组件库
- Three.js + React Three Fiber (3D 渲染)
- dxf-parser (DXF 解析)

### 后端
- Python 3.10+
- Flask
- Flask-CORS
- ODA File Converter / LibreCAD

## 故障排除

### 后端服务无法连接

1. 检查后端服务是否运行
   ```bash
   curl http://localhost:5000/api/health
   ```

2. 检查防火墙设置

3. 检查 CORS 配置

### SKP/DWG 转换失败

1. 检查转换工具是否安装
   ```bash
   curl http://localhost:5000/api/converters/status
   ```

2. 查看后端日志
   ```bash
   docker logs cad-converter-backend
   ```

3. 手动转换后上传

### DXF 文件渲染异常

- 本项目的 DXF 查看器实现了基础实体类型的渲染
- 复杂实体（如多行文字、块引用、样条曲线）可能无法正确显示
- 建议将 DXF 转换为 PDF 以获得最佳效果

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request。

## 致谢

- [Three.js](https://threejs.org/) - 3D 渲染引擎
- [Open Design Alliance](https://www.opendesign.com/) - DWG/DXF 技术支持
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件库
