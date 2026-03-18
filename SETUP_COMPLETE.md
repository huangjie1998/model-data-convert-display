# 建筑图纸浏览器 - 部署完成

## 系统状态

| 组件 | 地址 | 状态 |
|------|------|------|
| 前端 | http://localhost:5173 | 运行中 |
| 后端 | http://localhost:5000 | 运行中 |
| SKP Converter DLL | 已加载 | 可用 |

## 功能特性

- 3D 模型查看（GLTF/GLB/OBJ/FBX）
- 2D 图纸查看（PDF/PNG/JPG/DXF）
- SKP 文件自动转换（SketchUp C API）
- DWG 文件自动转换（如有 ODAFileConverter）

## 使用方式

### 1. 访问前端
打开浏览器访问：http://localhost:5173

### 2. 上传 SKP 文件
- 切换到 "3D 模型" 标签
- 拖拽 SKP 文件到上传区域
- 后端自动调用 DLL 转换为 GLB
- 浏览器显示转换后的 3D 模型

### 3. API 接口
```bash
# 健康检查
curl http://localhost:5000/api/health

# 转换工具状态
curl http://localhost:5000/api/converters/status

# 上传文件
curl -X POST -F "file=@test.skp" http://localhost:5000/api/upload
```

## 文件结构

```
C:/development/模型数据转换显示/
├── server/
│   ├── app_skp_api.py          # 后端主服务
│   ├── skp_converter.py        # DLL Python 包装器
│   ├── uploads/                # 上传文件
│   └── converted/              # 转换后文件
├── skp_converter_deploy/
│   ├── skp_converter.dll       # 编译的转换器 DLL
│   └── SketchUpAPI.dll         # SketchUp 运行时
└── src/                        # 前端代码
```

## 重启服务

如果服务停止，重启命令：

```powershell
# 重启后端
cd server
python app_skp_api.py

# 重启前端（新开窗口）
npm run dev
```

## 故障排除

1. DLL 加载失败：检查 skp_converter_deploy/ 目录
2. 转换失败：查看后端日志
3. 前端无法连接：检查 .env 配置

## 开发模式

```powershell
# 自动编译 SKP 转换器（修改代码后自动构建）
cd server/skp_converter
.\watch-build.ps1
```

---
系统已就绪，可以正常使用！
