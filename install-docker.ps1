# Docker Desktop 安装脚本
$dockerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
$installerPath = "$env:TEMP\DockerDesktopInstaller.exe"

Write-Host "正在下载 Docker Desktop..." -ForegroundColor Green
Write-Host "文件较大（约 500MB），请耐心等待..." -ForegroundColor Yellow

try {
    Invoke-WebRequest -Uri $dockerUrl -OutFile $installerPath -TimeoutSec 600
    Write-Host "下载完成！" -ForegroundColor Green
    
    Write-Host "正在安装 Docker Desktop..." -ForegroundColor Green
    Start-Process -FilePath $installerPath -ArgumentList "install", "--quiet" -Wait
    
    Write-Host "安装完成！" -ForegroundColor Green
    Write-Host "请重启电脑，然后运行 'docker --version' 验证安装" -ForegroundColor Yellow
    
    # 清理
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "下载失败，请手动访问 https://www.docker.com/products/docker-desktop/ 下载" -ForegroundColor Red
}
