#!/usr/bin/env python3
"""DWG direct-view service core.

This module provides a stable session API with three engine modes:
- stub: deterministic local data for end-to-end API wiring.
- oda_cli: real DWG parsing by invoking local ODA `OdReadEx`.
- external_http: proxy to a remote ODA-backed service over HTTP.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request


def _point_distance(a: Dict[str, float], b: Dict[str, float]) -> float:
    return math.hypot(float(a["x"]) - float(b["x"]), float(a["y"]) - float(b["y"]))


def _distance_to_segment(
    p: Dict[str, float], a: Dict[str, float], b: Dict[str, float]
) -> Tuple[float, Dict[str, float], float]:
    """Return (distance, closest_point, t)."""
    ax = float(a["x"])
    ay = float(a["y"])
    bx = float(b["x"])
    by = float(b["y"])
    px = float(p["x"])
    py = float(p["y"])

    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab2 = abx * abx + aby * aby
    if ab2 <= 1e-12:
        cp = {"x": ax, "y": ay, "z": 0.0}
        return math.hypot(px - ax, py - ay), cp, 0.0

    t = (apx * abx + apy * aby) / ab2
    t = max(0.0, min(1.0, t))
    cx = ax + abx * t
    cy = ay + aby * t
    cp = {"x": cx, "y": cy, "z": 0.0}
    return math.hypot(px - cx, py - cy), cp, t


def _angle_deg(a: Dict[str, float], v: Dict[str, float], b: Dict[str, float]) -> Optional[float]:
    """Angle AVB in degrees."""
    v1x = float(a["x"]) - float(v["x"])
    v1y = float(a["y"]) - float(v["y"])
    v2x = float(b["x"]) - float(v["x"])
    v2y = float(b["y"]) - float(v["y"])
    n1 = math.hypot(v1x, v1y)
    n2 = math.hypot(v2x, v2y)
    if n1 <= 1e-12 or n2 <= 1e-12:
        return None
    dot = (v1x * v2x + v1y * v2y) / (n1 * n2)
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def _normalize_angle_deg(v: float) -> float:
    return (float(v) % 360.0 + 360.0) % 360.0


def _is_angle_on_arc(angle: float, start: float, end: float) -> bool:
    """Check if angle is within CCW arc [start -> end], handling wrap-around."""
    a = _normalize_angle_deg(angle)
    s = _normalize_angle_deg(start)
    e = _normalize_angle_deg(end)
    if s <= e:
        return s - 1e-9 <= a <= e + 1e-9
    return a >= s - 1e-9 or a <= e + 1e-9


def _point_angle_from_center(center: Dict[str, float], p: Dict[str, float]) -> float:
    return _normalize_angle_deg(math.degrees(math.atan2(float(p["y"]) - float(center["y"]), float(p["x"]) - float(center["x"]))))


def _bbox_from_points(points: List[Dict[str, float]]) -> Optional[Dict[str, Dict[str, float]]]:
    if not points:
        return None
    xs = [float(p["x"]) for p in points]
    ys = [float(p["y"]) for p in points]
    zs = [float(p.get("z", 0.0)) for p in points]
    return {
        "min": {"x": min(xs), "y": min(ys), "z": min(zs)},
        "max": {"x": max(xs), "y": max(ys), "z": max(zs)},
    }


def _line_segment_from_bbox(
    origin: Dict[str, float],
    u_axis: Dict[str, float],
    bmin: Dict[str, float],
    bmax: Dict[str, float],
) -> Optional[Tuple[Dict[str, float], Dict[str, float]]]:
    """Infer segment endpoints from line origin+direction clipped by AABB."""
    ox = float(origin["x"])
    oy = float(origin["y"])
    oz = float(origin.get("z", 0.0))

    ux = float(u_axis["x"])
    uy = float(u_axis["y"])
    norm = math.hypot(ux, uy)
    if norm <= 1e-12:
        return None
    ux /= norm
    uy /= norm

    intervals: List[Tuple[float, float]] = []
    for o, u, mn, mx in (
        (ox, ux, float(bmin["x"]), float(bmax["x"])),
        (oy, uy, float(bmin["y"]), float(bmax["y"])),
    ):
        if abs(u) <= 1e-12:
            if o < mn - 1e-9 or o > mx + 1e-9:
                return None
            intervals.append((-float("inf"), float("inf")))
        else:
            t1 = (mn - o) / u
            t2 = (mx - o) / u
            intervals.append((min(t1, t2), max(t1, t2)))

    t_min = max(intervals[0][0], intervals[1][0])
    t_max = min(intervals[0][1], intervals[1][1])
    if not math.isfinite(t_min) or not math.isfinite(t_max) or t_min > t_max:
        return None

    p1 = {"x": ox + ux * t_min, "y": oy + uy * t_min, "z": oz}
    p2 = {"x": ox + ux * t_max, "y": oy + uy * t_max, "z": oz}
    return p1, p2


_NUM_RE = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
_POINT_VALUE_RE = re.compile(rf"^\[\s*({_NUM_RE})\s+({_NUM_RE})(?:\s+({_NUM_RE}))?\s*\]$")
_LABEL_VALUE_RE = re.compile(r"^\s*(?P<label>[^.].*?)\s*(?:\.\s*){3,}(?P<value>.+?)\s*$")
_ENTITY_START_RE = re.compile(
    r"^\s*<(?P<etype>AcDb[A-Za-z0-9_]+)>\s*(?:\.\s*)*\[(?P<handle>[0-9A-Fa-f]+)\]\s*$"
)


def _normalize_label(label: str) -> str:
    return re.sub(r"\s+", " ", label.strip().lower())


def _parse_label_value(line: str) -> Tuple[Optional[str], Optional[str]]:
    m = _LABEL_VALUE_RE.match(line)
    if not m:
        return None, None
    return _normalize_label(m.group("label")), m.group("value").strip()


def _parse_point_value(value: str) -> Optional[Dict[str, float]]:
    m = _POINT_VALUE_RE.match(value.strip())
    if not m:
        return None
    x = float(m.group(1))
    y = float(m.group(2))
    z = float(m.group(3)) if m.group(3) is not None else 0.0
    return {"x": x, "y": y, "z": z}


def _parse_float_value(value: str) -> Optional[float]:
    v = value.strip().rstrip("dD")
    try:
        return float(v)
    except Exception:
        return None


def _space_from_block_name(block_name: str) -> Tuple[str, str, str]:
    name = block_name.strip()
    upper = name.upper()
    if upper == "*MODEL_SPACE":
        return "model", "Model", "model"
    if upper.startswith("*PAPER_SPACE"):
        suffix = name[len("*Paper_Space") :] if name.startswith("*Paper_Space") else name[len("*PAPER_SPACE") :]
        display_name = f"Layout{suffix}" if suffix else "Layout1"
        return f"layout:{name}", display_name, "layout"
    clean = name.lstrip("*") or "Layout"
    return f"layout:{clean}", clean, "layout"


class ExternalCoreError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None, body: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


@dataclass
class DwgDocSession:
    doc_id: str
    file_path: Path
    original_name: str
    mode: str
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    current_space: str = "model"
    view_state: Dict[str, object] = field(
        default_factory=lambda: {"zoom": 1.0, "center": {"x": 0.0, "y": 0.0, "z": 0.0}}
    )
    spaces: List[Dict[str, object]] = field(default_factory=list)
    entities_by_space: Dict[str, List[Dict[str, object]]] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    remote_doc_id: Optional[str] = None


class DwgServiceCore:
    """Session manager + DWG interaction operations."""

    def __init__(self, uploads_dir: Path):
        self.uploads_dir = uploads_dir
        self.sessions: Dict[str, DwgDocSession] = {}
        self.server_dir = Path(__file__).resolve().parent
        self.oda_vendor_root = (self.server_dir / "vendor" / "oda").resolve()

        self.mode = "stub"

        self.external_base_url = os.environ.get("DWG_CORE_BASE_URL", "").strip().rstrip("/")
        self.external_timeout_sec = max(1.0, float(os.environ.get("DWG_CORE_TIMEOUT_SEC", "25")))
        self.external_auth_bearer = os.environ.get("DWG_CORE_AUTH_BEARER", "").strip()
        self.external_prefix = ""

        explicit_prefix = os.environ.get("DWG_CORE_PREFIX", "").strip().rstrip("/")
        if explicit_prefix and not explicit_prefix.startswith("/"):
            explicit_prefix = f"/{explicit_prefix}"

        self.oda_timeout_sec = max(5.0, float(os.environ.get("DWG_ODA_TIMEOUT_SEC", "60")))
        self.max_entities_per_space = max(500, int(os.environ.get("DWG_ODA_MAX_ENTITIES_PER_SPACE", "25000")))
        self.default_entity_api_limit = max(200, int(os.environ.get("DWG_ENTITY_API_DEFAULT_LIMIT", "6000")))
        self.oda_profile = os.environ.get("ODA_PROFILE", "").strip() or ("win-x64" if os.name == "nt" else "linux-x64")
        self.oda_version = os.environ.get("ODA_VERSION", "").strip() or "2026.03.25-v1"
        self.oda_runtime_root: Optional[str] = None
        self.oda_runtime_in_project = False
        self.oda_resolve_source: Optional[str] = None
        self.oda_read_exe = self._resolve_oda_read_exe(os.environ.get("ODA_READ_EXE", "").strip())

        if self.external_base_url:
            self.mode = "external_http"
            if explicit_prefix:
                self.external_prefix = explicit_prefix
            else:
                parsed = urllib_parse.urlparse(self.external_base_url)
                path = parsed.path.rstrip("/").lower()
                if path.endswith("/api/dwg") or path.endswith("/dwg"):
                    self.external_prefix = ""
                else:
                    self.external_prefix = "/api/dwg"
        elif self.oda_read_exe:
            self.mode = "oda_cli"

    def _resolve_oda_read_exe(self, env_path: str) -> Optional[str]:
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

        vendor_root = self.oda_vendor_root / self.oda_profile / self.oda_version
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
                    self.oda_runtime_root = str(resolved_runtime_root)
                    self.oda_resolve_source = source
                    try:
                        self.oda_runtime_in_project = str(resolved).lower().startswith(str(self.oda_vendor_root).lower())
                    except Exception:
                        self.oda_runtime_in_project = False
                    return str(resolved)
            except Exception:
                continue
        return None

    def _decode_oda_bytes(self, data: bytes) -> str:
        for enc in ("utf-8", "gb18030", "gbk", "latin-1"):
            try:
                return data.decode(enc)
            except Exception:
                continue
        return data.decode("utf-8", errors="replace")

    def _run_oda_read_dump(self, file_path: Path) -> str:
        if not self.oda_read_exe:
            raise ExternalCoreError("OdReadEx executable is not configured/found")

        exe_path = Path(self.oda_read_exe)
        env = os.environ.copy()
        exe_dir = str(exe_path.parent)
        env["PATH"] = exe_dir + os.pathsep + env.get("PATH", "")

        target_file = str(file_path.resolve())
        cmd = [str(exe_path), target_file, "DO"]
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.oda_timeout_sec,
                env=env,
                cwd=exe_dir,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ExternalCoreError(f"OdReadEx timed out after {self.oda_timeout_sec:.1f}s for {file_path.name}") from exc
        except Exception as exc:
            raise ExternalCoreError(f"failed to launch OdReadEx: {exc}") from exc

        stdout_text = self._decode_oda_bytes(proc.stdout or b"")
        stderr_text = self._decode_oda_bytes(proc.stderr or b"")
        if proc.returncode != 0:
            detail = stderr_text.strip() or stdout_text[:3000].strip()
            raise ExternalCoreError(f"OdReadEx failed (code={proc.returncode}): {detail}")

        if "Can't open file:" in stdout_text:
            raise ExternalCoreError(stdout_text.strip())

        if not stdout_text.strip():
            raise ExternalCoreError("OdReadEx returned empty output")
        return stdout_text

    def _build_entity_from_oda(
        self,
        etype: str,
        handle: str,
        lines: List[str],
        space_id: str,
    ) -> Optional[Dict[str, object]]:
        layer = "0"
        min_pt: Optional[Dict[str, float]] = None
        max_pt: Optional[Dict[str, float]] = None
        origin_pt: Optional[Dict[str, float]] = None
        u_axis_pt: Optional[Dict[str, float]] = None
        center_pt: Optional[Dict[str, float]] = None
        start_pt: Optional[Dict[str, float]] = None
        end_pt: Optional[Dict[str, float]] = None
        radius: Optional[float] = None
        start_angle: Optional[float] = None
        end_angle: Optional[float] = None
        vertices: List[Dict[str, float]] = []

        expect_vertex_point = False

        for raw in lines:
            stripped = raw.strip()
            if stripped.lower().startswith("vertex "):
                expect_vertex_point = True
                continue

            label, value = _parse_label_value(raw)
            if not label or value is None:
                continue

            if expect_vertex_point and label == "point":
                pt = _parse_point_value(value)
                if pt is not None:
                    vertices.append(pt)
                    expect_vertex_point = False
                continue

            if label == "layer":
                layer = value
                continue
            if label == "min extents":
                min_pt = _parse_point_value(value)
                continue
            if label == "max extents":
                max_pt = _parse_point_value(value)
                continue
            if label == "origin":
                origin_pt = _parse_point_value(value)
                continue
            if label == "u-axis":
                u_axis_pt = _parse_point_value(value)
                continue
            if label in ("center", "center point"):
                center_pt = _parse_point_value(value)
                continue
            if label == "radius":
                radius = _parse_float_value(value)
                continue
            if label == "start point":
                start_pt = _parse_point_value(value)
                continue
            if label == "end point":
                end_pt = _parse_point_value(value)
                continue
            if label == "start angle":
                start_angle = _parse_float_value(value)
                continue
            if label == "end angle":
                end_angle = _parse_float_value(value)
                continue

        bbox = {"min": min_pt, "max": max_pt} if (min_pt and max_pt) else None
        et = etype.lower()

        if et == "acdbline":
            start = start_pt
            end = end_pt
            if (start is None or end is None) and min_pt and max_pt and origin_pt and u_axis_pt:
                inferred = _line_segment_from_bbox(origin_pt, u_axis_pt, min_pt, max_pt)
                if inferred:
                    start, end = inferred
            if (start is None or end is None) and min_pt and max_pt:
                start = dict(min_pt)
                end = dict(max_pt)
            if start is None or end is None:
                return None
            if bbox is None:
                bbox = _bbox_from_points([start, end])
            return {
                "id": handle,
                "type": "LINE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"start": start, "end": end},
                "style": {"lineweight": "default"},
                "bbox": bbox,
            }

        if et in ("acdbpolyline", "acdb2dpolyline", "acdb3dpolyline"):
            if len(vertices) < 2:
                return None
            if bbox is None:
                bbox = _bbox_from_points(vertices)
            return {
                "id": handle,
                "type": "POLYLINE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"vertices": vertices},
                "style": {"lineweight": "default"},
                "bbox": bbox,
            }

        if et == "acdbcircle":
            if center_pt is None or radius is None:
                return None
            if bbox is None:
                bbox = {
                    "min": {"x": center_pt["x"] - radius, "y": center_pt["y"] - radius, "z": center_pt.get("z", 0.0)},
                    "max": {"x": center_pt["x"] + radius, "y": center_pt["y"] + radius, "z": center_pt.get("z", 0.0)},
                }
            return {
                "id": handle,
                "type": "CIRCLE",
                "layer": layer,
                "space_id": space_id,
                "geom": {"center": center_pt, "radius": radius},
                "style": {"lineweight": "default"},
                "bbox": bbox,
            }

        if et == "acdbarc":
            if center_pt is None or radius is None:
                return None

            if start_pt is None and start_angle is not None:
                rad = math.radians(start_angle)
                start_pt = {"x": center_pt["x"] + radius * math.cos(rad), "y": center_pt["y"] + radius * math.sin(rad), "z": center_pt.get("z", 0.0)}
            if end_pt is None and end_angle is not None:
                rad = math.radians(end_angle)
                end_pt = {"x": center_pt["x"] + radius * math.cos(rad), "y": center_pt["y"] + radius * math.sin(rad), "z": center_pt.get("z", 0.0)}

            if bbox is None:
                pts = [center_pt]
                if start_pt:
                    pts.append(start_pt)
                if end_pt:
                    pts.append(end_pt)
                bbox = _bbox_from_points(pts)

            geom: Dict[str, object] = {"center": center_pt, "radius": radius}
            if start_pt:
                geom["start"] = start_pt
            if end_pt:
                geom["end"] = end_pt
            if start_angle is not None:
                geom["start_angle"] = start_angle
            if end_angle is not None:
                geom["end_angle"] = end_angle

            return {
                "id": handle,
                "type": "ARC",
                "layer": layer,
                "space_id": space_id,
                "geom": geom,
                "style": {"lineweight": "default"},
                "bbox": bbox,
            }

        return None

    def _parse_oda_dump(
        self,
        dump_text: str,
    ) -> Tuple[List[Dict[str, object]], Dict[str, List[Dict[str, object]]], List[str]]:
        spaces_by_id: Dict[str, Dict[str, object]] = {}
        entities_by_space: Dict[str, List[Dict[str, object]]] = {}
        warnings: List[str] = []

        current_block_name: Optional[str] = None
        current_block_layout = False
        current_space_id: Optional[str] = None
        current_entity: Optional[Dict[str, object]] = None

        def ensure_space(block_name: str) -> str:
            sid, display_name, kind = _space_from_block_name(block_name)
            if sid not in spaces_by_id:
                spaces_by_id[sid] = {"id": sid, "display_name": display_name, "kind": kind}
            return sid

        def finalize_entity() -> None:
            nonlocal current_entity
            if not current_entity or not current_space_id:
                current_entity = None
                return

            ent = self._build_entity_from_oda(
                etype=str(current_entity["etype"]),
                handle=str(current_entity["handle"]),
                lines=list(current_entity["lines"]),
                space_id=current_space_id,
            )
            if ent is not None:
                bucket = entities_by_space.setdefault(current_space_id, [])
                if len(bucket) < self.max_entities_per_space:
                    bucket.append(ent)
                elif len(bucket) == self.max_entities_per_space:
                    warnings.append(
                        f"Entity cap reached for {current_space_id}: only first {self.max_entities_per_space} entities loaded."
                    )
            current_entity = None

        for raw in dump_text.splitlines():
            line = raw.rstrip("\r\n")
            stripped = line.strip()

            if stripped == "<AcDbBlockTableRecord>":
                finalize_entity()
                current_block_name = None
                current_block_layout = False
                current_space_id = None
                continue

            ent_m = _ENTITY_START_RE.match(line)
            if ent_m:
                finalize_entity()
                if current_block_layout and current_space_id:
                    current_entity = {
                        "etype": ent_m.group("etype"),
                        "handle": ent_m.group("handle"),
                        "lines": [],
                    }
                else:
                    current_entity = None
                continue

            if current_entity is not None:
                current_entity["lines"].append(line)
                continue

            label, value = _parse_label_value(line)
            if label == "name" and value:
                current_block_name = value
                if current_block_layout:
                    current_space_id = ensure_space(current_block_name)
                continue
            if label == "layout" and value:
                current_block_layout = value.lower() == "true"
                if current_block_layout and current_block_name:
                    current_space_id = ensure_space(current_block_name)
                else:
                    current_space_id = None
                continue

        finalize_entity()

        if not spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}
        elif "model" not in spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}

        ordered_ids = sorted(spaces_by_id.keys(), key=lambda sid: (0 if sid == "model" else 1, sid))
        spaces = [spaces_by_id[sid] for sid in ordered_ids]
        return spaces, entities_by_space, warnings

    def _external_url(self, path: str) -> str:
        if not self.external_base_url:
            raise ExternalCoreError("DWG_CORE_BASE_URL is not configured")
        suffix = path if path.startswith("/") else f"/{path}"
        return f"{self.external_base_url}{self.external_prefix}{suffix}"

    def _external_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.external_auth_bearer:
            headers["Authorization"] = f"Bearer {self.external_auth_bearer}"
        return headers

    def _decode_json_body(self, raw: bytes) -> Dict[str, object]:
        text = (raw or b"").decode("utf-8", errors="replace").strip()
        if not text:
            return {}
        try:
            obj = json.loads(text)
        except Exception as exc:
            raise ExternalCoreError(f"invalid JSON from external DWG core: {exc}", body=text)
        if not isinstance(obj, dict):
            raise ExternalCoreError("external DWG core response must be a JSON object")
        return obj

    def _external_request_json(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, object]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, object]:
        url = self._external_url(path)
        body: Optional[bytes] = None
        headers = self._external_headers()
        if extra_headers:
            headers.update(extra_headers)

        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib_request.Request(url=url, data=body, method=method.upper(), headers=headers)
        try:
            with urllib_request.urlopen(req, timeout=self.external_timeout_sec) as resp:
                return self._decode_json_body(resp.read())
        except urllib_error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            message = f"external DWG core HTTP {exc.code} on {path}"
            raise ExternalCoreError(message, status_code=exc.code, body=body_text)
        except urllib_error.URLError as exc:
            raise ExternalCoreError(f"external DWG core unreachable on {path}: {exc}")

    def _external_open_document(self, file_path: Path, original_name: str) -> Dict[str, object]:
        url = self._external_url("/open")
        boundary = f"----dwgcore{uuid.uuid4().hex}"
        file_bytes = file_path.read_bytes()

        lines: List[bytes] = []
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(
            (
                f'Content-Disposition: form-data; name="file"; filename="{original_name}"\r\n'
                "Content-Type: application/octet-stream\r\n\r\n"
            ).encode("utf-8")
        )
        lines.append(file_bytes)
        lines.append(b"\r\n")
        lines.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(lines)

        headers = self._external_headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        req = urllib_request.Request(url=url, data=body, method="POST", headers=headers)

        try:
            with urllib_request.urlopen(req, timeout=self.external_timeout_sec) as resp:
                return self._decode_json_body(resp.read())
        except urllib_error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            message = f"external DWG core HTTP {exc.code} on /open"
            raise ExternalCoreError(message, status_code=exc.code, body=body_text)
        except urllib_error.URLError as exc:
            raise ExternalCoreError(f"external DWG core unreachable on /open: {exc}")

    def _strip_ok(self, payload: Dict[str, object]) -> Dict[str, object]:
        data = dict(payload)
        data.pop("ok", None)
        return data

    def _external_doc_request(
        self,
        session: DwgDocSession,
        method: str,
        suffix: str,
        payload: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        if not session.remote_doc_id:
            raise ExternalCoreError("missing remote_doc_id in external_http session")
        remote_id = urllib_parse.quote(session.remote_doc_id, safe="")
        data = self._external_request_json(method, f"/{remote_id}{suffix}", payload)
        data = self._strip_ok(data)
        data["doc_id"] = session.doc_id
        return data

    def health(self) -> Dict[str, object]:
        base: Dict[str, object] = {
            "status": "ok",
            "mode": self.mode,
            "external_base_url": self.external_base_url or None,
            "external_prefix": self.external_prefix or None,
            "oda_read_exe": self.oda_read_exe,
            "oda_runtime_root": self.oda_runtime_root,
            "oda_runtime_in_project": self.oda_runtime_in_project,
            "oda_profile": self.oda_profile,
            "oda_version": self.oda_version,
            "oda_resolve_source": self.oda_resolve_source,
            "session_count": len(self.sessions),
            "supports": {
                "direct_dwg": True,
                "spaces": True,
                "pick": True,
                "snap": True,
                "measure": True,
                "entities": True,
            },
        }

        if self.mode == "external_http":
            try:
                remote = self._external_request_json("GET", "/health")
                base["external_health"] = self._strip_ok(remote)
            except ExternalCoreError as exc:
                base["status"] = "error"
                base["external_error"] = str(exc)
                if exc.status_code is not None:
                    base["external_status_code"] = exc.status_code
                if exc.body:
                    base["external_body"] = exc.body[:500]
            return base

        if self.mode == "oda_cli":
            if not self.oda_read_exe:
                base["status"] = "error"
                base["error"] = "OdReadEx executable is not configured"
            elif not Path(self.oda_read_exe).exists():
                base["status"] = "error"
                base["error"] = f"OdReadEx not found: {self.oda_read_exe}"
            return base

        return base

    def _build_stub_spaces(self, stem: str) -> Tuple[List[Dict[str, object]], Dict[str, List[Dict[str, object]]]]:
        spaces = [
            {"id": "model", "display_name": "Model", "kind": "model"},
            {"id": "layout:Layout1", "display_name": "Layout1", "kind": "layout"},
        ]
        entities = {
            "model": [
                {
                    "id": f"{stem}-line-1",
                    "type": "LINE",
                    "layer": "0",
                    "space_id": "model",
                    "geom": {
                        "start": {"x": 0.0, "y": 0.0, "z": 0.0},
                        "end": {"x": 1000.0, "y": 0.0, "z": 0.0},
                    },
                    "style": {"lineweight": "default"},
                    "bbox": {"min": {"x": 0.0, "y": 0.0, "z": 0.0}, "max": {"x": 1000.0, "y": 0.0, "z": 0.0}},
                },
                {
                    "id": f"{stem}-circle-1",
                    "type": "CIRCLE",
                    "layer": "0",
                    "space_id": "model",
                    "geom": {"center": {"x": 300.0, "y": 200.0, "z": 0.0}, "radius": 120.0},
                    "style": {"lineweight": "default"},
                    "bbox": {"min": {"x": 180.0, "y": 80.0, "z": 0.0}, "max": {"x": 420.0, "y": 320.0, "z": 0.0}},
                },
            ],
            "layout:Layout1": [
                {
                    "id": f"{stem}-layout-line-1",
                    "type": "LINE",
                    "layer": "VIEWPORT",
                    "space_id": "layout:Layout1",
                    "geom": {
                        "start": {"x": 50.0, "y": 50.0, "z": 0.0},
                        "end": {"x": 350.0, "y": 50.0, "z": 0.0},
                    },
                    "style": {"lineweight": "default"},
                    "bbox": {"min": {"x": 50.0, "y": 50.0, "z": 0.0}, "max": {"x": 350.0, "y": 50.0, "z": 0.0}},
                }
            ],
        }
        return spaces, entities

    def open_document(self, file_path: Path, original_name: str) -> Dict[str, object]:
        if self.mode == "external_http":
            opened = self._external_open_document(file_path, original_name)
            remote_doc_id = str(opened.get("doc_id", "")).strip() or str(opened.get("id", "")).strip()
            if not remote_doc_id:
                raise ExternalCoreError("external DWG core /open did not return doc_id")

            doc_id = str(uuid.uuid4())
            spaces = opened.get("spaces") if isinstance(opened.get("spaces"), list) else []
            current_space = str(opened.get("current_space", "model") or "model")
            warnings_raw = opened.get("warnings")
            warnings = warnings_raw if isinstance(warnings_raw, list) else []
            mode = str(opened.get("mode") or "external_http")

            session = DwgDocSession(
                doc_id=doc_id,
                file_path=file_path,
                original_name=original_name,
                mode=mode,
                spaces=spaces,
                entities_by_space={},
                warnings=warnings,
                current_space=current_space,
                remote_doc_id=remote_doc_id,
            )
            session.view_state["remote_doc_id"] = remote_doc_id
            self.sessions[doc_id] = session

            return {
                "doc_id": doc_id,
                "mode": mode,
                "spaces": spaces,
                "current_space": current_space,
                "warnings": warnings,
            }

        if self.mode == "oda_cli":
            dump_text = self._run_oda_read_dump(file_path)
            spaces, entities_by_space, warnings = self._parse_oda_dump(dump_text)
            if not spaces:
                spaces = [{"id": "model", "display_name": "Model", "kind": "model"}]
            current_space = "model" if any(s.get("id") == "model" for s in spaces) else str(spaces[0].get("id", "model"))

            total_entities = sum(len(v) for v in entities_by_space.values())
            if total_entities == 0:
                warnings.append("ODA parser loaded the DWG but did not extract supported entities yet.")

            doc_id = str(uuid.uuid4())
            session = DwgDocSession(
                doc_id=doc_id,
                file_path=file_path,
                original_name=original_name,
                mode="oda_cli",
                spaces=spaces,
                entities_by_space=entities_by_space,
                warnings=warnings,
                current_space=current_space,
            )
            session.view_state["entity_count"] = total_entities
            self.sessions[doc_id] = session
            return {
                "doc_id": doc_id,
                "mode": session.mode,
                "spaces": spaces,
                "current_space": current_space,
                "warnings": warnings,
            }

        doc_id = str(uuid.uuid4())
        stem = file_path.stem
        spaces, entities = self._build_stub_spaces(stem)

        warnings: List[str] = []
        warnings.append(
            "DWG core is running in stub mode. Configure ODA_READ_EXE/ODA_RUNTIME_ROOT or DWG_CORE_BASE_URL for real parsing."
        )

        session = DwgDocSession(
            doc_id=doc_id,
            file_path=file_path,
            original_name=original_name,
            mode=self.mode,
            spaces=spaces,
            entities_by_space=entities,
            warnings=warnings,
        )
        self.sessions[doc_id] = session
        return {
            "doc_id": doc_id,
            "mode": session.mode,
            "spaces": spaces,
            "current_space": session.current_space,
            "warnings": warnings,
        }

    def get_session(self, doc_id: str) -> Optional[DwgDocSession]:
        session = self.sessions.get(doc_id)
        if session:
            session.updated_at = time.time()
        return session

    def close_document(self, doc_id: str) -> bool:
        session = self.sessions.get(doc_id)
        if not session:
            return False

        if self.mode == "external_http" and session.remote_doc_id:
            try:
                self._external_doc_request(session, "POST", "/close", {})
            except ExternalCoreError:
                pass

        self.sessions.pop(doc_id, None)
        return True

    def list_spaces(self, doc_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            data = self._external_doc_request(session, "GET", "/spaces")
            spaces = data.get("spaces") if isinstance(data.get("spaces"), list) else session.spaces
            current_space = str(data.get("current_space", session.current_space) or session.current_space)
            session.spaces = spaces
            session.current_space = current_space
            return {"doc_id": doc_id, "current_space": current_space, "spaces": spaces}

        return {"doc_id": doc_id, "current_space": session.current_space, "spaces": session.spaces}

    def list_entities(
        self,
        doc_id: str,
        space_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        space = space_id or session.current_space

        if self.mode == "external_http":
            params: Dict[str, object] = {"space_id": space}
            if limit is not None and limit > 0:
                params["limit"] = int(limit)
            query = urllib_parse.urlencode(params)
            suffix = "/entities"
            if query:
                suffix += f"?{query}"
            return self._external_doc_request(session, "GET", suffix)

        entity_limit = int(limit) if isinstance(limit, int) and limit > 0 else self.default_entity_api_limit
        all_entities = list(session.entities_by_space.get(space, []))
        sliced = all_entities[:entity_limit]
        return {
            "doc_id": doc_id,
            "space_id": space,
            "entities": sliced,
            "total_count": len(all_entities),
            "truncated": len(all_entities) > entity_limit,
        }

    def set_view(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            data = self._external_doc_request(session, "POST", "/view", payload)
            current_space = data.get("current_space")
            if isinstance(current_space, str) and current_space:
                session.current_space = current_space

            view_state = data.get("view_state")
            if isinstance(view_state, dict):
                session.view_state.update(view_state)
            else:
                zoom = payload.get("zoom")
                if isinstance(zoom, (int, float)) and float(zoom) > 0:
                    session.view_state["zoom"] = float(zoom)
                center = payload.get("center")
                if isinstance(center, dict) and "x" in center and "y" in center:
                    session.view_state["center"] = {
                        "x": float(center.get("x", 0.0)),
                        "y": float(center.get("y", 0.0)),
                        "z": float(center.get("z", 0.0)),
                    }

            return {
                "doc_id": doc_id,
                "current_space": session.current_space,
                "view_state": session.view_state,
            }

        space_id = payload.get("space_id")
        if isinstance(space_id, str) and any(s["id"] == space_id for s in session.spaces):
            session.current_space = space_id

        zoom = payload.get("zoom")
        if isinstance(zoom, (int, float)) and float(zoom) > 0:
            session.view_state["zoom"] = float(zoom)

        center = payload.get("center")
        if isinstance(center, dict) and "x" in center and "y" in center:
            session.view_state["center"] = {
                "x": float(center.get("x", 0.0)),
                "y": float(center.get("y", 0.0)),
                "z": float(center.get("z", 0.0)),
            }

        return {
            "doc_id": doc_id,
            "current_space": session.current_space,
            "view_state": session.view_state,
        }

    def _iter_space_entities(self, session: DwgDocSession, space_id: str):
        return session.entities_by_space.get(space_id, [])

    def _iter_entity_segments(self, ent: Dict[str, object]) -> List[Tuple[Dict[str, float], Dict[str, float]]]:
        et = str(ent.get("type", "")).upper()
        geom = ent.get("geom") if isinstance(ent.get("geom"), dict) else {}
        segments: List[Tuple[Dict[str, float], Dict[str, float]]] = []
        if et == "LINE":
            start = geom.get("start")
            end = geom.get("end")
            if isinstance(start, dict) and isinstance(end, dict):
                segments.append((start, end))
        elif et == "POLYLINE":
            vertices = geom.get("vertices")
            if isinstance(vertices, list):
                for i in range(len(vertices) - 1):
                    a = vertices[i]
                    b = vertices[i + 1]
                    if isinstance(a, dict) and isinstance(b, dict):
                        segments.append((a, b))
        return segments

    def pick(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/pick", payload)

        space_id = payload.get("space_id") if isinstance(payload.get("space_id"), str) else session.current_space
        point = payload.get("point") if isinstance(payload.get("point"), dict) else None
        tol = float(payload.get("tolerance", 8.0))
        if not point or "x" not in point or "y" not in point:
            return {"doc_id": doc_id, "space_id": space_id, "picked": []}

        best = None
        best_dist = float("inf")
        for ent in self._iter_space_entities(session, space_id):
            etype = str(ent.get("type", "")).upper()
            geom = ent.get("geom", {})
            d: Optional[float] = None

            if etype in ("LINE", "POLYLINE"):
                for a, b in self._iter_entity_segments(ent):
                    dist, _, _ = _distance_to_segment(point, a, b)
                    if d is None or dist < d:
                        d = dist
            elif etype == "CIRCLE":
                center = geom.get("center")
                radius = geom.get("radius")
                if isinstance(center, dict) and isinstance(radius, (int, float)):
                    d = abs(_point_distance(point, center) - float(radius))
            elif etype == "ARC":
                center = geom.get("center")
                radius = geom.get("radius")
                if isinstance(center, dict) and isinstance(radius, (int, float)):
                    radial_dist = abs(_point_distance(point, center) - float(radius))
                    start = geom.get("start")
                    end = geom.get("end")
                    start_angle = geom.get("start_angle")
                    end_angle = geom.get("end_angle")
                    if isinstance(start_angle, (int, float)) and isinstance(end_angle, (int, float)):
                        a = _point_angle_from_center(center, point)
                        if not _is_angle_on_arc(a, float(start_angle), float(end_angle)):
                            endpoint_distances = []
                            if isinstance(start, dict):
                                endpoint_distances.append(_point_distance(point, start))
                            if isinstance(end, dict):
                                endpoint_distances.append(_point_distance(point, end))
                            if endpoint_distances:
                                radial_dist = min(radial_dist, min(endpoint_distances))
                    d = radial_dist

            if d is not None and d < best_dist:
                best_dist = d
                best = ent

        picked: List[Dict[str, object]] = []
        if best is not None and best_dist <= tol:
            picked.append({"entity_id": best["id"], "distance": best_dist})

        return {"doc_id": doc_id, "space_id": space_id, "picked": picked}

    def snap(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/snap", payload)

        space_id = payload.get("space_id") if isinstance(payload.get("space_id"), str) else session.current_space
        point = payload.get("point") if isinstance(payload.get("point"), dict) else None
        modes = payload.get("modes") if isinstance(payload.get("modes"), list) else ["endpoint", "midpoint", "center"]
        tol = float(payload.get("tolerance", 10.0))
        if not point or "x" not in point or "y" not in point:
            return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": None, "mode": None}

        candidates: List[Tuple[float, Dict[str, float], str]] = []
        for ent in self._iter_space_entities(session, space_id):
            etype = str(ent.get("type", "")).upper()
            geom = ent.get("geom", {})

            if etype in ("LINE", "POLYLINE"):
                for a, b in self._iter_entity_segments(ent):
                    if "endpoint" in modes:
                        candidates.append((_point_distance(point, a), a, "endpoint"))
                        candidates.append((_point_distance(point, b), b, "endpoint"))
                    if "midpoint" in modes:
                        mid = {
                            "x": (float(a["x"]) + float(b["x"])) * 0.5,
                            "y": (float(a["y"]) + float(b["y"])) * 0.5,
                            "z": 0.0,
                        }
                        candidates.append((_point_distance(point, mid), mid, "midpoint"))
            elif etype == "CIRCLE" and "center" in modes:
                center = geom.get("center")
                if isinstance(center, dict):
                    candidates.append((_point_distance(point, center), center, "center"))
            elif etype == "ARC":
                center = geom.get("center")
                if "center" in modes and isinstance(center, dict):
                    candidates.append((_point_distance(point, center), center, "center"))
                if "endpoint" in modes:
                    start = geom.get("start")
                    end = geom.get("end")
                    if isinstance(start, dict):
                        candidates.append((_point_distance(point, start), start, "endpoint"))
                    if isinstance(end, dict):
                        candidates.append((_point_distance(point, end), end, "endpoint"))

        if not candidates:
            return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": point, "mode": None}

        best = min(candidates, key=lambda x: x[0])
        if best[0] > tol:
            return {"doc_id": doc_id, "space_id": space_id, "snapped": False, "point": point, "mode": None}
        return {"doc_id": doc_id, "space_id": space_id, "snapped": True, "point": best[1], "mode": best[2]}

    def measure(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/measure", payload)

        measure_type = str(payload.get("type", "distance"))
        if measure_type == "distance":
            p1 = payload.get("p1")
            p2 = payload.get("p2")
            if not isinstance(p1, dict) or not isinstance(p2, dict):
                return {"doc_id": doc_id, "type": "distance", "ok": False, "error": "p1/p2 required"}
            value = _point_distance(p1, p2)
            return {"doc_id": doc_id, "type": "distance", "ok": True, "value": value, "unit": "drawing_unit"}

        if measure_type == "angle":
            p1 = payload.get("p1")
            vertex = payload.get("vertex")
            p2 = payload.get("p2")
            if not isinstance(p1, dict) or not isinstance(vertex, dict) or not isinstance(p2, dict):
                return {"doc_id": doc_id, "type": "angle", "ok": False, "error": "p1/vertex/p2 required"}
            value = _angle_deg(p1, vertex, p2)
            if value is None:
                return {"doc_id": doc_id, "type": "angle", "ok": False, "error": "invalid points"}
            return {"doc_id": doc_id, "type": "angle", "ok": True, "value": value, "unit": "degree"}

        return {"doc_id": doc_id, "type": measure_type, "ok": False, "error": "unsupported measure type"}

    def get_entity(self, doc_id: str, entity_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            entity_path = f"/entity/{urllib_parse.quote(entity_id, safe='')}"
            return self._external_doc_request(session, "GET", entity_path)

        for space_entities in session.entities_by_space.values():
            for ent in space_entities:
                if ent.get("id") == entity_id:
                    return {"doc_id": doc_id, "entity": ent}
        return {"doc_id": doc_id, "entity": None}

    def cleanup_expired(self, max_age_sec: int = 3600) -> int:
        now = time.time()
        remove_ids = [
            doc_id
            for doc_id, sess in self.sessions.items()
            if (now - sess.updated_at) > max_age_sec
        ]
        for doc_id in remove_ids:
            self.sessions.pop(doc_id, None)
        return len(remove_ids)
