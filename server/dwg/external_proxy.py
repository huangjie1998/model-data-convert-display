#!/usr/bin/env python3
"""HTTP proxy for remote DWG core service.

Implements the external_http mode: proxies all DWG API calls to a remote
ODA-backed server over HTTP. Used when a local ODA runtime is not available.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Dict, List, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request


class ExternalCoreError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None, body: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class DwgExternalHttpProxy:
    """Thin proxy layer for external DWG core services."""

    def __init__(
        self,
        base_url: str,
        prefix: str = "",
        auth_bearer: str = "",
        timeout_sec: float = 60.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._prefix = prefix.rstrip("/") if prefix else ""
        self._auth_bearer = auth_bearer
        self._timeout_sec = max(1.0, timeout_sec)

    @classmethod
    def from_environment(cls) -> Optional["DwgExternalHttpProxy"]:
        base = os.environ.get("DWG_CORE_BASE_URL", "").strip().rstrip("/")
        if not base:
            return None

        timeout_sec = max(1.0, float(os.environ.get("DWG_CORE_TIMEOUT_SEC", "60")))
        auth = os.environ.get("DWG_CORE_AUTH_BEARER", "").strip()

        explicit_prefix = os.environ.get("DWG_CORE_PREFIX", "").strip().rstrip("/")
        if explicit_prefix:
            prefix = explicit_prefix if explicit_prefix.startswith("/") else f"/{explicit_prefix}"
        else:
            parsed = urllib_parse.urlparse(base)
            path = parsed.path.rstrip("/").lower()
            prefix = "" if (path.endswith("/api/dwg") or path.endswith("/dwg")) else "/api/dwg"

        return cls(base_url=base, prefix=prefix, auth_bearer=auth, timeout_sec=timeout_sec)

    def _url(self, path: str) -> str:
        suffix = path if path.startswith("/") else f"/{path}"
        return f"{self._base_url}{self._prefix}{suffix}"

    def _headers(self) -> Dict[str, str]:
        h: Dict[str, str] = {}
        if self._auth_bearer:
            h["Authorization"] = f"Bearer {self._auth_bearer}"
        return h

    @staticmethod
    def _decode_json_body(raw: bytes) -> Dict[str, object]:
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

    def request_json(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, object]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, object]:
        url = self._url(path)
        body: Optional[bytes] = None
        headers = self._headers()
        if extra_headers:
            headers.update(extra_headers)

        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib_request.Request(url=url, data=body, method=method.upper(), headers=headers)
        try:
            with urllib_request.urlopen(req, timeout=self._timeout_sec) as resp:
                return self._decode_json_body(resp.read())
        except urllib_error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            raise ExternalCoreError(f"external DWG core HTTP {exc.code} on {path}", status_code=exc.code, body=body_text)
        except urllib_error.URLError as exc:
            raise ExternalCoreError(f"external DWG core unreachable on {path}: {exc}")

    def open_document(self, file_path: Path, original_name: str) -> Dict[str, object]:
        url = self._url("/open")
        boundary = f"----dwgcore{uuid.uuid4().hex}"
        file_bytes = file_path.read_bytes()

        lines: List[bytes] = []
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(
            f'Content-Disposition: form-data; name="file"; filename="{original_name}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n".encode("utf-8")
        )
        lines.append(file_bytes)
        lines.append(b"\r\n")
        lines.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(lines)

        headers = self._headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        req = urllib_request.Request(url=url, data=body, method="POST", headers=headers)

        try:
            with urllib_request.urlopen(req, timeout=self._timeout_sec) as resp:
                return self._decode_json_body(resp.read())
        except urllib_error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            raise ExternalCoreError(f"external DWG core HTTP {exc.code} on /open", status_code=exc.code, body=body_text)
        except urllib_error.URLError as exc:
            raise ExternalCoreError(f"external DWG core unreachable on /open: {exc}")

    def doc_request(
        self,
        remote_doc_id: str,
        method: str,
        suffix: str,
        payload: Optional[Dict[str, object]] = None,
        *,
        local_doc_id: Optional[str] = None,
    ) -> Dict[str, object]:
        if not remote_doc_id:
            raise ExternalCoreError("missing remote_doc_id")
        remote_id = urllib_parse.quote(remote_doc_id, safe="")
        data = self.request_json(method, f"/{remote_id}{suffix}", payload)
        data.pop("ok", None)
        data["doc_id"] = local_doc_id or remote_doc_id
        return data
