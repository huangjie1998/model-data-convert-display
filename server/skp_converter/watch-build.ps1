# SKP Converter - Auto Build on File Change
# Usage: .\watch-build.ps1
# This script monitors source files and automatically rebuilds when changes are detected

param(
    [string]$Configuration = "Release",
    [int]$Interval = 2  # Check interval in seconds
)

$ErrorActionPreference = "Continue"

# Colors
$Green = "Green"
$Yellow = "Yellow"
$Cyan = "Cyan"
$Red = "Red"

Write-Host "===================================" -ForegroundColor $Cyan
Write-Host "  SKP Converter - Auto Build Watch" -ForegroundColor $Cyan
Write-Host "===================================" -ForegroundColor $Cyan
Write-Host ""
Write-Host "Configuration: $Configuration" -ForegroundColor $Yellow
Write-Host "Watch interval: ${Interval}s" -ForegroundColor $Yellow
Write-Host ""
Write-Host "Monitoring files:" -ForegroundColor $Cyan
Write-Host "  - skp_to_gltf.cpp"
Write-Host "  - skp_to_gltf.h"
Write-Host "  - CMakeLists.txt"
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor $Yellow
Write-Host "===================================" -ForegroundColor $Cyan
Write-Host ""

# Files to watch
$WatchFiles = @(
    "skp_to_gltf.cpp",
    "skp_to_gltf.h",
    "CMakeLists.txt"
)

# Store last modified times
$LastModified = @{}

function Get-FileHash {
    param([string]$Path)
    if (Test-Path $Path) {
        return (Get-Item $Path).LastWriteTime.ToString()
    }
    return $null
}

function Initialize-Watch {
    foreach ($file in $WatchFiles) {
        $LastModified[$file] = Get-FileHash $file
    }
}

function Test-Changes {
    $changed = $false
    $changedFiles = @()
    
    foreach ($file in $WatchFiles) {
        $current = Get-FileHash $file
        if ($current -ne $LastModified[$file]) {
            $changed = $true
            $changedFiles += $file
            $LastModified[$file] = $current
        }
    }
    
    return $changed, $changedFiles
}

function Invoke-Build {
    param([string]$Config)
    
    Write-Host ""
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting build..." -ForegroundColor $Cyan
    
    # Ensure build directory exists
    if (-not (Test-Path "build")) {
        Write-Host "  Creating build directory..." -ForegroundColor $Yellow
        New-Item -ItemType Directory -Force -Path "build" | Out-Null
        
        # First time configuration
        Write-Host "  Configuring CMake..." -ForegroundColor $Yellow
        $configOutput = cmake -B build -S . -G "Visual Studio 17 2022" -A x64 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Configuration FAILED!" -ForegroundColor $Red
            Write-Host $configOutput
            return $false
        }
    }
    
    # Build
    Write-Host "  Building $Config..." -ForegroundColor $Yellow
    $buildOutput = cmake --build build --config $Config --parallel 2>&1
    $success = $LASTEXITCODE -eq 0
    
    if ($success) {
        Write-Host "  Build SUCCESS!" -ForegroundColor $Green
        
        # Deploy
        Write-Host "  Deploying files..." -ForegroundColor $Yellow
        $deployDir = "..\..\skp_converter_deploy"
        New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
        
        $files = @(
            "build\bin\$Config\skp_converter.dll",
            "build\bin\$Config\SketchUpAPI.dll"
        )
        
        foreach ($file in $files) {
            if (Test-Path $file) {
                Copy-Item -Path $file -Destination $deployDir -Force
                Write-Host "    - $(Split-Path $file -Leaf)" -ForegroundColor $Green
            }
        }
        
        Write-Host "  Deployed to: $deployDir" -ForegroundColor $Green
    } else {
        Write-Host "  Build FAILED!" -ForegroundColor $Red
        Write-Host $buildOutput
    }
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Build completed" -ForegroundColor $Cyan
    Write-Host ""
    Write-Host "Waiting for changes... (Press Ctrl+C to stop)" -ForegroundColor $Yellow
    
    return $success
}

# Initial build
Initialize-Watch
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Performing initial build..." -ForegroundColor $Cyan
Invoke-Build -Config $Configuration

# Watch loop
try {
    while ($true) {
        Start-Sleep -Seconds $Interval
        
        $hasChanges, $changedFiles = Test-Changes
        
        if ($hasChanges) {
            Write-Host ""
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Changes detected in:" -ForegroundColor $Yellow
            foreach ($file in $changedFiles) {
                Write-Host "  - $file" -ForegroundColor $Yellow
            }
            
            Invoke-Build -Config $Configuration
        }
    }
} catch {
    # Handle Ctrl+C gracefully
    if ($_.Exception.Message -like "*Ctrl*" -or $_.Exception.Message -like "*break*") {
        Write-Host ""
        Write-Host "===================================" -ForegroundColor $Yellow
        Write-Host "  Watch stopped by user" -ForegroundColor $Yellow
        Write-Host "===================================" -ForegroundColor $Yellow
    } else {
        Write-Host ""
        Write-Host "ERROR: $_" -ForegroundColor $Red
    }
}
