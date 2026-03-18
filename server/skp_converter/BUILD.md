# SketchUp SKP to GLB Converter - Build Instructions

## Prerequisites

1. **Visual Studio 2022** (or 2019)
   - Download: https://visualstudio.microsoft.com/
   - Install "Desktop development with C++" workload

2. **SketchUp SDK** (already included in this directory)
   - Location: `SDK_WIN_x64_2026-1-103/`
   - Headers: `SDK_WIN_x64_2026-1-103/headers/SketchUpAPI/`
   - Library: `SDK_WIN_x64_2026-1-103/binaries/sketchup/x64/SketchUpAPI.lib`
   - Runtime: `SDK_WIN_x64_2026-1-103/binaries/sketchup/x64/SketchUpAPI.dll`

## Build Steps

### Method 1: Using Visual Studio IDE

1. **Open the solution**
   ```
   Double-click on "skp_converter.sln"
   ```

2. **Select configuration**
   - Build → Configuration Manager
   - Select "Release" and "x64"

3. **Build the project**
   - Build → Build Solution (or press F7)
   - Output will be in: `x64/Release/skp_converter.dll`

4. **Verify output**
   The build should produce:
   - `skp_converter.dll` - Your conversion DLL
   - `SketchUpAPI.dll` - Copied automatically from SDK

### Method 2: Using Command Line (MSBuild)

1. **Open Developer Command Prompt**
   ```
   Start Menu → Visual Studio 2022 → Developer Command Prompt
   ```

2. **Navigate to project directory**
   ```cmd
   cd C:\development\模型数据转换显示\server\skp_converter
   ```

3. **Build Release version**
   ```cmd
   msbuild skp_converter.sln /p:Configuration=Release /p:Platform=x64
   ```

4. **Build Debug version** (optional)
   ```cmd
   msbuild skp_converter.sln /p:Configuration=Debug /p:Platform=x64
   ```

### Method 3: Using CMake

1. **Create CMakeLists.txt** (alternative build)
   ```cmake
   cmake_minimum_required(VERSION 3.10)
   project(skp_converter)
   
   set(CMAKE_CXX_STANDARD 11)
   
   # SketchUp SDK paths
   set(SKP_SDK_DIR "${CMAKE_SOURCE_DIR}/SDK_WIN_x64_2026-1-103")
   
   include_directories(${SKP_SDK_DIR}/headers)
   link_directories(${SKP_SDK_DIR}/binaries/sketchup/x64)
   
   add_library(skp_converter SHARED skp_to_gltf.cpp)
   target_link_libraries(skp_converter SketchUpAPI)
   target_compile_definitions(skp_converter PRIVATE SKP_TO_GLTF_EXPORTS)
   
   # Copy DLL to output
   add_custom_command(TARGET skp_converter POST_BUILD
       COMMAND ${CMAKE_COMMAND} -E copy
       ${SKP_SDK_DIR}/binaries/sketchup/x64/SketchUpAPI.dll
       $<TARGET_FILE_DIR:skp_converter>
   )
   ```

2. **Build with CMake**
   ```cmd
   mkdir build
   cd build
   cmake .. -G "Visual Studio 17 2022" -A x64
   cmake --build . --config Release
   ```

## Deployment

### Files needed for runtime

Copy these files to your backend directory:

```
server/
├── skp_converter/
│   ├── skp_converter.dll     # The compiled DLL (from x64/Release/)
│   └── SketchUpAPI.dll       # Runtime library (from SDK or build output)
└── app_skp_api.py            # Python backend that loads the DLL
```

### Test the DLL

Create a test script `test_dll.py`:

```python
import ctypes
import os

# Load the DLL
dll_path = os.path.join(os.path.dirname(__file__), 'skp_converter', 'skp_converter.dll')
converter = ctypes.CDLL(dll_path)

# Test initialization
result = converter.skp_converter_init()
print(f"Init result: {result}")

if result == 0:
    print("SketchUp API initialized successfully!")
    
    # Test getting model stats
    skp_path = "test.skp"  # Replace with actual SKP file
    if os.path.exists(skp_path):
        converter.skp_get_stats.restype = ctypes.c_char_p
        stats = converter.skp_get_stats(skp_path.encode())
        if stats:
            print(f"Model stats: {stats.decode()}")
            converter.skp_free_string(stats)
    
    # Cleanup
    converter.skp_converter_cleanup()
else:
    print("Failed to initialize")
```

## Troubleshooting

### Error: "Cannot open include file: 'SketchUpAPI/sketchup.h'"
**Solution**: Check that the SDK is in the correct location:
- Verify `SDK_WIN_x64_2026-1-103/headers/` exists
- Check Additional Include Directories in project properties

### Error: "Cannot open file 'SketchUpAPI.lib'"
**Solution**: Check library path:
- Verify `SDK_WIN_x64_2026-1-103/binaries/sketchup/x64/SketchUpAPI.lib` exists
- Check Additional Library Directories in project properties

### Error: "The code execution cannot proceed because SketchUpAPI.dll was not found"
**Solution**: Copy `SketchUpAPI.dll` to the same directory as your executable/DLL

### Error: "Failed to initialize SketchUp API"
**Solution**: 
- Ensure you're using x64 (not x86) build
- Check that all required Visual C++ Redistributables are installed
- Verify SKP file format version is supported by the SDK

## Integration with Python Backend

Once compiled, use the DLL from Python:

```python
from skp_converter import SKPConverter

# Convert SKP to GLB
converter = SKPConverter("server/skp_converter/skp_converter.dll")
if converter.initialize():
    success = converter.convert_to_glb("input.skp", "output.glb")
    if success:
        print("Conversion successful!")
    else:
        print(f"Error: {converter.get_error()}")
    converter.cleanup()
```

## License Notice

This project uses the SketchUp C API which requires compliance with Trimble's licensing terms:
- Development and testing: Free
- Commercial deployment: Requires license from Trimble Inc.
- See: https://www.trimble.com/legal/developers/terms-and-conditions
