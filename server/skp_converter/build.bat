@echo off
chcp 65001 >nul
echo ===================================
echo  SKP Converter - Build Script
echo ===================================
echo.

REM Check for Visual Studio
set VS_PATH=
for /f "delims=" %%i in ('"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath 2^>nul') do set VS_PATH=%%i

if "%VS_PATH%"=="" (
    echo [ERROR] Visual Studio not found!
    echo Please install Visual Studio 2019 or later with C++ support.
    pause
    exit /b 1
)

echo [OK] Found Visual Studio at: %VS_PATH%

REM Check for CMake
where cmake >nul 2>&1
if errorlevel 1 (
    echo [ERROR] CMake not found!
    echo Please install CMake and add it to PATH.
    pause
    exit /b 1
)

echo [OK] CMake found
cmake --version

REM Create build directory
if not exist "build" mkdir build
cd build

echo.
echo [1/3] Generating Visual Studio project...
cmake .. -G "Visual Studio 17 2022" -A x64
if errorlevel 1 (
    echo [ERROR] CMake generation failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Building Release version...
cmake --build . --config Release
if errorlevel 1 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Copying files to output directory...
if not exist "..\..\skp_converter_deploy" mkdir ..\..\skp_converter_deploy
copy /Y "bin\Release\skp_converter.dll" "..\..\skp_converter_deploy\"
copy /Y "bin\Release\skp_converter.lib" "..\..\skp_converter_deploy\"
copy /Y "bin\Release\SketchUpAPI.dll" "..\..\skp_converter_deploy\"
if exist "bin\Release\test_converter.exe" (
    copy /Y "bin\Release\test_converter.exe" "..\..\skp_converter_deploy\"
)

echo.
echo ===================================
echo  Build Completed Successfully!
echo ===================================
echo.
echo Output files:
echo   - skp_converter_deploy\skp_converter.dll
echo   - skp_converter_deploy\SketchUpAPI.dll
echo   - skp_converter_deploy\test_converter.exe
echo.
pause
