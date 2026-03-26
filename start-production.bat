@echo off
chcp 65001 >nul
echo ===================================
echo  寤虹瓚鍥剧焊娴忚鍣?- 鐢熶骇鐜鍚姩
echo ===================================
echo.

REM 妫€鏌?Node.js
echo [1/4] 妫€鏌?Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [閿欒] 鏈壘鍒?Node.js锛岃鍏堝畨瑁?Node.js 20+
    pause
    exit /b 1
)
echo [OK] Node.js: 
node --version

REM 妫€鏌?Python
echo.
echo [2/4] 妫€鏌?Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [閿欒] 鏈壘鍒?Python
    pause
    exit /b 1
)
echo [OK] Python: 
python --version

REM 瀹夎/妫€鏌ュ墠绔緷璧?
echo.
echo [3/4] 妫€鏌ュ墠绔緷璧?..
if not exist "node_modules" (
    echo 姝ｅ湪瀹夎鍓嶇渚濊禆...
    npm install
) else (
    echo [OK] 鍓嶇渚濊禆宸插畨瑁?
)

REM 鏋勫缓鍓嶇
echo.
echo 姝ｅ湪鏋勫缓鍓嶇鐢熶骇鐗堟湰...
npm run build
if errorlevel 1 (
    echo [閿欒] 鍓嶇鏋勫缓澶辫触
    pause
    exit /b 1
)
echo [OK] 鍓嶇鏋勫缓瀹屾垚

REM 鍚姩鍚庣
echo.
echo [4/4] 鍚姩鍚庣鏈嶅姟...
cd server

if not exist "venv" (
    echo   鍒涘缓 Python 铏氭嫙鐜...
    python -m venv venv
)

echo   婵€娲昏櫄鎷熺幆澧?..
call venv\Scripts\activate.bat

echo   瀹夎鍚庣渚濊禆...
pip install -q flask==3.1.0 flask-cors==5.0.0 werkzeug==3.1.3 pypdf2==3.0.1

echo   鍚姩瀹屾暣鐗堝悗绔?..
set "SKP_DLL_DIR=%~dp0skp_converter_deploy"
set "ODA_VERSION=2026.03.25-v1"
set "ODA_RUNTIME_ROOT=%~dp0server\vendor\oda\win-x64\%ODA_VERSION%"
set "ODA_READ_EXE=%ODA_RUNTIME_ROOT%\bin\OdReadEx.exe"
set "PATH=%SKP_DLL_DIR%;%ODA_RUNTIME_ROOT%\bin;%PATH%"
start "backend-service (http://localhost:5000)" cmd /c "set SKP_DLL_DIR=%SKP_DLL_DIR% && set ODA_VERSION=%ODA_VERSION% && set ODA_READ_EXE=%ODA_READ_EXE% && set ODA_RUNTIME_ROOT=%ODA_RUNTIME_ROOT% && set PATH=%SKP_DLL_DIR%;%ODA_RUNTIME_ROOT%\bin;%PATH% && python app.py"

cd ..
echo [OK] 鍚庣宸插惎鍔?

REM 鍚姩鍓嶇鏈嶅姟
echo.
echo 鍚姩鍓嶇鏈嶅姟...
start "鍓嶇鏈嶅姟 (http://localhost:5174)" cmd /c "npx serve -s dist -l 5174"

echo.
echo ===================================
echo  鏈嶅姟鍚姩鎴愬姛锛?
echo ===================================
echo.
echo 璁块棶鍦板潃:
echo   - 鍓嶇: http://localhost:5174
echo   - 鍚庣: http://localhost:5000
echo.
echo 鍔熻兘璇存槑:
echo   - 瀹屾暣鐗堝悗绔紙鏀寔鏂囦欢涓婁紶/涓嬭浇/杞崲鎺ュ彛锛?
echo   - 鐢熶骇鐜鏋勫缓鐨勫墠绔?
echo   - 濡傞渶杞崲 SKP/DWG锛岃瀹夎 ODAFileConverter
echo.
echo 姝ｅ湪鎵撳紑娴忚鍣?..
timeout /t 3 >nul
start http://localhost:5174

echo.
echo 鎻愮ず: 鍏抽棴寮瑰嚭鐨勫懡浠ょ獥鍙ｅ嵆鍙仠姝㈡湇鍔?
echo.
pause
