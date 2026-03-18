# Docker 镜像加速配置脚本
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Docker 镜像加速配置" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host

$dockerConfigPath = "$env:USERPROFILE\.docker\daemon.json"

# 创建配置目录（如果不存在）
$configDir = Split-Path $dockerConfigPath -Parent
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# 镜像加速配置
$mirrorConfig = @{
    "registry-mirrors" = @(
        "https://docker.mirrors.ustc.edu.cn",
        "https://hub-mirror.c.163.com",
        "https://mirror.baidubce.com",
        "https://ccr.ccs.tencentyun.com"
    )
}

# 检查现有配置
if (Test-Path $dockerConfigPath) {
    Write-Host "发现现有 Docker 配置，正在合并..." -ForegroundColor Yellow
    try {
        $existingConfig = Get-Content $dockerConfigPath -Raw | ConvertFrom-Json
        # 合并配置
        $existingConfig | Add-Member -NotePropertyName "registry-mirrors" -NotePropertyValue $mirrorConfig."registry-mirrors" -Force
        $finalConfig = $existingConfig
    } catch {
        Write-Host "解析现有配置失败，将创建新配置" -ForegroundColor Red
        $finalConfig = $mirrorConfig
    }
} else {
    $finalConfig = $mirrorConfig
}

# 保存配置
$finalConfig | ConvertTo-Json -Depth 10 | Set-Content $dockerConfigPath

Write-Host "配置已保存到: $dockerConfigPath" -ForegroundColor Green
Write-Host
Write-Host "配置内容:" -ForegroundColor Yellow
Get-Content $dockerConfigPath | Write-Host
Write-Host
Write-Host "===================================" -ForegroundColor Green
Write-Host "配置完成！请重启 Docker Desktop:" -ForegroundColor Green
Write-Host "  1. 右键点击任务栏的 Docker 图标" -ForegroundColor White
Write-Host "  2. 选择 'Restart' 或 'Quit' 后重新启动" -ForegroundColor White
Write-Host "===================================" -ForegroundColor Green
