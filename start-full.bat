@echo off
chcp 65001 >nul
echo ===================================
echo  建筑图纸浏览器 - 完整版启动脚本
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
echo [OK] Node.js 已安装

REM 检查 Python
echo.
echo [检查] Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python
    pause
    exit /b 1
)
echo [OK] Python 已安装
python --version

REM 安装前端依赖
echo.
if not exist "node_modules" (
    echo [安装] 前端依赖...
    npm install
) else (
    echo [OK] 前端依赖已安装
)

REM 启动后端
echo.
echo [启动] 后端服务（完整版）...
cd server

if not exist "venv" (
    echo   创建虚拟环境...
    python -m venv venv
)

echo   激活虚拟环境...
call venv\Scripts\activate.bat

echo   安装/更新依赖...
pip install -q flask==3.1.0 flask-cors==5.0.0 werkzeug==3.1.3 pypdf2==3.0.1

echo   启动后端...
start "后端服务" cmd /c "python app_full.py"

cd ..
echo [OK] 后端已启动在 http://localhost:5000
timeout /t 2 >nul

REM 启动前端
echo.
echo [启动] 前端服务...
start "前端服务" cmd /c "npm run dev"

echo.
echo ===================================
echo  服务启动成功！
echo ===================================
echo 后端: http://localhost:5000
echo 前端: http://localhost:5174
echo.
echo 提示:
echo - 后端是完整版，支持 SKP/DWG 转换（如果安装了转换工具）
echo - 如果没有安装 ODAFileConverter 等工具，会自动提示手动转换
echo.
echo 正在打开浏览器...
timeout /t 3 >nul
start http://localhost:5174

echo.
echo 按任意键关闭所有服务...
pause

echo 正在停止服务...
taskkill /FI "WINDOWTITLE eq 后端服务*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq 前端服务*" /F >nul 2>&1
echo 已停止
timeout /t 2 >nul
