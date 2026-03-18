# SKP Converter - PowerShell Build Script
# Usage: .\build.ps1 [-Clean] [-Rebuild] [-Test]

param(
    [switch]$Clean,
    [switch]$Rebuild,
    [switch]$Test,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  SKP Converter - Build Script" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Colors
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

# Check prerequisites
function Test-Prerequisites {
    Write-Host "[1/4] Checking prerequisites..." -ForegroundColor $Cyan
    
    # Check CMake
    $cmake = Get-Command cmake -ErrorAction SilentlyContinue
    if (-not $cmake) {
        Write-Host "[ERROR] CMake not found!" -ForegroundColor $Red
        Write-Host "Please install CMake from https://cmake.org/download/"
        exit 1
    }
    Write-Host "  [OK] CMake: " -NoNewline
    cmake --version | Select-Object -First 1
    
    # Check Visual Studio
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vsWhere)) {
        Write-Host "[ERROR] Visual Studio not found!" -ForegroundColor $Red
        Write-Host "Please install Visual Studio 2019 or later with C++ workload"
        exit 1
    }
    
    $vsPath = & $vsWhere -latest -property installationPath
    Write-Host "  [OK] Visual Studio: $vsPath"
    
    # Check SDK
    $sdkPath = "SDK_WIN_x64_2026-1-103"
    if (-not (Test-Path $sdkPath)) {
        Write-Host "[ERROR] SketchUp SDK not found at $sdkPath" -ForegroundColor $Red
        exit 1
    }
    Write-Host "  [OK] SketchUp SDK: $sdkPath"
    
    Write-Host ""
}

# Clean build directory
function Clear-Build {
    Write-Host "[Clean] Removing build directory..." -ForegroundColor $Yellow
    if (Test-Path "build") {
        Remove-Item -Recurse -Force "build"
        Write-Host "  [OK] Build directory removed"
    }
    if (Test-Path "..\..\skp_converter_deploy") {
        Remove-Item -Recurse -Force "..\..\skp_converter_deploy"
        Write-Host "  [OK] Deploy directory removed"
    }
}

# Build function
function Invoke-Build {
    param([string]$Config)
    
    Write-Host "[2/4] Generating project files..." -ForegroundColor $Cyan
    
    New-Item -ItemType Directory -Force -Path "build" | Out-Null
    Set-Location "build"
    
    # Generate
    $generateOutput = cmake .. -G "Visual Studio 17 2022" -A x64 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] CMake generation failed!" -ForegroundColor $Red
        Write-Host $generateOutput
        exit 1
    }
    Write-Host "  [OK] Project files generated"
    
    Write-Host ""
    Write-Host "[3/4] Building $Config configuration..." -ForegroundColor $Cyan
    
    # Build
    $buildOutput = cmake --build . --config $Config --parallel 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Build failed!" -ForegroundColor $Red
        Write-Host $buildOutput
        exit 1
    }
    Write-Host "  [OK] Build completed"
    
    Set-Location ".."
}

# Deploy function
function Invoke-Deploy {
    param([string]$Config)
    
    Write-Host ""
    Write-Host "[4/4] Deploying files..." -ForegroundColor $Cyan
    
    $deployDir = "..\..\skp_converter_deploy"
    New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
    
    $files = @(
        "build\bin\$Config\skp_converter.dll",
        "build\bin\$Config\SketchUpAPI.dll",
        "build\lib\$Config\skp_converter.lib"
    )
    
    foreach ($file in $files) {
        if (Test-Path $file) {
            Copy-Item -Path $file -Destination $deployDir -Force
            Write-Host "  [OK] $(Split-Path $file -Leaf)"
        } else {
            Write-Host "  [WARN] $(Split-Path $file -Leaf) not found" -ForegroundColor $Yellow
        }
    }
    
    # Copy test executable if exists
    $testExe = "build\bin\$Config\test_converter.exe"
    if (Test-Path $testExe) {
        Copy-Item -Path $testExe -Destination $deployDir -Force
        Write-Host "  [OK] test_converter.exe"
    }
    
    # Copy Python test script
    if (Test-Path "test_dll.py") {
        Copy-Item -Path "test_dll.py" -Destination $deployDir -Force
        Write-Host "  [OK] test_dll.py"
    }
}

# Test function
function Invoke-Test {
    Write-Host ""
    Write-Host "[Test] Running tests..." -ForegroundColor $Cyan
    
    $deployDir = "..\..\skp_converter_deploy"
    if (-not (Test-Path $deployDir)) {
        Write-Host "  [ERROR] Deploy directory not found. Build first." -ForegroundColor $Red
        return
    }
    
    Set-Location $deployDir
    
    # Test DLL loading
    Write-Host "  Testing DLL loading..."
    python -c "import ctypes; dll = ctypes.CDLL('./skp_converter.dll'); print('  [OK] DLL loaded')" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] Python DLL test failed (may need Python installed)" -ForegroundColor $Yellow
    }
    
    Set-Location "..\server\skp_converter"
}

# Main execution
try {
    if ($Clean) {
        Clear-Build
        exit 0
    }
    
    if ($Rebuild) {
        Clear-Build
    }
    
    Test-Prerequisites
    Invoke-Build -Config $Configuration
    Invoke-Deploy -Config $Configuration
    
    if ($Test) {
        Invoke-Test
    }
    
    Write-Host ""
    Write-Host "===================================" -ForegroundColor Green
    Write-Host "  Build Completed Successfully!" -ForegroundColor Green
    Write-Host "===================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output files in: skp_converter_deploy\" -ForegroundColor $Cyan
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "[ERROR] Build failed: $_" -ForegroundColor Red
    exit 1
}
