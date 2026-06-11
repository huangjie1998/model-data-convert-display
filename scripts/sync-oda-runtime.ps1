param(
    [string]$SourceRoot = "C:\development\oda\ConvertApp\lib\ODA",
    [string]$TargetRoot = "",
    [string]$Profile = "win-x64",
    [string]$Version = "2026.03.25-v1",
    [switch]$Clean,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-AbsolutePath {
    param([string]$PathValue)
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }
    try {
        return (Resolve-Path -Path $PathValue).Path
    } catch {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
}

function Ensure-Directory {
    param([string]$PathValue)
    if (-not (Test-Path -Path $PathValue)) {
        New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
    }
}

if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
    $projectRoot = Resolve-AbsolutePath (Join-Path $PSScriptRoot "..")
    $TargetRoot = Join-Path $projectRoot "server\vendor\oda\$Profile\$Version"
}

$SourceRoot = Resolve-AbsolutePath $SourceRoot
$TargetRoot = Resolve-AbsolutePath $TargetRoot
$TargetBin = Join-Path $TargetRoot "bin"
$ManifestPath = Join-Path $TargetRoot "manifest.json"

if (-not (Test-Path -Path $SourceRoot)) {
    throw "SourceRoot not found: $SourceRoot"
}

Ensure-Directory $TargetRoot
Ensure-Directory $TargetBin

if ($Clean) {
    Write-Host "[clean] Removing old files in $TargetBin"
    Get-ChildItem -Path $TargetBin -File -ErrorAction SilentlyContinue | Remove-Item -Force
}

$allFiles = Get-ChildItem -Path $SourceRoot -File
$selected = @()
foreach ($file in $allFiles) {
    $name = $file.Name
    $ext = $file.Extension.ToLowerInvariant()
    if ($name -ieq "OdReadEx.exe" -or
        $name -ieq "OdVectorizeEx.exe" -or
        $ext -eq ".manifest" -or
        $ext -eq ".dll" -or
        $ext -eq ".tx") {
        $selected += $file
    }
}

if ($selected.Count -eq 0) {
    throw "No runtime files selected from source: $SourceRoot"
}

Write-Host "[info] Source : $SourceRoot"
Write-Host "[info] Target : $TargetBin"
Write-Host "[info] Files  : $($selected.Count)"

if (-not $DryRun) {
    foreach ($file in $selected) {
        $dest = Join-Path $TargetBin $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }
}

$manifestFiles = @()
foreach ($file in (Get-ChildItem -Path $TargetBin -File | Sort-Object Name)) {
    $hash = if ($DryRun) { "" } else { (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    $manifestFiles += @{
        name = $file.Name
        size = [int64]$file.Length
        sha256 = $hash
    }
}

$manifest = [ordered]@{
    profile = $Profile
    version = $Version
    generated_at = (Get-Date).ToString("o")
    source_root = $SourceRoot
    target_root = $TargetRoot
    runtime_entry = "bin/OdReadEx.exe"
    file_count = $manifestFiles.Count
    files = $manifestFiles
}

if (-not $DryRun) {
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $ManifestPath -Encoding UTF8
    Write-Host "[ok] Wrote manifest: $ManifestPath"
} else {
    Write-Host "[dry-run] Manifest preview:"
    $manifest | ConvertTo-Json -Depth 3
}

Write-Host "[done] ODA runtime sync complete."
