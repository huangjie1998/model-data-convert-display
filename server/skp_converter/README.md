# SketchUp SKP to GLB Converter DLL

基于 SketchUp C API 的 SKP 文件转换器 DLL，支持将 SketchUp 模型导出为 GLB 格式供 Web 使用。

## 项目结构

```
skp_converter/
├── CMakeLists.txt               # CMake 构建配置 ⭐推荐
├── build.bat                    # Windows 批处理构建脚本
├── build.ps1                    # PowerShell 构建脚本（功能最全）
├── skp_to_gltf.h                # DLL 接口头文件
├── skp_to_gltf.cpp              # 实现代码
├── skp_converter.sln            # Visual Studio 解决方案
├── skp_converter.vcxproj        # Visual Studio 项目文件
├── test_converter.cpp           # C++ 测试程序
├── test_dll.py                  # Python 测试脚本
├── SDK_WIN_x64_2026-1-103/      # SketchUp SDK (已放置)
│   ├── headers/SketchUpAPI/     # C API 头文件
│   └── binaries/sketchup/x64/   # 库文件和 DLL
└── README.md                    # 本文件
```

## 快速开始

### 方式一：自动编译（修改即自动构建）⭐⭐推荐

启动文件监视，修改代码后**自动重新编译**：

```powershell
cd server\skp_converter

# 启动自动编译模式
.\watch-build.ps1

# 或使用批处理
.\auto-build.bat
```

然后修改 `skp_to_gltf.cpp` 或 `skp_to_gltf.h`，保存后自动编译！

### 方式二：一键构建（手动）⭐推荐

**使用 PowerShell（推荐）：**
```powershell
cd server\skp_converter
.\build.ps1
```

**或使用批处理：**
```cmd
cd server\skp_converter
.\build.bat
```

输出文件将自动复制到：`skp_converter_deploy/`

### 方式二：使用 CMake

```cmd
cd server\skp_converter
mkdir build
cd build

# 生成 Visual Studio 项目
cmake .. -G "Visual Studio 17 2022" -A x64

# 编译 Release 版本
cmake --build . --config Release

# 编译 Debug 版本（可选）
cmake --build . --config Debug
```

### 方式三：Visual Studio IDE

```cmd
double-click skp_converter.sln
# 选择 Release + x64
# 按 F7 编译
```

## 高级 CMake 选项

```bash
# 指定生成器（Visual Studio 版本）
cmake .. -G "Visual Studio 16 2019" -A x64  # VS2019
cmake .. -G "Visual Studio 17 2022" -A x64  # VS2022

# 只构建 DLL，不构建测试程序
cmake .. -DBUILD_TESTS=OFF

# 指定不同的构建类型
cmake .. -DCMAKE_BUILD_TYPE=Debug
cmake .. -DCMAKE_BUILD_TYPE=Release

# 安装到系统目录（需要管理员权限）
cmake --install . --prefix "C:/Program Files/SKPConverter"
```

## 部署文件

编译后，将以下文件复制到后端目录：

```
server/
├── skp_converter/
│   ├── skp_converter.dll        # 编译生成的 DLL
│   └── SketchUpAPI.dll          # SketchUp 运行时（自动复制）
└── app_skp_api.py               # Python 后端
```

一键部署脚本已自动将文件复制到 `skp_converter_deploy/` 目录。

## 测试

### Python 测试

```cmd
cd skp_converter_deploy
python test_dll.py test.skp output.glb
```

### C++ 测试（如果编译了 test_converter）

```cmd
cd skp_converter_deploy
test_converter.exe test.skp output.glb
```

## 功能特性

- ✅ 读取 SKP 文件（支持组件、组、材质）
- ✅ 自动三角化几何体
- ✅ 导出为 GLB 2.0 格式
- ✅ 保留材质颜色
- ✅ 支持 UV 纹理坐标
- ✅ Python ctypes 接口
- ✅ 单文件部署（DLL + 依赖）

## API 接口

```c
// 初始化
int skp_converter_init();

// 转换 SKP 到 GLB
int skp_to_glb(const char* input_path, const char* output_path);

// 获取错误信息
const char* skp_get_error();

// 获取模型统计
char* skp_get_stats(const char* input_path);

// 释放资源
void skp_converter_cleanup();
void skp_free_string(char* str);
```

## Python 使用示例

```python
from skp_converter import SKPConverter

# 转换文件
with SKPConverter("skp_converter/skp_converter.dll") as converter:
    if converter.convert("input.skp", "output.glb"):
        print("Success!")
    else:
        print(f"Error: {converter.get_error()}")
```

## 技术说明

### 为什么需要 DLL？

SketchUp C API 是 C/C++ 接口，Python 无法直接调用。通过编译为 DLL，Python 可以使用 ctypes 加载并调用其中的函数。

### GLB 格式

GLB (GL Transmission Format Binary) 是:
- Web 3D 标准格式
- Three.js 原生支持
- 包含几何体、材质、纹理的单一文件
- 高效的二进制格式

### 转换流程

```
SKP File
    ↓
SketchUp C API (加载模型)
    ↓
提取几何体 → 三角化 → 收集材质
    ↓
构建 GLTF/GLB 数据结构
    ↓
写入二进制 GLB 文件
    ↓
Three.js 加载显示
```

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| CMake 找不到 | 安装 CMake 并添加到 PATH |
| Visual Studio 找不到 | 安装 VS2019+ 并选择 "Desktop development with C++" |
| DLL 加载失败 | 确保 SketchUpAPI.dll 在同一目录 |
| 初始化失败 | 检查是否使用 x64 编译 |
| 转换失败 | 检查 SKP 文件版本是否受支持 |

### PowerShell 脚本功能

```powershell
# 标准构建
.\build.ps1

# 清理并重新构建
.\build.ps1 -Rebuild

# 只清理
.\build.ps1 -Clean

# 构建并测试
.\build.ps1 -Test

# 构建 Debug 版本
.\build.ps1 -Configuration Debug
```

## 许可

- **SketchUp SDK**: Trimble Inc. 版权所有，商业使用需授权
- **本代码**: MIT 许可证（仅示例代码部分）

## 参考

- SketchUp C API 文档: https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html
- GLTF 规范: https://registry.khronos.org/glTF/
- Three.js GLTFLoader: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- CMake 文档: https://cmake.org/documentation/
