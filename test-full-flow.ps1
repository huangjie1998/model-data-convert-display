#!/usr/bin/env pwsh
# 完整流程测试脚本

$ErrorActionPreference = "Continue"

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  建筑图纸浏览器 - 完整流程测试" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

$FrontEndUrl = "http://localhost:5173"
$BackEndUrl = "http://localhost:5000"

# 测试 1: 前端服务
Write-Host "[1/4] 检查前端服务..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $FrontEndUrl -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "  [OK] 前端服务正常 ($FrontEndUrl)" -ForegroundColor Green
    }
} catch {
    Write-Host "  [ERROR] 前端服务无法访问" -ForegroundColor Red
}

Write-Host ""

# 测试 2: 后端服务
Write-Host "[2/4] 检查后端服务..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BackEndUrl/api/health" -TimeoutSec 5
    Write-Host "  [OK] 后端服务正常" -ForegroundColor Green
    Write-Host "      Service: $($response.service)" -ForegroundColor Gray
    Write-Host "      SKP API: $($response.skp_api_available)" -ForegroundColor Gray
} catch {
    Write-Host "  [ERROR] 后端服务无法访问" -ForegroundColor Red
}

Write-Host ""

# 测试 3: 转换工具状态
Write-Host "[3/4] 检查转换工具..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BackEndUrl/api/converters/status" -TimeoutSec 5
    Write-Host "  [OK] 转换工具状态获取成功" -ForegroundColor Green
    
    if ($response.skp_api.available) {
        Write-Host "      SKP API: 可用" -ForegroundColor Green
    } else {
        Write-Host "      SKP API: 不可用" -ForegroundColor Red
    }
} catch {
    Write-Host "  [ERROR] 无法获取转换工具状态" -ForegroundColor Red
}

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  测试完成" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "打开浏览器访问: http://localhost:5173" -ForegroundColor Green
Write-Host ""
