@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

REM Always run from script directory
cd /d "%~dp0"

set FRONTEND_PORT=5174
set BACKEND_PORT=5000


echo ===================================
echo CAD Viewer - One Click Start
echo ===================================
echo Root: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 20+.
  pause
  exit /b 1
)

echo [OK] Node: 
node --version

echo.
where python >nul 2>&1
if errorlevel 1 (
  echo [WARN] Python not found. Backend will be skipped.
  set BACKEND=0
) else (
  echo [OK] Python:
  python --version
  set BACKEND=1
)

echo.
if not exist "node_modules" (
  echo [SETUP] Installing frontend dependencies...
  npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [OK] node_modules exists.
)

if "%BACKEND%"=="1" (
  echo.
  echo [START] Backend on port %BACKEND_PORT%...
  cd /d "%~dp0server"

  if not exist "venv" (
    echo [SETUP] Creating Python venv...
    python -m venv venv
    if errorlevel 1 (
      echo [ERROR] Failed to create venv.
      pause
      exit /b 1
    )
  )

  call venv\Scripts\activate.bat
  if errorlevel 1 (
    echo [ERROR] Failed to activate venv.
    pause
    exit /b 1
  )

  python -c "import flask, flask_cors, werkzeug" >nul 2>&1
  if errorlevel 1 (
    echo [WARN] backend dependencies missing in venv.
    echo [WARN] Run once: cd server ^&^& venv\\Scripts\\activate ^&^& pip install -r requirements.txt
  ) else (
    echo [OK] backend dependencies already installed.
  )

  set "SKP_DLL_DIR=%~dp0skp_converter_deploy"
  set "PATH=%SKP_DLL_DIR%;!PATH!"

  start "backend-%BACKEND_PORT%" cmd /k "cd /d %~dp0server && call venv\Scripts\activate.bat && set SKP_DLL_DIR=%~dp0skp_converter_deploy && set PATH=%SKP_DLL_DIR%;%%PATH%% && python app_skp_api.py"
  cd /d "%~dp0"
)

echo.
echo [START] Frontend on port %FRONTEND_PORT%...
start "frontend-%FRONTEND_PORT%" cmd /k "cd /d %~dp0 && npm run dev -- --port %FRONTEND_PORT%"

echo.
echo ===================================
echo Requested startup complete.
echo Frontend: http://localhost:%FRONTEND_PORT%
if "%BACKEND%"=="1" (
  echo Backend : http://localhost:%BACKEND_PORT%
) else (
  echo Backend : skipped (python not found)
)
echo ===================================

echo Opening browser in 3 seconds...
timeout /t 3 >nul
start http://localhost:%FRONTEND_PORT%

echo.
echo Note:
echo - Frontend/backend run in separate windows and stay open.
echo - If either fails, the error will stay visible in that window.
echo.
pause
