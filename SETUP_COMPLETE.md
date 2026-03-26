# 寤虹瓚鍥剧焊娴忚鍣?- 閮ㄧ讲瀹屾垚

## 绯荤粺鐘舵€?

| 缁勪欢 | 鍦板潃 | 鐘舵€?|
|------|------|------|
| 鍓嶇 | http://localhost:5174 | 杩愯涓?|
| 鍚庣 | http://localhost:5000 | 杩愯涓?|
| SKP Converter DLL | 宸插姞杞?| 鍙敤 |

## 鍔熻兘鐗规€?

- 3D 妯″瀷鏌ョ湅锛圙LTF/GLB/OBJ/FBX锛?
- 2D 鍥剧焊鏌ョ湅锛圥DF/PNG/JPG/DXF锛?
- SKP 鏂囦欢鑷姩杞崲锛圫ketchUp C API锛?
- DWG 鏂囦欢鑷姩杞崲锛堝鏈?ODAFileConverter锛?

## 浣跨敤鏂瑰紡

### 1. 璁块棶鍓嶇
鎵撳紑娴忚鍣ㄨ闂細http://localhost:5174

### 2. 涓婁紶 SKP 鏂囦欢
- 鍒囨崲鍒?"3D 妯″瀷" 鏍囩
- 鎷栨嫿 SKP 鏂囦欢鍒颁笂浼犲尯鍩?
- 鍚庣鑷姩璋冪敤 DLL 杞崲涓?GLB
- 娴忚鍣ㄦ樉绀鸿浆鎹㈠悗鐨?3D 妯″瀷

### 3. API 鎺ュ彛
```bash
# 鍋ュ悍妫€鏌?
curl http://localhost:5000/api/health

# 杞崲宸ュ叿鐘舵€?
curl http://localhost:5000/api/converters/status

# 涓婁紶鏂囦欢
curl -X POST -F "file=@test.skp" http://localhost:5000/api/upload
```

## 鏂囦欢缁撴瀯

```
C:/development/妯″瀷鏁版嵁杞崲鏄剧ず/
鈹溾攢鈹€ server/
鈹?  鈹溾攢鈹€ app.py          # 鍚庣涓绘湇鍔?
鈹?  鈹溾攢鈹€ skp_converter.py        # DLL Python 鍖呰鍣?
鈹?  鈹溾攢鈹€ uploads/                # 涓婁紶鏂囦欢
鈹?  鈹斺攢鈹€ converted/              # 杞崲鍚庢枃浠?
鈹溾攢鈹€ skp_converter_deploy/
鈹?  鈹溾攢鈹€ skp_converter.dll       # 缂栬瘧鐨勮浆鎹㈠櫒 DLL
鈹?  鈹斺攢鈹€ SketchUpAPI.dll         # SketchUp 杩愯鏃?
鈹斺攢鈹€ src/                        # 鍓嶇浠ｇ爜
```

## 閲嶅惎鏈嶅姟

濡傛灉鏈嶅姟鍋滄锛岄噸鍚懡浠わ細

```powershell
# 閲嶅惎鍚庣
cd server
python app.py

# 閲嶅惎鍓嶇锛堟柊寮€绐楀彛锛?
npm run dev
```

## 鏁呴殰鎺掗櫎

1. DLL 鍔犺浇澶辫触锛氭鏌?skp_converter_deploy/ 鐩綍
2. 杞崲澶辫触锛氭煡鐪嬪悗绔棩蹇?
3. 鍓嶇鏃犳硶杩炴帴锛氭鏌?.env 閰嶇疆

## 寮€鍙戞ā寮?

```powershell
# 鑷姩缂栬瘧 SKP 杞崲鍣紙淇敼浠ｇ爜鍚庤嚜鍔ㄦ瀯寤猴級
cd server/skp_converter
.\watch-build.ps1
```

---
绯荤粺宸插氨缁紝鍙互姝ｅ父浣跨敤锛?


## ODA Runtime Vendor (New)

To keep DWG parsing fully inside this repo, the ODA runtime is now stored in:

- `server/vendor/oda/win-x64/2026.03.25-v1/bin`

Use this command to sync/update runtime binaries:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-oda-runtime.ps1 -Clean
```

Startup scripts `start-all.bat`, `start-full.bat`, and `start-production.bat` now default to this project-local runtime path.

Verify backend status:

```bash
curl http://localhost:5000/api/dwg/health
```

You should see `mode=oda_cli` and `oda_runtime_in_project=true`.
