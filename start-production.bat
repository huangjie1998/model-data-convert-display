@echo off
chcp 65001 >nul
echo ===================================
echo  建筑图纸浏览器 - 生产环境启动
echo ===================================
echo.

REM 检查 Node.js
echo [1/4] 检查 Node.js...
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
echo [2/4] 检查 Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python
    pause
    exit /b 1
)
echo [OK] Python: 
python --version

REM 安装/检查前端依赖
echo.
echo [3/4] 检查前端依赖...
if not exist "node_modules" (
    echo 正在安装前端依赖...
    npm install
) else (
    echo [OK] 前端依赖已安装
)

REM 构建前端
echo.
echo 正在构建前端生产版本...
npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)
echo [OK] 前端构建完成

REM 启动后端
echo.
echo [4/4] 启动后端服务...
cd server

if not exist "venv" (
    echo   创建 Python 虚拟环境...
    python -m venv venv
)

echo   激活虚拟环境...
call venv\Scripts\activate.bat

echo   安装后端依赖...
pip install -q flask==3.1.0 flask-cors==5.0.0 werkzeug==3.1.3 pypdf2==3.0.1

echo   启动完整版后端...
start "后端服务 (http://localhost:5000)" cmd /c "python app_full.py"

cd ..
echo [OK] 后端已启动

REM 启动前端服务
echo.
echo 启动前端服务...
start "前端服务 (http://localhost:5173)" cmd /c "npx serve -s dist -l 5173"

echo.
echo ===================================
echo  服务启动成功！
echo ===================================
echo.
echo 访问地址:
echo   - 前端: http://localhost:5173
echo   - 后端: http://localhost:5000
echo.
echo 功能说明:
echo   - 完整版后端（支持文件上传/下载/转换接口）
echo   - 生产环境构建的前端
echo   - 如需转换 SKP/DWG，请安装 ODAFileConverter
echo.
echo 正在打开浏览器...
timeout /t 3 >nul
start http://localhost:5173

echo.
echo 提示: 关闭弹出的命令窗口即可停止服务
echo.
pause
