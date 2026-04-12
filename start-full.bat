@echo off
chcp 65001 >nul
echo ===================================
echo  寤虹瓚鍥剧焊娴忚鍣?- 瀹屾暣鐗堝惎鍔ㄨ剼鏈?
echo ===================================
echo.

REM 妫€鏌?Node.js
echo [妫€鏌 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [閿欒] 鏈壘鍒?Node.js锛岃鍏堝畨瑁?Node.js 20+
    pause
    exit /b 1
)
echo [OK] Node.js 宸插畨瑁?

REM 妫€鏌?Python
echo.
echo [妫€鏌 Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [閿欒] 鏈壘鍒?Python
    pause
    exit /b 1
)
echo [OK] Python 宸插畨瑁?
python --version

REM 瀹夎鍓嶇渚濊禆
echo.
if not exist "node_modules" (
    echo [瀹夎] 鍓嶇渚濊禆...
    npm install
) else (
    echo [OK] 鍓嶇渚濊禆宸插畨瑁?
)

REM 鍚姩鍚庣
echo.
echo [鍚姩] 鍚庣鏈嶅姟锛堝畬鏁寸増锛?..
cd server

if not exist "venv" (
    echo   鍒涘缓铏氭嫙鐜...
    python -m venv venv
)

echo   婵€娲昏櫄鎷熺幆澧?..
call venv\Scripts\activate.bat

echo   瀹夎/鏇存柊渚濊禆...
pip install -q flask==3.1.0 flask-cors==5.0.0 werkzeug==3.1.3 pypdf2==3.0.1

echo   鍚姩鍚庣...
set "SKP_DLL_DIR=%~dp0skp_converter_deploy"
set "ODA_VERSION=2026.03.25-v1"
set "ODA_RUNTIME_ROOT=%~dp0server\vendor\oda\win-x64\%ODA_VERSION%"
set "ODA_READ_EXE=%ODA_RUNTIME_ROOT%\bin\OdReadEx.exe"
set "DWG_CORE_TIMEOUT_SEC=60"
set "DWG_ODA_TIMEOUT_SEC=420"
set "DWG_ODA_TIMEOUT_RETRY_ENABLED=1"
set "DWG_ODA_TIMEOUT_RETRY_SEC=600"
set "DWG_ODA_LARGE_FILE_MB=80"
set "DWG_ODA_LARGE_FILE_TIMEOUT_SEC=420"
set "PATH=%SKP_DLL_DIR%;%ODA_RUNTIME_ROOT%\bin;%PATH%"
start "backend-service" cmd /c "set SKP_DLL_DIR=%SKP_DLL_DIR% && set ODA_VERSION=%ODA_VERSION% && set ODA_READ_EXE=%ODA_READ_EXE% && set ODA_RUNTIME_ROOT=%ODA_RUNTIME_ROOT% && set DWG_CORE_TIMEOUT_SEC=60 && set DWG_ODA_TIMEOUT_SEC=420 && set DWG_ODA_TIMEOUT_RETRY_ENABLED=1 && set DWG_ODA_TIMEOUT_RETRY_SEC=600 && set DWG_ODA_LARGE_FILE_MB=80 && set DWG_ODA_LARGE_FILE_TIMEOUT_SEC=420 && set PATH=%SKP_DLL_DIR%;%ODA_RUNTIME_ROOT%\bin;%PATH% && python app.py"

cd ..
echo [OK] 鍚庣宸插惎鍔ㄥ湪 http://localhost:5000
timeout /t 2 >nul

REM 鍚姩鍓嶇
echo.
echo [鍚姩] 鍓嶇鏈嶅姟...
start "鍓嶇鏈嶅姟" cmd /c "npm run dev"

echo.
echo ===================================
echo  鏈嶅姟鍚姩鎴愬姛锛?
echo ===================================
echo 鍚庣: http://localhost:5000
echo 鍓嶇: http://localhost:5174
echo.
echo 鎻愮ず:
echo - 鍚庣鏄畬鏁寸増锛屾敮鎸?SKP/DWG 杞崲锛堝鏋滃畨瑁呬簡杞崲宸ュ叿锛?
echo - 濡傛灉娌℃湁瀹夎 ODAFileConverter 绛夊伐鍏凤紝浼氳嚜鍔ㄦ彁绀烘墜鍔ㄨ浆鎹?
echo.
echo 姝ｅ湪鎵撳紑娴忚鍣?..
timeout /t 3 >nul
start http://localhost:5174

echo.
echo 鎸変换鎰忛敭鍏抽棴鎵€鏈夋湇鍔?..
pause

echo 姝ｅ湪鍋滄鏈嶅姟...
taskkill /FI "WINDOWTITLE eq 鍚庣鏈嶅姟*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq 鍓嶇鏈嶅姟*" /F >nul 2>&1
echo 宸插仠姝?
timeout /t 2 >nul
