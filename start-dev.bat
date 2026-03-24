@echo off
chcp 65001 >nul
echo ===================================
echo  建筑图纸浏览器 - 开发环境启动脚本
echo ===================================
echo.

REM 检查 Node.js
echo [1/3] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 20+
    pause
    exit /b 1
)
echo [OK] Node.js 已安装

REM 检查依赖
echo.
echo [2/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖，请稍候...
    npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo [OK] 依赖已安装
)

REM 启动开发服务器
echo.
echo [3/3] 启动开发服务器...
echo.
echo ===================================
echo  前端将运行在 http://localhost:5174
echo ===================================
echo.
echo 提示:
echo - 按 Ctrl+C 停止服务器
echo - 后端转换服务需要单独启动 (见 README.md)
echo.

npm run dev

pause
