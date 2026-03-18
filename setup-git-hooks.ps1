# Setup Git hooks for automatic compilation
# Run this script to install pre-commit hook

$hookPath = ".git\hooks\pre-commit"

if (-not (Test-Path ".git")) {
    Write-Host "[ERROR] Not a git repository. Run 'git init' first." -ForegroundColor Red
    exit 1
}

$hookContent = @'#!/bin/sh
# Pre-commit hook: Build SKP Converter before commit
echo "[Git Hook] Checking SKP Converter changes..."

if git diff --cached --name-only | grep -q "server/skp_converter/.*\.\(cpp\|h\|cmake\)$"; then
    echo "[Git Hook] Source files changed. Auto-building..."
    
    cd server/skp_converter
    
    if [ ! -d "build" ]; then
        mkdir -p build
        cmake -B build -S . -G "Visual Studio 17 2022" -A x64 2>/dev/null || {
            echo "[Git Hook] CMake configuration failed. Please build manually first."
            exit 0  # Don't block commit, just warn
        }
    fi
    
    cmake --build build --config Release --parallel 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "[Git Hook] Build successful!"
        # Copy to deploy directory
        mkdir -p ../../skp_converter_deploy
        cp build/bin/Release/*.dll ../../skp_converter_deploy/ 2>/dev/null
    else
        echo "[Git Hook] Build failed! Please fix errors before committing."
        exit 1
    fi
fi

exit 0
'@

Write-Host "Installing Git pre-commit hook..." -ForegroundColor Cyan

# Create hooks directory if needed
New-Item -ItemType Directory -Force -Path ".git\hooks" | Out-Null

# Write hook file
$hookContent | Out-File -FilePath $hookPath -Encoding ASCII

# Make executable (for WSL/Git Bash)
if (Get-Command git -ErrorAction SilentlyContinue) {
    git update-index --chmod=+x $hookPath 2>$null
}

Write-Host "[OK] Pre-commit hook installed!" -ForegroundColor Green
Write-Host ""
Write-Host "The hook will:" -ForegroundColor Cyan
Write-Host "  - Detect changes to SKP converter source files"
Write-Host "  - Automatically build before commit"
Write-Host "  - Block commit if build fails"
Write-Host ""
Write-Host "To skip the hook (emergency only):" -ForegroundColor Yellow
Write-Host "  git commit --no-verify"
