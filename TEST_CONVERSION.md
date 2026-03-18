# SKP 转换测试指南

## 服务状态

| 服务 | 地址 | 状态 |
|------|------|------|
| 前端 | http://localhost:5173 | ✅ 运行中 |
| 后端 | http://localhost:5000 | ✅ 运行中 |
| SKP Converter DLL | skp_converter_deploy/ | ✅ 已加载 |

## 验证步骤

### 1. 检查 API 健康状态

```bash
curl http://localhost:5000/api/health
```

预期输出：
```json
{
  "status": "ok",
  "service": "CAD Converter (with SKP API)",
  "version": "1.1.0",
  "skp_api_available": true,
  "skp_dll_path": "C:\\development\\模型数据转换显示\\skp_converter_deploy\\skp_converter.dll"
}
```

### 2. 检查转换工具状态

```bash
curl http://localhost:5000/api/converters/status
```

确认 `skp_api.available` 为 `true`

### 3. 使用前端上传 SKP 文件

1. 打开浏览器访问：http://localhost:5173
2. 切换到 "3D 模型" 标签
3. 拖拽 SKP 文件到上传区域
4. 等待转换完成（自动转换为 GLB）
5. 查看转换后的 3D 模型

### 4. 使用 API 直接测试

```bash
# 上传 SKP 文件
curl -X POST -F "file=@test.skp" http://localhost:5000/api/upload

# 预期输出：
# {
#   "file_id": "xxx",
#   "original_name": "test.skp",
#   "category": "3d",
#   "original_type": "skp",
#   "needs_conversion": true,
#   "converted": true,
#   "converted_type": "glb",
#   "conversion_method": "sketchup_c_api",
#   "download_url": "/api/download/xxx.glb"
# }
```

## 文件结构

```
C:/development/模型数据转换显示/
├── server/                          # 后端代码
│   ├── app_skp_api.py              # 主后端服务
│   ├── skp_converter.py            # Python DLL 包装器
│   ├── uploads/                    # 上传文件存储
│   └── converted/                  # 转换后文件存储
├── skp_converter_deploy/           # DLL 部署目录
│   ├── skp_converter.dll           # 编译的转换器 DLL
│   ├── SketchUpAPI.dll             # SketchUp 运行时
│   └── test_dll.py                 # 测试脚本
└── src/                            # 前端代码
```

## 故障排除

### DLL 加载失败

**症状**：`skp_api_available: false`

**解决**：
1. 检查 DLL 文件是否存在：`dir skp_converter_deploy/`
2. 确保 SketchUpAPI.dll 在同一目录
3. 重启后端服务

### 转换失败

**症状**：上传 SKP 后显示 "转换失败"

**解决**：
1. 检查后端日志
2. 确保 SKP 文件未损坏
3. 尝试使用测试脚本：`python skp_converter_deploy/test_dll.py`

### 前端无法连接后端

**症状**："后端服务离线"

**解决**：
1. 检查后端是否运行：`curl http://localhost:5000/api/health`
2. 检查 `.env` 文件中的 `VITE_API_URL`
3. 确保没有防火墙阻挡

## 手动测试 DLL

```bash
cd skp_converter_deploy
python test_dll.py test.skp output.glb
```

## 浏览器访问

打开 http://localhost:5173 使用完整功能！
