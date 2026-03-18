@echo off
chcp 65001 >nul
echo ===================================
echo  建筑图纸浏览器 - 一键启动脚本
echo ===================================
echo.

REM 检查 Node.js
echo [检查] Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 20+
    pause
    exit /b 1
)
echo [OK] Node.js: 
node --version

REM 检查 Python
echo.
echo [检查] Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [警告] 未找到 Python，将只启动前端
    set BACKEND=0
) else (
    echo [OK] Python: 
    python --version
    set BACKEND=1
)

REM 安装前端依赖
echo.
if not exist "node_modules" (
    echo [安装] 前端依赖...
    npm install
) else (
    echo [OK] 前端依赖已安装
)

REM 启动后端（如果 Python 存在）
if "%BACKEND%"=="1" (
    echo.
    echo [启动] 后端服务...
    cd server
    
    if not exist "venv" (
        echo   创建虚拟环境...
        python -m venv venv
    )
    
    echo   激活虚拟环境...
    call venv\Scripts\activate.bat
    
    echo   安装依赖...
    pip install -q flask flask-cors werkzeug

    echo   添加 SKP 转换器 DLL 目录到环境变量...
    set SKP_DLL_DIR=%~dp0skp_converter_deploy
    set PATH=%SKP_DLL_DIR%;%PATH%
    
    echo   启动后端...
    start "后端服务" cmd /c "python app_skp_api.py"
    
    cd ..
    echo [OK] 后端已启动在 http://localhost:5000（含 SKP C API 转换支持）
    timeout /t 2 >nul
)

REM 启动前端
echo.
echo [启动] 前端服务...
start "前端服务" cmd /c "npm run dev"

echo.
echo ===================================
echo  服务启动成功！
echo ===================================
if "%BACKEND%"=="1" (
    echo 后端: http://localhost:5000
) else (
    echo 后端: 未启动（纯前端模式）
)
echo 前端: http://localhost:5173
echo.
echo 正在打开浏览器...
timeout /t 3 >nul
start http://localhost:5173

echo.
echo 提示: 关闭此窗口不会停止服务
echo       请手动关闭"后端服务"和"前端服务"窗口
echo.
pause
