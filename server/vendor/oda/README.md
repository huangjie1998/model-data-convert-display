# ODA Runtime Vendor Layout

This directory stores project-managed ODA runtime binaries used by the DWG direct-view backend.

## Layout

- `win-x64/<version>/bin/`:
  Windows runtime files for `OdReadEx.exe`.
- `win-x64/<version>/manifest.json`:
  Runtime file manifest (name, size, sha256).
- `linux-x64/<version>/bin/`:
  Placeholder for Linux runtime packaging.

## Populate Windows Runtime

Run from project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-oda-runtime.ps1
```

Optional:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-oda-runtime.ps1 -Clean
```

The sync script copies only runtime-required files (`OdReadEx.exe`, `*.dll`, `*.tx`, manifests) into `win-x64/<version>/bin`.
