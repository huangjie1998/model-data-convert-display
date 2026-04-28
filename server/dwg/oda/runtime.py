from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Type


logger = logging.getLogger(__name__)


def resolve_oda_read_exe(core: object, env_path: str) -> Optional[str]:
    candidates: List[Tuple[Path, Optional[Path], str]] = []

    if env_path:
        candidate_path = Path(env_path)
        runtime_root = candidate_path.parent
        if runtime_root.name.lower() == "bin":
            runtime_root = runtime_root.parent
        candidates.append((candidate_path, runtime_root, "env:ODA_READ_EXE"))

    oda_runtime_root = os.environ.get("ODA_RUNTIME_ROOT", "").strip()
    if oda_runtime_root:
        root = Path(oda_runtime_root)
        candidates.extend(
            [
                (root / "bin" / "OdReadEx.exe", root, "env:ODA_RUNTIME_ROOT"),
                (root / "bin" / "OdReadEx", root, "env:ODA_RUNTIME_ROOT"),
                (root / "OdReadEx.exe", root, "env:ODA_RUNTIME_ROOT"),
                (root / "OdReadEx", root, "env:ODA_RUNTIME_ROOT"),
            ]
        )

    oda_vendor_root = getattr(core, "oda_vendor_root")
    vendor_root = oda_vendor_root / getattr(core, "oda_profile") / getattr(core, "oda_version")
    candidates.extend(
        [
            (vendor_root / "bin" / "OdReadEx.exe", vendor_root, "project_vendor"),
            (vendor_root / "bin" / "OdReadEx", vendor_root, "project_vendor"),
        ]
    )

    which_hit = shutil.which("OdReadEx")
    if which_hit:
        candidates.append((Path(which_hit), None, "system_path"))
    which_hit_exe = shutil.which("OdReadEx.exe")
    if which_hit_exe:
        candidates.append((Path(which_hit_exe), None, "system_path"))

    oda_sdk_root = os.environ.get("ODA_SDK_ROOT", "").strip()
    if oda_sdk_root:
        root = Path(oda_sdk_root)
        candidates.extend(
            [
                (root / "artifacts" / "win-x64" / "bin" / "OdReadEx.exe", root / "artifacts" / "win-x64", "env:ODA_SDK_ROOT"),
                (root / "artifacts" / "linux-x64" / "bin" / "OdReadEx", root / "artifacts" / "linux-x64", "env:ODA_SDK_ROOT"),
            ]
        )

    candidates.extend(
        [
            (Path(r"C:\development\oda\ConvertApp\lib\ODA\OdReadEx.exe"), Path(r"C:\development\oda\ConvertApp\lib\ODA"), "legacy_fallback"),
            (Path("/opt/oda/bin/OdReadEx"), Path("/opt/oda"), "legacy_fallback"),
        ]
    )

    for candidate, runtime_root, source in candidates:
        try:
            if candidate.exists():
                resolved = candidate.resolve()
                resolved_runtime_root = runtime_root.resolve() if runtime_root else resolved.parent
                setattr(core, "oda_runtime_root", str(resolved_runtime_root))
                setattr(core, "oda_resolve_source", source)
                try:
                    setattr(core, "oda_runtime_in_project", str(resolved).lower().startswith(str(oda_vendor_root).lower()))
                except Exception:
                    setattr(core, "oda_runtime_in_project", False)
                return str(resolved)
        except Exception:
            continue
    return None


def resolve_oda_vectorize_exe(core: object, env_path: str) -> Optional[str]:
    candidates: List[Tuple[Path, str]] = []

    if env_path:
        candidates.append((Path(env_path), "env:ODA_VECTORIZE_EXE"))

    oda_read_exe = getattr(core, "oda_read_exe", None)
    if oda_read_exe:
        read_path = Path(oda_read_exe)
        candidates.extend(
            [
                (read_path.with_name("OdVectorizeEx.exe"), "co_located_with_read"),
                (read_path.with_name("OdVectorizeEx"), "co_located_with_read"),
            ]
        )

    oda_runtime_root = getattr(core, "oda_runtime_root", None)
    if oda_runtime_root:
        root = Path(oda_runtime_root)
        candidates.extend(
            [
                (root / "bin" / "OdVectorizeEx.exe", "runtime_root"),
                (root / "bin" / "OdVectorizeEx", "runtime_root"),
                (root / "OdVectorizeEx.exe", "runtime_root"),
                (root / "OdVectorizeEx", "runtime_root"),
            ]
        )

    which_hit = shutil.which("OdVectorizeEx")
    if which_hit:
        candidates.append((Path(which_hit), "system_path"))
    which_hit_exe = shutil.which("OdVectorizeEx.exe")
    if which_hit_exe:
        candidates.append((Path(which_hit_exe), "system_path"))

    candidates.extend(
        [
            (Path(r"C:\development\oda\ConvertApp\lib\ODA\OdVectorizeEx.exe"), "legacy_fallback"),
            (Path("/opt/oda/bin/OdVectorizeEx"), "legacy_fallback"),
        ]
    )

    for candidate, source in candidates:
        try:
            if candidate.exists():
                resolved = candidate.resolve()
                setattr(core, "oda_vectorize_resolve_source", source)
                return str(resolved)
        except Exception:
            continue
    return None


def decode_oda_bytes(data: bytes) -> str:
    if not data:
        return ""
    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        try:
            return data.decode("utf-16")
        except Exception:
            pass
    for enc in ("utf-8", "gb18030", "gbk", "latin-1"):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode("utf-8", errors="replace")


def run_oda_read_dump(core: object, file_path: Path, error_cls: Type[RuntimeError]) -> str:
    oda_read_exe = getattr(core, "oda_read_exe", None)
    if not oda_read_exe:
        raise error_cls("OdReadEx executable is not configured/found")

    exe_path = Path(oda_read_exe)
    env = os.environ.copy()
    exe_dir = str(exe_path.parent)
    env["PATH"] = exe_dir + os.pathsep + env.get("PATH", "")

    target_file = str(file_path.resolve())
    cmd = [str(exe_path), target_file, "DO"]
    file_size_mb = 0.0
    try:
        file_size_mb = file_path.stat().st_size / (1024.0 * 1024.0)
    except Exception:
        file_size_mb = 0.0

    base_timeout = getattr(core, "oda_timeout_sec")
    oda_large_file_mb = getattr(core, "oda_large_file_mb")
    oda_large_file_timeout_sec = getattr(core, "oda_large_file_timeout_sec")
    if file_size_mb >= oda_large_file_mb:
        base_timeout = max(base_timeout, oda_large_file_timeout_sec)
        if base_timeout > getattr(core, "oda_timeout_sec"):
            logger.info(
                "OdReadEx large file timeout profile enabled: %.1fMB >= %.1fMB, timeout %.1fs -> %.1fs",
                file_size_mb,
                oda_large_file_mb,
                getattr(core, "oda_timeout_sec"),
                base_timeout,
            )

    proc: Optional[subprocess.CompletedProcess[bytes]] = None
    with getattr(core, "_oda_read_lock"):
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=base_timeout,
                env=env,
                cwd=exe_dir,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise error_cls(
                f"OdReadEx timed out after {base_timeout:.1f}s for {file_path.name}. "
                f"Try increasing DWG_ODA_TIMEOUT_SEC."
            ) from exc
        except Exception as exc:
            raise error_cls(f"failed to launch OdReadEx: {exc}") from exc

    if proc is None:
        raise error_cls(f"OdReadEx failed to run for {file_path.name}")

    stdout_text = decode_oda_bytes(proc.stdout or b"")
    stderr_text = decode_oda_bytes(proc.stderr or b"")
    if proc.returncode != 0:
        detail = stderr_text.strip() or stdout_text[:3000].strip()
        raise error_cls(f"OdReadEx failed (code={proc.returncode}): {detail}")

    if "Can't open file:" in stdout_text:
        raise error_cls(stdout_text.strip())

    if not stdout_text.strip():
        raise error_cls("OdReadEx returned empty output")
    return stdout_text


def is_oda_vectorize_available(core: object) -> bool:
    if not getattr(core, "enable_shx_outline", False) or not getattr(core, "enable_shx_outline_oda", False):
        return False
    oda_vectorize_exe = getattr(core, "oda_vectorize_exe", None)
    if not oda_vectorize_exe:
        return False
    try:
        return Path(oda_vectorize_exe).exists()
    except Exception:
        return False


def run_oda_vectorize_dump(core: object, file_path: Path, error_cls: Type[RuntimeError]) -> str:
    oda_vectorize_exe = getattr(core, "oda_vectorize_exe", None)
    if not oda_vectorize_exe:
        raise error_cls("OdVectorizeEx executable is not configured/found")

    exe_path = Path(oda_vectorize_exe)
    env = os.environ.copy()
    exe_dir = str(exe_path.parent)
    env["PATH"] = exe_dir + os.pathsep + env.get("PATH", "")

    target_file = str(file_path.resolve())
    cmd = [str(exe_path), target_file]
    oda_timeout_sec = getattr(core, "oda_timeout_sec")
    try:
        with getattr(core, "_oda_vectorize_lock"):
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=oda_timeout_sec,
                env=env,
                cwd=exe_dir,
                check=False,
            )
    except subprocess.TimeoutExpired as exc:
        raise error_cls(f"OdVectorizeEx timed out after {oda_timeout_sec:.1f}s for {file_path.name}") from exc
    except Exception as exc:
        raise error_cls(f"failed to launch OdVectorizeEx: {exc}") from exc

    stdout_text = decode_oda_bytes(proc.stdout or b"")
    stderr_text = decode_oda_bytes(proc.stderr or b"")
    if proc.returncode != 0:
        detail = stderr_text.strip() or stdout_text[:3000].strip()
        raise error_cls(f"OdVectorizeEx failed (code={proc.returncode}): {detail}")

    if "Can't open file:" in stdout_text:
        raise error_cls(stdout_text.strip())

    if not stdout_text.strip():
        raise error_cls("OdVectorizeEx returned empty output")
    return stdout_text


def vectorize_cache_key(file_path: Path) -> str:
    p = file_path.resolve()
    try:
        stat = p.stat()
        return f"{p}|{int(stat.st_size)}|{int(getattr(stat, 'st_mtime_ns', int(stat.st_mtime * 1e9)))}"
    except Exception:
        return str(p)


def vectorize_cache_get(core: object, cache_key: str) -> Optional[Dict[str, List[Dict[str, object]]]]:
    hit = getattr(core, "_vectorize_text_cache").get(cache_key)
    if hit is None:
        return None
    try:
        getattr(core, "_vectorize_cache_order").remove(cache_key)
    except ValueError:
        pass
    getattr(core, "_vectorize_cache_order").append(cache_key)
    return hit


def vectorize_cache_put(core: object, cache_key: str, data: Dict[str, List[Dict[str, object]]]) -> None:
    getattr(core, "_vectorize_text_cache")[cache_key] = data
    try:
        getattr(core, "_vectorize_cache_order").remove(cache_key)
    except ValueError:
        pass
    getattr(core, "_vectorize_cache_order").append(cache_key)
    while len(getattr(core, "_vectorize_cache_order")) > getattr(core, "vectorize_cache_capacity"):
        stale = getattr(core, "_vectorize_cache_order").pop(0)
        getattr(core, "_vectorize_text_cache").pop(stale, None)
