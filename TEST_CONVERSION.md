# SKP 杞崲娴嬭瘯鎸囧崡

## 鏈嶅姟鐘舵€?

| 鏈嶅姟 | 鍦板潃 | 鐘舵€?|
|------|------|------|
| 鍓嶇 | http://localhost:5174 | 鉁?杩愯涓?|
| 鍚庣 | http://localhost:5000 | 鉁?杩愯涓?|
| SKP Converter DLL | skp_converter_deploy/ | 鉁?宸插姞杞?|

## 楠岃瘉姝ラ

### 1. 妫€鏌?API 鍋ュ悍鐘舵€?

```bash
curl http://localhost:5000/api/health
```

棰勬湡杈撳嚭锛?
```json
{
  "status": "ok",
  "service": "CAD Converter (with SKP API)",
  "version": "1.1.0",
  "skp_api_available": true,
  "skp_dll_path": "C:\\development\\妯″瀷鏁版嵁杞崲鏄剧ず\\skp_converter_deploy\\skp_converter.dll"
}
```

### 2. 妫€鏌ヨ浆鎹㈠伐鍏风姸鎬?

```bash
curl http://localhost:5000/api/converters/status
```

纭 `skp_api.available` 涓?`true`

### 3. 浣跨敤鍓嶇涓婁紶 SKP 鏂囦欢

1. 鎵撳紑娴忚鍣ㄨ闂細http://localhost:5174
2. 鍒囨崲鍒?"3D 妯″瀷" 鏍囩
3. 鎷栨嫿 SKP 鏂囦欢鍒颁笂浼犲尯鍩?
4. 绛夊緟杞崲瀹屾垚锛堣嚜鍔ㄨ浆鎹负 GLB锛?
5. 鏌ョ湅杞崲鍚庣殑 3D 妯″瀷

### 4. 浣跨敤 API 鐩存帴娴嬭瘯

```bash
# 涓婁紶 SKP 鏂囦欢
curl -X POST -F "file=@test.skp" http://localhost:5000/api/upload

# 棰勬湡杈撳嚭锛?
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

## 鏂囦欢缁撴瀯

```
C:/development/妯″瀷鏁版嵁杞崲鏄剧ず/
鈹溾攢鈹€ server/                          # 鍚庣浠ｇ爜
鈹?  鈹溾攢鈹€ app.py              # 涓诲悗绔湇鍔?
鈹?  鈹溾攢鈹€ skp_converter.py            # Python DLL 鍖呰鍣?
鈹?  鈹溾攢鈹€ uploads/                    # 涓婁紶鏂囦欢瀛樺偍
鈹?  鈹斺攢鈹€ converted/                  # 杞崲鍚庢枃浠跺瓨鍌?
鈹溾攢鈹€ skp_converter_deploy/           # DLL 閮ㄧ讲鐩綍
鈹?  鈹溾攢鈹€ skp_converter.dll           # 缂栬瘧鐨勮浆鎹㈠櫒 DLL
鈹?  鈹溾攢鈹€ SketchUpAPI.dll             # SketchUp 杩愯鏃?
鈹?  鈹斺攢鈹€ test_dll.py                 # 娴嬭瘯鑴氭湰
鈹斺攢鈹€ src/                            # 鍓嶇浠ｇ爜
```

## 鏁呴殰鎺掗櫎

### DLL 鍔犺浇澶辫触

**鐥囩姸**锛歚skp_api_available: false`

**瑙ｅ喅**锛?
1. 妫€鏌?DLL 鏂囦欢鏄惁瀛樺湪锛歚dir skp_converter_deploy/`
2. 纭繚 SketchUpAPI.dll 鍦ㄥ悓涓€鐩綍
3. 閲嶅惎鍚庣鏈嶅姟

### 杞崲澶辫触

**鐥囩姸**锛氫笂浼?SKP 鍚庢樉绀?"杞崲澶辫触"

**瑙ｅ喅**锛?
1. 妫€鏌ュ悗绔棩蹇?
2. 纭繚 SKP 鏂囦欢鏈崯鍧?
3. 灏濊瘯浣跨敤娴嬭瘯鑴氭湰锛歚python skp_converter_deploy/test_dll.py`

### 鍓嶇鏃犳硶杩炴帴鍚庣

**鐥囩姸**锛?鍚庣鏈嶅姟绂荤嚎"

**瑙ｅ喅**锛?
1. 妫€鏌ュ悗绔槸鍚﹁繍琛岋細`curl http://localhost:5000/api/health`
2. 妫€鏌?`.env` 鏂囦欢涓殑 `VITE_API_URL`
3. 纭繚娌℃湁闃茬伀澧欓樆鎸?

## 鎵嬪姩娴嬭瘯 DLL

```bash
cd skp_converter_deploy
python test_dll.py test.skp output.glb
```

## 娴忚鍣ㄨ闂?

鎵撳紑 http://localhost:5174 浣跨敤瀹屾暣鍔熻兘锛?

