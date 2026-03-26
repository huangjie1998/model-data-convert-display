# SketchUp SKP to GLB Converter DLL

鍩轰簬 SketchUp C API 鐨?SKP 鏂囦欢杞崲鍣?DLL锛屾敮鎸佸皢 SketchUp 妯″瀷瀵煎嚭涓?GLB 鏍煎紡渚?Web 浣跨敤銆?

## 椤圭洰缁撴瀯

```
skp_converter/
鈹溾攢鈹€ CMakeLists.txt               # CMake 鏋勫缓閰嶇疆 猸愭帹鑽?
鈹溾攢鈹€ build.bat                    # Windows 鎵瑰鐞嗘瀯寤鸿剼鏈?
鈹溾攢鈹€ build.ps1                    # PowerShell 鏋勫缓鑴氭湰锛堝姛鑳芥渶鍏級
鈹溾攢鈹€ skp_to_gltf.h                # DLL 鎺ュ彛澶存枃浠?
鈹溾攢鈹€ skp_to_gltf.cpp              # 瀹炵幇浠ｇ爜
鈹溾攢鈹€ skp_converter.sln            # Visual Studio 瑙ｅ喅鏂规
鈹溾攢鈹€ skp_converter.vcxproj        # Visual Studio 椤圭洰鏂囦欢
鈹溾攢鈹€ test_converter.cpp           # C++ 娴嬭瘯绋嬪簭
鈹溾攢鈹€ test_dll.py                  # Python 娴嬭瘯鑴氭湰
鈹溾攢鈹€ SDK_WIN_x64_2026-1-103/      # SketchUp SDK (宸叉斁缃?
鈹?  鈹溾攢鈹€ headers/SketchUpAPI/     # C API 澶存枃浠?
鈹?  鈹斺攢鈹€ binaries/sketchup/x64/   # 搴撴枃浠跺拰 DLL
鈹斺攢鈹€ README.md                    # 鏈枃浠?
```

## 蹇€熷紑濮?

### 鏂瑰紡涓€锛氳嚜鍔ㄧ紪璇戯紙淇敼鍗宠嚜鍔ㄦ瀯寤猴級猸愨瓙鎺ㄨ崘

鍚姩鏂囦欢鐩戣锛屼慨鏀逛唬鐮佸悗**鑷姩閲嶆柊缂栬瘧**锛?

```powershell
cd server\skp_converter

# 鍚姩鑷姩缂栬瘧妯″紡
.\watch-build.ps1

# 鎴栦娇鐢ㄦ壒澶勭悊
.\auto-build.bat
```

鐒跺悗淇敼 `skp_to_gltf.cpp` 鎴?`skp_to_gltf.h`锛屼繚瀛樺悗鑷姩缂栬瘧锛?

### 鏂瑰紡浜岋細涓€閿瀯寤猴紙鎵嬪姩锛夆瓙鎺ㄨ崘

**浣跨敤 PowerShell锛堟帹鑽愶級锛?*
```powershell
cd server\skp_converter
.\build.ps1
```

**鎴栦娇鐢ㄦ壒澶勭悊锛?*
```cmd
cd server\skp_converter
.\build.bat
```

杈撳嚭鏂囦欢灏嗚嚜鍔ㄥ鍒跺埌锛歚skp_converter_deploy/`

### 鏂瑰紡浜岋細浣跨敤 CMake

```cmd
cd server\skp_converter
mkdir build
cd build

# 鐢熸垚 Visual Studio 椤圭洰
cmake .. -G "Visual Studio 17 2022" -A x64

# 缂栬瘧 Release 鐗堟湰
cmake --build . --config Release

# 缂栬瘧 Debug 鐗堟湰锛堝彲閫夛級
cmake --build . --config Debug
```

### 鏂瑰紡涓夛細Visual Studio IDE

```cmd
double-click skp_converter.sln
# 閫夋嫨 Release + x64
# 鎸?F7 缂栬瘧
```

## 楂樼骇 CMake 閫夐」

```bash
# 鎸囧畾鐢熸垚鍣紙Visual Studio 鐗堟湰锛?
cmake .. -G "Visual Studio 16 2019" -A x64  # VS2019
cmake .. -G "Visual Studio 17 2022" -A x64  # VS2022

# 鍙瀯寤?DLL锛屼笉鏋勫缓娴嬭瘯绋嬪簭
cmake .. -DBUILD_TESTS=OFF

# 鎸囧畾涓嶅悓鐨勬瀯寤虹被鍨?
cmake .. -DCMAKE_BUILD_TYPE=Debug
cmake .. -DCMAKE_BUILD_TYPE=Release

# 瀹夎鍒扮郴缁熺洰褰曪紙闇€瑕佺鐞嗗憳鏉冮檺锛?
cmake --install . --prefix "C:/Program Files/SKPConverter"
```

## 閮ㄧ讲鏂囦欢

缂栬瘧鍚庯紝灏嗕互涓嬫枃浠跺鍒跺埌鍚庣鐩綍锛?

```
server/
鈹溾攢鈹€ skp_converter/
鈹?  鈹溾攢鈹€ skp_converter.dll        # 缂栬瘧鐢熸垚鐨?DLL
鈹?  鈹斺攢鈹€ SketchUpAPI.dll          # SketchUp 杩愯鏃讹紙鑷姩澶嶅埗锛?
鈹斺攢鈹€ app.py               # Python 鍚庣
```

涓€閿儴缃茶剼鏈凡鑷姩灏嗘枃浠跺鍒跺埌 `skp_converter_deploy/` 鐩綍銆?

## 娴嬭瘯

### Python 娴嬭瘯

```cmd
cd skp_converter_deploy
python test_dll.py test.skp output.glb
```

### C++ 娴嬭瘯锛堝鏋滅紪璇戜簡 test_converter锛?

```cmd
cd skp_converter_deploy
test_converter.exe test.skp output.glb
```

## 鍔熻兘鐗规€?

- 鉁?璇诲彇 SKP 鏂囦欢锛堟敮鎸佺粍浠躲€佺粍銆佹潗璐級
- 鉁?鑷姩涓夎鍖栧嚑浣曚綋
- 鉁?瀵煎嚭涓?GLB 2.0 鏍煎紡
- 鉁?淇濈暀鏉愯川棰滆壊
- 鉁?鏀寔 UV 绾圭悊鍧愭爣
- 鉁?Python ctypes 鎺ュ彛
- 鉁?鍗曟枃浠堕儴缃诧紙DLL + 渚濊禆锛?

## API 鎺ュ彛

```c
// 鍒濆鍖?
int skp_converter_init();

// 杞崲 SKP 鍒?GLB
int skp_to_glb(const char* input_path, const char* output_path);

// 鑾峰彇閿欒淇℃伅
const char* skp_get_error();

// 鑾峰彇妯″瀷缁熻
char* skp_get_stats(const char* input_path);

// 閲婃斁璧勬簮
void skp_converter_cleanup();
void skp_free_string(char* str);
```

## Python 浣跨敤绀轰緥

```python
from skp_converter import SKPConverter

# 杞崲鏂囦欢
with SKPConverter("skp_converter/skp_converter.dll") as converter:
    if converter.convert("input.skp", "output.glb"):
        print("Success!")
    else:
        print(f"Error: {converter.get_error()}")
```

## 鎶€鏈鏄?

### 涓轰粈涔堥渶瑕?DLL锛?

SketchUp C API 鏄?C/C++ 鎺ュ彛锛孭ython 鏃犳硶鐩存帴璋冪敤銆傞€氳繃缂栬瘧涓?DLL锛孭ython 鍙互浣跨敤 ctypes 鍔犺浇骞惰皟鐢ㄥ叾涓殑鍑芥暟銆?

### GLB 鏍煎紡

GLB (GL Transmission Format Binary) 鏄?
- Web 3D 鏍囧噯鏍煎紡
- Three.js 鍘熺敓鏀寔
- 鍖呭惈鍑犱綍浣撱€佹潗璐ㄣ€佺汗鐞嗙殑鍗曚竴鏂囦欢
- 楂樻晥鐨勪簩杩涘埗鏍煎紡

### 杞崲娴佺▼

```
SKP File
    鈫?
SketchUp C API (鍔犺浇妯″瀷)
    鈫?
鎻愬彇鍑犱綍浣?鈫?涓夎鍖?鈫?鏀堕泦鏉愯川
    鈫?
鏋勫缓 GLTF/GLB 鏁版嵁缁撴瀯
    鈫?
鍐欏叆浜岃繘鍒?GLB 鏂囦欢
    鈫?
Three.js 鍔犺浇鏄剧ず
```

## 鏁呴殰鎺掗櫎

| 闂 | 瑙ｅ喅鏂规 |
|------|----------|
| CMake 鎵句笉鍒?| 瀹夎 CMake 骞舵坊鍔犲埌 PATH |
| Visual Studio 鎵句笉鍒?| 瀹夎 VS2019+ 骞堕€夋嫨 "Desktop development with C++" |
| DLL 鍔犺浇澶辫触 | 纭繚 SketchUpAPI.dll 鍦ㄥ悓涓€鐩綍 |
| 鍒濆鍖栧け璐?| 妫€鏌ユ槸鍚︿娇鐢?x64 缂栬瘧 |
| 杞崲澶辫触 | 妫€鏌?SKP 鏂囦欢鐗堟湰鏄惁鍙楁敮鎸?|

### PowerShell 鑴氭湰鍔熻兘

```powershell
# 鏍囧噯鏋勫缓
.\build.ps1

# 娓呯悊骞堕噸鏂版瀯寤?
.\build.ps1 -Rebuild

# 鍙竻鐞?
.\build.ps1 -Clean

# 鏋勫缓骞舵祴璇?
.\build.ps1 -Test

# 鏋勫缓 Debug 鐗堟湰
.\build.ps1 -Configuration Debug
```

## 璁稿彲

- **SketchUp SDK**: Trimble Inc. 鐗堟潈鎵€鏈夛紝鍟嗕笟浣跨敤闇€鎺堟潈
- **鏈唬鐮?*: MIT 璁稿彲璇侊紙浠呯ず渚嬩唬鐮侀儴鍒嗭級

## 鍙傝€?

- SketchUp C API 鏂囨。: https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html
- GLTF 瑙勮寖: https://registry.khronos.org/glTF/
- Three.js GLTFLoader: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- CMake 鏂囨。: https://cmake.org/documentation/

