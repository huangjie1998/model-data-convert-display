# 检查 Docker 安装和状态
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Docker 环境检查脚本" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host

# 常见的 Docker 安装路径
$dockerPaths = @(
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe",
    "C:\ProgramData\DockerDesktop\version-bin\docker.exe",
    "$env:LOCALAPPDATA\Programs\Docker\Docker\resources\bin\docker.exe",
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
)

Write-Host "[1/3] 查找 Docker 安装位置..." -ForegroundColor Yellow
$dockerFound = $false
$dockerPath = $null

foreach ($path in $dockerPaths) {
    if (Test-Path $path) {
        Write-Host "  找到 Docker: $path" -ForegroundColor Green
        $dockerFound = $true
        $dockerPath = $path
        break
    }
}

if (-not $dockerFound) {
    Write-Host "  在常见位置未找到 Docker" -ForegroundColor Red
    Write-Host "  尝试使用 where 命令查找..." -ForegroundColor Yellow
    
    $whereResult = Get-Command docker -ErrorAction SilentlyContinue
    if ($whereResult) {
        Write-Host "  找到 Docker: $($whereResult.Source)" -ForegroundColor Green
        $dockerFound = $true
        $dockerPath = $whereResult.Source
    }
}

if (-not $dockerFound) {
    Write-Host
    Write-Host "[错误] 未找到 Docker 安装！" -ForegroundColor Red
    Write-Host "请确认 Docker Desktop 已安装。" -ForegroundColor Yellow
    Write-Host "下载地址: https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    exit 1
}

# 检查 Docker 是否运行
Write-Host
Write-Host "[2/3] 检查 Docker 服务状态..." -ForegroundColor Yellow
try {
    $env:Path += ";$(Split-Path $dockerPath)"
    $dockerVersion = & $dockerPath --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Docker 版本: $dockerVersion" -ForegroundColor Green
        
        # 检查 docker compose
        $composeVersion = & $dockerPath compose version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Docker Compose: $composeVersion" -ForegroundColor Green
        }
    } else {
        throw "Docker 命令执行失败"
    }
} catch {
    Write-Host "  Docker 未运行或无法访问" -ForegroundColor Red
    Write-Host
    Write-Host "[3/3] 尝试启动 Docker Desktop..." -ForegroundColor Yellow
    
    # 尝试启动 Docker Desktop
    $dockerDesktopPaths = @(
        "C:\Program Files\Docker\Docker\Docker Desktop.exe",
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    )
    
    $started = $false
    foreach ($ddPath in $dockerDesktopPaths) {
        if (Test-Path $ddPath) {
            Write-Host "  启动 Docker Desktop: $ddPath" -ForegroundColor Cyan
            Start-Process $ddPath
            $started = $true
            break
        }
    }
    
    if ($started) {
        Write-Host
        Write-Host "===================================" -ForegroundColor Green
        Write-Host "Docker Desktop 正在启动..." -ForegroundColor Green
        Write-Host "请等待 Docker 完全启动后再运行 docker-compose" -ForegroundColor Yellow
        Write-Host "===================================" -ForegroundColor Green
    } else {
        Write-Host "  未找到 Docker Desktop.exe" -ForegroundColor Red
    }
    exit 1
}

Write-Host
Write-Host "===================================" -ForegroundColor Green
Write-Host "Docker 环境正常！" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host
Write-Host "你现在可以运行:" -ForegroundColor Cyan
Write-Host "  docker-compose up -d" -ForegroundColor White
