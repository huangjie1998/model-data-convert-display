# 下载并安�?Python 3.11.9
$pythonUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
$installerPath = "$env:TEMP\python-3.11.9-amd64.exe"

Write-Host "正在下载 Python 3.11.9..." -ForegroundColor Green
Invoke-WebRequest -Uri $pythonUrl -OutFile $installerPath

Write-Host "正在安装 Python 3.11.9..." -ForegroundColor Green
# 安装�?C:\Python311，并添加�?PATH
Start-Process -FilePath $installerPath -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1", "TargetDir=C:\Python311" -Wait

Write-Host "安装完成�? -ForegroundColor Green"
Write-Host "请关闭并重新打开命令行窗口，然后运行:" -ForegroundColor Yellow
Write-Host "C:\Python311\python --version"    -ForegroundColor Cyan

# 清理
Remove-Item $installerPath -Force
