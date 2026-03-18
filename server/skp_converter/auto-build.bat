@echo off
chcp 65001 >nul
echo ===================================
echo  SKP Converter - Auto Build Mode
echo ===================================
echo.
echo This will automatically rebuild when source files change.
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell not found!
    pause
    exit /b 1
)

REM Run the watch script
echo Starting file watcher...
echo Press Ctrl+C to stop
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0watch-build.ps1" %*

echo.
echo Auto build stopped.
pause
