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
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from server.dwg.entities.primitive_builder import build_entity_primitives
from server.dwg.entities.primitives_common import PrimitiveBuildContext
from server.dwg.dimension.payload import DimensionPayloadContext, build_dimension_payload
from server.dwg.dimension.arrow_repair import DimensionArrowRepairContext, repair_dimension_block_arrow_precision
from server.dwg.dimension.block_expander import DimensionBlockPrimitiveContext, collect_dimension_block_primitives
from server.dwg.block.expander import (
    BlockExpansionContext,
    expand_block_into_space as expand_block_into_space_by_category,
    make_block_name_lookup,
    resolve_block_table_name as resolve_block_table_name_from_catalog,
    space_id_for_layout_block as resolve_space_id_for_layout_block,
)
from server.dwg.block.transformer import transform_entity
from server.dwg.query.spatial import (
    iter_entity_segments,
    iter_entity_text_points,
    iter_space_block_refs,
    iter_space_entities,
    measure_payload,
    pick_in_session,
    snap_in_session,
)
from server.dwg.semantics import (
    build_mapping_status,
    decorate_primitives_with_semantics,
    entity_semantic_subtype,
    entity_semantic_type,
    has_semantic_value,
    hierarchy_category_label,
    required_semantic_keys,
)
from server.dwg.styles import (
    StyleExtractionContext,
    extract_dim_styles,
    extract_header_dim_defaults,
    extract_layer_styles,
    extract_linetype_styles,
    extract_text_styles,
)
from server.dwg.oda.blocks import OdaBlockParseContext, parse_oda_block_records
from server.dwg.oda.entity_builder import OdaEntityBuildContext, build_entity_from_oda_lines
from server.dwg.oda.runtime import (
    decode_oda_bytes,
    is_oda_vectorize_available,
    resolve_oda_read_exe,
    resolve_oda_vectorize_exe,
    run_oda_read_dump,
    run_oda_vectorize_dump,
    vectorize_cache_get,
    vectorize_cache_key,
    vectorize_cache_put,
)
from server.dwg.text import vectorize as dwg_text_vectorize
from server.dwg.common.affine import (
    Affine2D,
    _affine_scales,
    _apply_affine,
    _apply_bbox_affine,
    _apply_linear,
    _compose_affine,
)
from server.dwg.common.colors import (
    _parse_aci_from_color_name,
    _parse_true_rgb_decimal,
    _resolve_rgb_color_decimal,
)
from server.dwg.common.block_utils import _block_ref_id_from_instance_path, _space_from_block_name
from server.dwg.common.constants import DWG_CORE_PARSER_REV, DEFAULT_LINEWEIGHT_MM
from server.dwg.common.dimension_utils import (
    _dimension_line_endpoints,
    _dimension_subtype_from_kind,
    _normalize_dimension_kind,
    _normalize_dim_var_label,
    _normalize_dim_var_map,
    _normalize_dimblk_name,
    _parse_dim_var_value,
    _resolve_arrow_length,
    _resolve_dimension_display_text,
    _resolve_dimension_text_color,
    _resolve_dimension_text_mask_color,
    _resolve_entity_text_color,
    _resolve_dimension_text_mask_mode,
)
from server.dwg.common.fonts import (
    _detect_font_kind,
    _font_family_from_name,
    _normalize_entity_instance_key,
    _normalize_font_token,
    _sanitize_font_key,
    _shx_char_strokes,
)
from server.dwg.common.geometry import (
    _angle_deg,
    _bbox_from_points,
    _distance_to_bbox_2d,
    _distance_to_segment,
    _is_angle_on_arc,
    _line_intersection_2d,
    _line_segment_from_bbox,
    _line_segment_from_bbox_and_origin,
    _point_angle_from_center,
    _point_distance,
    _point_on_ray,
)
from server.dwg.common.oda_parse import (
    _ENTITY_START_RE,
    _VECTORIZE_ENTITY_END_RE,
    _VECTORIZE_ENTITY_START_RE,
    _VECTORIZE_VERTEX_RE,
    _build_hatch_loop_points_from_edges,
    _clean_oda_text_value,
    _is_text_entity_type,
    _lineweight_to_mm,
    _parse_float_value,
    _parse_int_value,
    _parse_label_value,
    _parse_point_value,
)

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
    block_refs_by_space: Dict[str, List[Dict[str, object]]] = field(default_factory=dict)
    layer_styles: Dict[str, Dict[str, object]] = field(default_factory=dict)
    linetype_styles: Dict[str, Dict[str, object]] = field(default_factory=dict)
    text_styles: Dict[str, Dict[str, object]] = field(default_factory=dict)
    dim_styles: Dict[str, Dict[str, object]] = field(default_factory=dict)
    header_dim_defaults: Dict[str, object] = field(default_factory=dict)
    block_catalog: Dict[str, Dict[str, object]] = field(default_factory=dict)
    font_files: Dict[str, str] = field(default_factory=dict)
    shx_fallback_hit_count: int = 0
    warnings: List[str] = field(default_factory=list)
    shx_outline_mode: str = "none"
    shx_detected: bool = False
    shx_true_outline: bool = False
    shx_vectorize_attempted: bool = False
    shx_vectorize_attached_count: int = 0
    shx_vectorize_error: Optional[str] = None
    shx_fallback_text_count: int = 0
    shx_missing_original_fonts: List[str] = field(default_factory=list)
    shx_resolved_original_fonts: List[str] = field(default_factory=list)
    shx_fallback_file_name: Optional[str] = None
    shx_diagnostics_unavailable: bool = False
    shx_debug_match: Optional[Dict[str, object]] = None
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
        # HTTP proxy mode timeout (when using an external DWG core service).
        self.external_timeout_sec = max(1.0, float(os.environ.get("DWG_CORE_TIMEOUT_SEC", "60")))
        self.external_auth_bearer = os.environ.get("DWG_CORE_AUTH_BEARER", "").strip()
        self.external_prefix = ""

        explicit_prefix = os.environ.get("DWG_CORE_PREFIX", "").strip().rstrip("/")
        if explicit_prefix and not explicit_prefix.startswith("/"):
            explicit_prefix = f"/{explicit_prefix}"

        # ODA CLI operations (OdReadEx/OdVectorizeEx) can be slow on large drawings.
        # Keep a longer default timeout to reduce false timeout failures in local usage.
        self.oda_timeout_sec = max(120.0, float(os.environ.get("DWG_ODA_TIMEOUT_SEC", "420")))
        # Keep OdReadEx execution deterministic: one run per request, no automatic retry.
        self.oda_timeout_retry_enabled = os.environ.get("DWG_ODA_TIMEOUT_RETRY_ENABLED", "0").strip().lower() in ("1", "true", "yes")
        self.oda_timeout_retry_sec = float(os.environ.get("DWG_ODA_TIMEOUT_RETRY_SEC", str(self.oda_timeout_sec)))
        self.oda_large_file_mb = max(1.0, float(os.environ.get("DWG_ODA_LARGE_FILE_MB", "80")))
        self.oda_large_file_timeout_sec = max(
            self.oda_timeout_sec,
            float(os.environ.get("DWG_ODA_LARGE_FILE_TIMEOUT_SEC", "420")),
        )
        self.max_entities_per_space = max(500, int(os.environ.get("DWG_ODA_MAX_ENTITIES_PER_SPACE", "400000")))
        self.default_entity_api_limit = max(200, int(os.environ.get("DWG_ENTITY_API_DEFAULT_LIMIT", "6000")))
        self.default_lineweight_mm = max(0.01, float(os.environ.get("DWG_LINEWEIGHT_DEFAULT_MM", str(DEFAULT_LINEWEIGHT_MM))))
        self.vectorize_cache_capacity = max(2, int(os.environ.get("DWG_VECTORIZE_CACHE_CAPACITY", "8")))
        self.oda_profile = os.environ.get("ODA_PROFILE", "").strip() or ("win-x64" if os.name == "nt" else "linux-x64")
        self.oda_version = os.environ.get("ODA_VERSION", "").strip() or "2026.03.25-v1"
        self.oda_runtime_root: Optional[str] = None
        self.oda_runtime_in_project = False
        self.oda_resolve_source: Optional[str] = None
        self.oda_read_exe = self._resolve_oda_read_exe(os.environ.get("ODA_READ_EXE", "").strip())
        self.enable_shx_outline = os.environ.get("DWG_ENABLE_SHX_OUTLINE", "1").strip().lower() not in ("0", "false", "no")
        self.enable_shx_outline_oda = os.environ.get("DWG_ENABLE_SHX_OUTLINE_ODA", "1").strip().lower() not in ("0", "false", "no")
        self.enable_shx_debug_match = os.environ.get("DWG_SHX_DEBUG_MATCH", "0").strip().lower() in ("1", "true", "yes")
        self.force_text_vectorize = os.environ.get("DWG_FORCE_TEXT_VECTORIZE", "0").strip().lower() in ("1", "true", "yes")
        self.oda_vectorize_resolve_source: Optional[str] = None
        self.oda_vectorize_exe = self._resolve_oda_vectorize_exe(os.environ.get("ODA_VECTORIZE_EXE", "").strip())
        self.font_dir = Path(os.environ.get("DWG_FONT_DIR", str((self.server_dir / "fonts").resolve()))).resolve()
        self.font_map_path = Path(
            os.environ.get("DWG_FONT_MAP_PATH", str((self.font_dir / "font-map.json").resolve()))
        ).resolve()
        self.font_map = self._load_font_map(self.font_map_path)
        self.font_search_roots = self._build_font_search_roots()
        self.shx_fallback_file = (self.font_dir / "@!hztxt万能字体.shx").resolve()
        self._vectorize_text_cache: Dict[str, Dict[str, List[Dict[str, object]]]] = {}
        self._vectorize_cache_order: List[str] = []
        self._oda_read_lock = threading.Lock()
        self._oda_vectorize_lock = threading.Lock()

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
        return resolve_oda_read_exe(self, env_path)

    def _resolve_oda_vectorize_exe(self, env_path: str) -> Optional[str]:
        return resolve_oda_vectorize_exe(self, env_path)

    def _build_font_search_roots(self) -> List[Path]:
        roots: List[Path] = []
        raw_roots = os.environ.get("DWG_FONT_DIRS", "").strip()
        if raw_roots:
            for part in raw_roots.split(os.pathsep):
                candidate = part.strip()
                if candidate:
                    roots.append(Path(candidate).resolve())
        roots.append(self.font_dir)
        if os.name == "nt":
            roots.append(Path(r"C:\Windows\Fonts"))
        else:
            roots.append(Path("/usr/share/fonts"))
            roots.append(Path("/usr/local/share/fonts"))

        deduped: List[Path] = []
        seen: Set[str] = set()
        for root in roots:
            key = str(root).lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(root)
        return deduped

    def _load_font_map(self, map_path: Path) -> Dict[str, str]:
        out: Dict[str, str] = {}
        if not map_path.exists():
            return out
        try:
            raw = json.loads(map_path.read_text(encoding="utf-8"))
        except Exception:
            return out
        if not isinstance(raw, dict):
            return out

        def put_item(key_raw: object, value_raw: object) -> None:
            key = _normalize_font_token(key_raw)
            if not key:
                return
            if isinstance(value_raw, dict):
                value = str(
                    value_raw.get("path")
                    or value_raw.get("file")
                    or value_raw.get("font_path")
                    or value_raw.get("font_file")
                    or ""
                ).strip()
            else:
                value = str(value_raw or "").strip()
            if not value:
                return
            out[key] = value

        for k, v in raw.items():
            if isinstance(v, dict) and "path" not in v and "file" not in v and "font_path" not in v and "font_file" not in v:
                for child_k, child_v in v.items():
                    put_item(child_k, child_v)
            else:
                put_item(k, v)
        return out

    def _resolve_font_file(self, font_hint: object) -> Optional[Path]:
        hint = str(font_hint or "").strip()
        if not hint:
            return None
        hint_path = Path(hint)
        candidates: List[Path] = []
        if hint_path.is_absolute():
            candidates.append(hint_path)
        key = _normalize_font_token(hint)
        mapped = self.font_map.get(key)
        if mapped:
            candidates.append(Path(mapped))

        name_only = hint_path.name if hint_path.name else hint
        stem = hint_path.stem or hint
        ext = hint_path.suffix.lower()
        for root in self.font_search_roots:
            candidates.append(root / name_only)
            if not ext:
                candidates.append(root / f"{stem}.ttf")
                candidates.append(root / f"{stem}.ttc")
                candidates.append(root / f"{stem}.otf")

        seen: Set[str] = set()
        for candidate in candidates:
            try:
                key_path = str(candidate).lower()
                if key_path in seen:
                    continue
                seen.add(key_path)
                if candidate.exists() and candidate.is_file():
                    return candidate.resolve()
            except Exception:
                continue
        return None

    def _decode_oda_bytes(self, data: bytes) -> str:
        return decode_oda_bytes(data)

    def _run_oda_read_dump(self, file_path: Path) -> str:
        return run_oda_read_dump(self, file_path, ExternalCoreError)

    def _is_oda_vectorize_available(self) -> bool:
        return is_oda_vectorize_available(self)

    def _run_oda_vectorize_dump(self, file_path: Path) -> str:
        return run_oda_vectorize_dump(self, file_path, ExternalCoreError)

    def _vectorize_cache_key(self, file_path: Path) -> str:
        return vectorize_cache_key(file_path)

    def _vectorize_cache_get(self, cache_key: str) -> Optional[Dict[str, List[Dict[str, object]]]]:
        return vectorize_cache_get(self, cache_key)

    def _vectorize_cache_put(self, cache_key: str, data: Dict[str, List[Dict[str, object]]]) -> None:
        vectorize_cache_put(self, cache_key, data)

    def _build_vectorize_parse_meta_from_primitives(self, *args, **kwargs):
        return dwg_text_vectorize._build_vectorize_parse_meta_from_primitives(self, *args, **kwargs)

    def _outline_point_key(self, *args, **kwargs):
        return dwg_text_vectorize._outline_point_key(self, *args, **kwargs)

    def _clean_polyline_points(self, *args, **kwargs):
        return dwg_text_vectorize._clean_polyline_points(self, *args, **kwargs)

    def _simplify_polyline_points(self, *args, **kwargs):
        return dwg_text_vectorize._simplify_polyline_points(self, *args, **kwargs)

    def _polygon_abs_area(self, *args, **kwargs):
        return dwg_text_vectorize._polygon_abs_area(self, *args, **kwargs)

    def _triangle_mesh_to_boundary_loops(self, *args, **kwargs):
        return dwg_text_vectorize._triangle_mesh_to_boundary_loops(self, *args, **kwargs)

    def _optimize_oda_text_outlines(self, *args, **kwargs):
        return dwg_text_vectorize._optimize_oda_text_outlines(self, *args, **kwargs)

    def _parse_vectorize_vertex(self, *args, **kwargs):
        return dwg_text_vectorize._parse_vectorize_vertex(self, *args, **kwargs)

    def _parse_oda_vectorize_text_primitives(self, *args, **kwargs):
        return dwg_text_vectorize._parse_oda_vectorize_text_primitives(self, *args, **kwargs)

    def _has_shx_text_entities(self, *args, **kwargs):
        return dwg_text_vectorize._has_shx_text_entities(self, *args, **kwargs)

    def _has_text_entities(self, *args, **kwargs):
        return dwg_text_vectorize._has_text_entities(self, *args, **kwargs)

    def _has_shx_style_hints(self, *args, **kwargs):
        return dwg_text_vectorize._has_shx_style_hints(self, *args, **kwargs)

    def _count_shx_text_fallback_entities(self, *args, **kwargs):
        return dwg_text_vectorize._count_shx_text_fallback_entities(self, *args, **kwargs)

    def _format_missing_font_names(self, *args, **kwargs):
        return dwg_text_vectorize._format_missing_font_names(*args, **kwargs)

    def _collect_missing_style_fonts(self, *args, **kwargs):
        return dwg_text_vectorize._collect_missing_style_fonts(self, *args, **kwargs)

    def _build_missing_font_warning(self, *args, **kwargs):
        return dwg_text_vectorize._build_missing_font_warning(self, *args, **kwargs)

    def _build_shx_font_resolution_warning(self, *args, **kwargs):
        return dwg_text_vectorize._build_shx_font_resolution_warning(self, *args, **kwargs)

    def _string_list(self, *args, **kwargs):
        return dwg_text_vectorize._string_list(*args, **kwargs)

    def _font_display_name(self, *args, **kwargs):
        return dwg_text_vectorize._font_display_name(*args, **kwargs)

    def _build_shx_diagnostics_from_fonts(self, *args, **kwargs):
        return dwg_text_vectorize._build_shx_diagnostics_from_fonts(self, *args, **kwargs)

    def _build_shx_status(self, *args, **kwargs):
        return dwg_text_vectorize._build_shx_status(self, *args, **kwargs)

    def _attach_oda_vectorized_text_primitives(self, *args, **kwargs):
        return dwg_text_vectorize._attach_oda_vectorized_text_primitives(self, *args, **kwargs)

    def _attach_oda_vectorized_text_primitives_with_debug(self, *args, **kwargs):
        return dwg_text_vectorize._attach_oda_vectorized_text_primitives_with_debug(self, *args, **kwargs)
    def _build_entity_from_oda(
        self,
        etype: str,
        handle: str,
        lines: List[str],
        space_id: str,
        dim_styles: Optional[Dict[str, Dict[str, object]]] = None,
        header_dim_defaults: Optional[Dict[str, object]] = None,
    ) -> Optional[Dict[str, object]]:
        return build_entity_from_oda_lines(
            etype=etype,
            handle=handle,
            lines=lines,
            space_id=space_id,
            dim_styles=dim_styles,
            header_dim_defaults=header_dim_defaults,
            context=OdaEntityBuildContext(
                bbox_from_points=_bbox_from_points,
                build_hatch_loop_points_from_edges=_build_hatch_loop_points_from_edges,
                clean_oda_text_value=_clean_oda_text_value,
                dimension_line_endpoints=_dimension_line_endpoints,
                dimension_subtype_from_kind=_dimension_subtype_from_kind,
                line_intersection_2d=_line_intersection_2d,
                line_segment_from_bbox=_line_segment_from_bbox,
                line_segment_from_bbox_and_origin=_line_segment_from_bbox_and_origin,
                lineweight_to_mm=_lineweight_to_mm,
                normalize_dim_var_label=_normalize_dim_var_label,
                normalize_dim_var_map=_normalize_dim_var_map,
                normalize_dimblk_name=_normalize_dimblk_name,
                parse_dim_var_value=_parse_dim_var_value,
                parse_float_value=_parse_float_value,
                parse_int_value=_parse_int_value,
                parse_label_value=_parse_label_value,
                parse_point_value=_parse_point_value,
                point_distance=_point_distance,
                point_on_ray=_point_on_ray,
                resolve_dimension_text_color=_resolve_dimension_text_color,
                resolve_dimension_text_mask_color=_resolve_dimension_text_mask_color,
                resolve_dimension_text_mask_mode=_resolve_dimension_text_mask_mode,
                resolve_rgb_color_decimal=_resolve_rgb_color_decimal,
            ),
        )

    def _insert_transform_from_entity(self, ent: Dict[str, object]) -> Affine2D:
        geom = ent.get("geom", {}) if isinstance(ent.get("geom"), dict) else {}
        pos = geom.get("position") if isinstance(geom.get("position"), dict) else {"x": 0.0, "y": 0.0, "z": 0.0}
        scale = geom.get("scale") if isinstance(geom.get("scale"), dict) else {}
        sx = float(scale.get("x", 1.0))
        sy = float(scale.get("y", 1.0))
        rot_deg = float(geom.get("rotation", 0.0))
        rad = math.radians(rot_deg)
        cos_r = math.cos(rad)
        sin_r = math.sin(rad)
        tx = float(pos.get("x", 0.0))
        ty = float(pos.get("y", 0.0))
        return (cos_r * sx, -sin_r * sy, sin_r * sx, cos_r * sy, tx, ty)

    def _style_extraction_context(self) -> StyleExtractionContext:
        return StyleExtractionContext(
            parse_label_value=_parse_label_value,
            parse_float_value=_parse_float_value,
            lineweight_to_mm=_lineweight_to_mm,
            detect_font_kind=_detect_font_kind,
            font_family_from_name=_font_family_from_name,
            normalize_dim_var_label=_normalize_dim_var_label,
            parse_dim_var_value=_parse_dim_var_value,
        )

    def _extract_layer_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        return extract_layer_styles(dump_text, self._style_extraction_context())

    def _extract_text_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        return extract_text_styles(dump_text, self._style_extraction_context())

    def _extract_linetype_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        return extract_linetype_styles(dump_text, self._style_extraction_context())

    def _extract_header_dim_defaults(self, dump_text: str) -> Dict[str, object]:
        return extract_header_dim_defaults(dump_text, self._style_extraction_context())

    def _extract_dim_styles(self, dump_text: str) -> Dict[str, Dict[str, object]]:
        return extract_dim_styles(dump_text, self._style_extraction_context())

    def _attach_text_font_meta(self, ent: Dict[str, object], text_styles: Dict[str, Dict[str, object]]) -> Dict[str, object]:
        et = str(ent.get("type", "")).upper()
        if not _is_text_entity_type(et) and et != "DIMENSION":
            return ent
        geom = ent.get("geom")
        if not isinstance(geom, dict):
            return ent
        style_obj = ent.get("style", {}) if isinstance(ent.get("style"), dict) else {}
        style_name = str(geom.get("style_name") or style_obj.get("text_style") or "").strip()
        style_rec = text_styles.get(style_name) if style_name else None

        font_name = str((style_rec or {}).get("font_name") or style_name or "").strip()
        font_family = str((style_rec or {}).get("font_family") or _font_family_from_name(font_name) or "").strip()
        font_kind = str((style_rec or {}).get("font_kind") or _detect_font_kind(font_name) or "unknown").strip().lower() or "unknown"
        if bool((style_rec or {}).get("shape_file", False)):
            font_kind = "shx"
        font_source = "text_style_table" if style_rec else ("entity_style_name" if style_name else "fallback")
        font_key_seed = style_name or font_name or font_family or "default"
        font_key = _sanitize_font_key(font_key_seed)

        geom_out = dict(geom)
        geom_out["font_key"] = font_key
        geom_out["font_style_name"] = style_name or None
        geom_out["font_name"] = font_name or None
        geom_out["font_family"] = font_family or None
        geom_out["font_kind"] = font_kind
        geom_out["font_source"] = font_source
        geom_out["shape_file"] = bool((style_rec or {}).get("shape_file", False))
        geom_out["text_vertical"] = bool((style_rec or {}).get("vertical", False))

        out = dict(ent)
        out["geom"] = geom_out
        return out

    def _layer_default_color_index(
        self,
        layer_name: str,
        layer_styles: Dict[str, Dict[str, object]],
    ) -> int:
        style = layer_styles.get(layer_name, {})
        idx_raw = style.get("color_index")
        if isinstance(idx_raw, (int, float)) and math.isfinite(float(idx_raw)):
            return int(idx_raw)
        parsed = _parse_aci_from_color_name(style.get("color"))
        if parsed is not None:
            return parsed
        return 7

    def _layer_default_lineweight_mm(
        self,
        layer_name: str,
        layer_styles: Dict[str, Dict[str, object]],
    ) -> float:
        style = layer_styles.get(layer_name, {})
        raw_mm = style.get("lineweight_mm")
        if isinstance(raw_mm, (int, float)) and math.isfinite(float(raw_mm)) and float(raw_mm) > 0:
            return float(raw_mm)
        raw = style.get("lineweight")
        lw_mm = _lineweight_to_mm(raw)
        if isinstance(lw_mm, float) and math.isfinite(lw_mm) and lw_mm > 0:
            return lw_mm
        return self.default_lineweight_mm

    def _resolve_effective_style(
        self,
        style_obj: Dict[str, object],
        layer_name: str,
        layer_styles: Dict[str, Dict[str, object]],
        parent_effective_color_index: Optional[int],
        parent_effective_color_rgb: Optional[str],
        parent_effective_lineweight_mm: Optional[float],
    ) -> Dict[str, object]:
        out = dict(style_obj)
        local_true_rgb = _parse_true_rgb_decimal(out.get("color"))
        local_idx: Optional[int] = None
        raw_idx = out.get("color_index")
        if isinstance(raw_idx, (int, float)) and math.isfinite(float(raw_idx)):
            local_idx = int(raw_idx)
        if local_idx is None:
            local_idx = _parse_aci_from_color_name(out.get("color"))
        if local_idx is None:
            local_idx = 256

        source = "entity"
        effective_rgb: Optional[str] = None
        if local_idx == 0:
            if parent_effective_color_index is not None:
                effective_idx = int(parent_effective_color_index)
                source = "byblock(parent)"
                effective_rgb = parent_effective_color_rgb
            else:
                effective_idx = self._layer_default_color_index(layer_name, layer_styles)
                source = "byblock(layer-fallback)"
        elif local_idx == 256:
            effective_idx = self._layer_default_color_index(layer_name, layer_styles)
            source = "bylayer"
        else:
            effective_idx = int(local_idx)
            source = "entity"
            effective_rgb = local_true_rgb

        out["effective_color_index"] = effective_idx
        out["effective_color"] = out.get("color") if effective_rgb else f"ACI {effective_idx}"
        if effective_rgb:
            out["effective_color_rgb"] = effective_rgb
        out["effective_color_source"] = source

        raw_lw = str(out.get("lineweight", "") or "").strip()
        lw_token = raw_lw.lower()
        explicit_lw_mm = _lineweight_to_mm(raw_lw)
        lw_source = "entity"
        if lw_token in ("", "default", "klnwtbylwdefault"):
            effective_lw_mm = self.default_lineweight_mm
            lw_source = "default"
        elif lw_token in ("bylayer", "klnwtbylayer"):
            effective_lw_mm = self._layer_default_lineweight_mm(layer_name, layer_styles)
            lw_source = "bylayer"
        elif lw_token in ("byblock", "klnwtbyblock"):
            if isinstance(parent_effective_lineweight_mm, (int, float)) and math.isfinite(float(parent_effective_lineweight_mm)) and float(parent_effective_lineweight_mm) > 0:
                effective_lw_mm = float(parent_effective_lineweight_mm)
                lw_source = "byblock(parent)"
            else:
                effective_lw_mm = self._layer_default_lineweight_mm(layer_name, layer_styles)
                lw_source = "byblock(layer-fallback)"
        elif isinstance(explicit_lw_mm, float) and math.isfinite(explicit_lw_mm) and explicit_lw_mm > 0:
            effective_lw_mm = explicit_lw_mm
            lw_source = "entity"
        else:
            effective_lw_mm = self.default_lineweight_mm
            lw_source = "default"

        out["effective_lineweight_mm"] = float(effective_lw_mm)
        out["effective_lineweight_source"] = lw_source
        return out

    def _transform_entity(self, ent: Dict[str, object], tf: Affine2D) -> Optional[Dict[str, object]]:
        return transform_entity(ent, tf)

    def _parse_oda_dump(
        self,
        dump_text: str,
    ) -> Tuple[
        List[Dict[str, object]],
        Dict[str, List[Dict[str, object]]],
        Dict[str, List[Dict[str, object]]],
        List[str],
        Dict[str, Dict[str, object]],
        Dict[str, Dict[str, object]],
        Dict[str, Dict[str, object]],
        Dict[str, object],
        Dict[str, Dict[str, object]],
    ]:
        spaces_by_id: Dict[str, Dict[str, object]] = {}
        entities_by_space: Dict[str, List[Dict[str, object]]] = {}
        block_refs_by_space: Dict[str, List[Dict[str, object]]] = {}
        warnings: List[str] = []
        layer_styles = self._extract_layer_styles(dump_text)
        linetype_styles = self._extract_linetype_styles(dump_text)
        text_styles = self._extract_text_styles(dump_text)
        dim_styles = self._extract_dim_styles(dump_text)
        header_dim_defaults = self._extract_header_dim_defaults(dump_text)

        block_parse = parse_oda_block_records(
            dump_text,
            OdaBlockParseContext(
                build_entity_from_oda=self._build_entity_from_oda,
                attach_text_font_meta=self._attach_text_font_meta,
                parse_label_value=_parse_label_value,
                parse_point_value=_parse_point_value,
                entity_start_re=_ENTITY_START_RE,
                dim_styles=dim_styles,
                header_dim_defaults=header_dim_defaults,
                text_styles=text_styles,
            ),
        )
        block_order = block_parse.block_order
        block_is_layout = block_parse.block_is_layout
        block_entities = block_parse.block_entities
        block_origin_by_name = block_parse.block_origin_by_name
        unresolved_insert_names: set[str] = set()
        cyclic_insert_names: set[str] = set()
        capped_spaces: set[str] = set()
        max_expand_depth = max(8, int(os.environ.get("DWG_BLOCK_EXPAND_MAX_DEPTH", "16")))

        layout_blocks_in_order = [name for name in block_order if block_is_layout.get(name, False)]
        model_block_name: Optional[str] = None
        for name in block_order:
            if name.strip().upper() == "*MODEL_SPACE":
                model_block_name = name
                break
        if model_block_name is None:
            for name in layout_blocks_in_order:
                if not name.strip().upper().startswith("*PAPER_SPACE"):
                    model_block_name = name
                    break
        if model_block_name is None and layout_blocks_in_order:
            model_block_name = layout_blocks_in_order[0]

        root_blocks: List[str] = []
        if model_block_name and model_block_name in block_entities:
            root_blocks.append(model_block_name)
        for name in layout_blocks_in_order:
            if name == model_block_name:
                continue
            root_blocks.append(name)
        if not root_blocks and model_block_name:
            root_blocks.append(model_block_name)
        if not root_blocks and block_order:
            root_blocks.append(block_order[0])

        block_context = BlockExpansionContext(
            block_entities=block_entities,
            block_origin_by_name=block_origin_by_name,
            layer_styles=layer_styles,
            entities_by_space=entities_by_space,
            block_refs_by_space=block_refs_by_space,
            warnings=warnings,
            unresolved_insert_names=unresolved_insert_names,
            cyclic_insert_names=cyclic_insert_names,
            capped_spaces=capped_spaces,
            max_entities_per_space=self.max_entities_per_space,
            max_expand_depth=max_expand_depth,
            resolve_effective_style=self._resolve_effective_style,
            insert_transform_from_entity=self._insert_transform_from_entity,
            transform_entity=self._transform_entity,
            compose_affine=_compose_affine,
            apply_affine=_apply_affine,
            affine_scales=_affine_scales,
            apply_bbox_affine=_apply_bbox_affine,
            block_ref_id_from_instance_path=_block_ref_id_from_instance_path,
        )

        def space_id_for_layout_block(name: str) -> str:
            return resolve_space_id_for_layout_block(
                name,
                model_block_name=model_block_name,
                spaces_by_id=spaces_by_id,
                space_from_block_name=_space_from_block_name,
            )

        block_name_lookup = make_block_name_lookup(block_entities)

        def resolve_block_table_name(raw_name: object) -> Optional[str]:
            return resolve_block_table_name_from_catalog(raw_name, block_entities, block_name_lookup)

        def expand_block_into_space(
            space_id: str,
            source_block_name: str,
            tf: Affine2D,
            stack: Tuple[str, ...],
            instance_path: Tuple[str, ...],
            parent_effective_color_index: Optional[int],
            parent_effective_color_rgb: Optional[str],
            parent_effective_lineweight_mm: Optional[float],
        ) -> None:
            expand_block_into_space_by_category(
                space_id=space_id,
                source_block_name=source_block_name,
                transform=tf,
                stack=stack,
                instance_path=instance_path,
                parent_effective_color_index=parent_effective_color_index,
                parent_effective_color_rgb=parent_effective_color_rgb,
                parent_effective_lineweight_mm=parent_effective_lineweight_mm,
                context=block_context,
                block_name_lookup=block_name_lookup,
            )

        def _dimension_block_world_tf(dim_geom: Dict[str, object], block_name: str) -> Optional[Affine2D]:
            block_position = dim_geom.get("dimension_block_position")
            if not isinstance(block_position, dict):
                block_position = {"x": 0.0, "y": 0.0, "z": 0.0}
            block_rotation = dim_geom.get("dimension_block_rotation")
            block_rotation_deg = float(block_rotation) if isinstance(block_rotation, (int, float)) else 0.0
            block_scale = dim_geom.get("dimension_block_scale")
            if not isinstance(block_scale, dict):
                block_scale = {"x": 1.0, "y": 1.0, "z": 1.0}
            synthetic_insert = {
                "geom": {
                    "position": block_position,
                    "rotation": block_rotation_deg,
                    "scale": {
                        "x": float(block_scale.get("x", 1.0)),
                        "y": float(block_scale.get("y", 1.0)),
                        "z": float(block_scale.get("z", 1.0)),
                    },
                }
            }
            insert_tf = self._insert_transform_from_entity(synthetic_insert)
            block_origin = block_origin_by_name.get(block_name, {"x": 0.0, "y": 0.0, "z": 0.0})
            child_origin_tf: Affine2D = (
                1.0,
                0.0,
                0.0,
                1.0,
                -float(block_origin.get("x", 0.0)),
                -float(block_origin.get("y", 0.0)),
            )
            return _compose_affine(insert_tf, child_origin_tf)

        dimension_block_primitive_context = DimensionBlockPrimitiveContext(
            block_entities=block_entities,
            block_origin_by_name=block_origin_by_name,
            layer_styles=layer_styles,
            resolve_block_table_name=resolve_block_table_name,
            resolve_effective_style=self._resolve_effective_style,
            insert_transform_from_entity=self._insert_transform_from_entity,
            transform_entity=self._transform_entity,
            entity_primitives=self._entity_primitives,
            compose_affine=_compose_affine,
            point_distance=_point_distance,
            parse_aci_from_color_name=_parse_aci_from_color_name,
            resolve_rgb_color_decimal=_resolve_rgb_color_decimal,
            lineweight_to_mm=_lineweight_to_mm,
        )
        dimension_arrow_repair_context = DimensionArrowRepairContext(
            point_distance=_point_distance,
            resolve_arrow_length=_resolve_arrow_length,
            distance_to_segment=_distance_to_segment,
            bbox_from_points=_bbox_from_points,
            line_intersection_2d=_line_intersection_2d,
        )

        def _collect_block_primitives_for_dimension(
            *,
            block_name: str,
            base_tf: Affine2D,
            parent_effective_color_index: Optional[int],
            parent_effective_color_rgb: Optional[str],
            parent_effective_lineweight_mm: Optional[float],
            stack: Tuple[str, ...],
        ) -> List[Dict[str, object]]:
            return collect_dimension_block_primitives(
                block_name=block_name,
                base_tf=base_tf,
                parent_effective_color_index=parent_effective_color_index,
                parent_effective_color_rgb=parent_effective_color_rgb,
                parent_effective_lineweight_mm=parent_effective_lineweight_mm,
                stack=stack,
                context=dimension_block_primitive_context,
            )

        def _dimension_block_repair_arrow_precision(
            dim_geom: Dict[str, object],
            primitives: List[Dict[str, object]],
        ) -> Tuple[List[Dict[str, object]], Dict[str, object]]:
            return repair_dimension_block_arrow_precision(dim_geom, primitives, dimension_arrow_repair_context)

        for block_name in root_blocks:
            sid = space_id_for_layout_block(block_name)
            root_origin = block_origin_by_name.get(block_name, {"x": 0.0, "y": 0.0, "z": 0.0})
            root_tf: Affine2D = (
                1.0,
                0.0,
                0.0,
                1.0,
                -float(root_origin.get("x", 0.0)),
                -float(root_origin.get("y", 0.0)),
            )
            expand_block_into_space(sid, block_name, root_tf, (block_name,), (), None, None, None)

        for sid, ents in entities_by_space.items():
            for ent in ents:
                if str(ent.get("type", "")).upper() != "DIMENSION":
                    continue
                geom = ent.get("geom")
                if not isinstance(geom, dict):
                    continue
                dim_block_name = str(geom.get("dimension_block_name") or "").strip()
                if not dim_block_name:
                    geom["dimension_block_status"] = "missing_name"
                    geom["dimension_block_failure_reason"] = "missing_dimension_block_name"
                    geom["dimension_block_primitive_count"] = 0
                    continue
                resolved_dim_block_name = resolve_block_table_name(dim_block_name)
                if not resolved_dim_block_name:
                    geom["dimension_block_status"] = "missing_block"
                    geom["dimension_block_failure_reason"] = f"block_not_found:{dim_block_name}"
                    geom["dimension_block_primitive_count"] = 0
                    continue
                if resolved_dim_block_name != dim_block_name:
                    geom["dimension_block_name_resolved"] = resolved_dim_block_name

                dim_tf = _dimension_block_world_tf(geom, resolved_dim_block_name)
                if dim_tf is None:
                    geom["dimension_block_status"] = "transform_failed"
                    geom["dimension_block_failure_reason"] = f"transform_failed:{resolved_dim_block_name}"
                    geom["dimension_block_primitive_count"] = 0
                    continue

                ent_style = ent.get("style", {}) if isinstance(ent.get("style"), dict) else {}
                parent_color_idx = ent_style.get("effective_color_index")
                if not isinstance(parent_color_idx, int):
                    parent_color_idx = None
                parent_color_rgb = str(
                    ent_style.get("effective_color_rgb")
                    or _parse_true_rgb_decimal(ent_style.get("color"))
                    or ""
                ).strip() or None
                parent_lw = ent_style.get("effective_lineweight_mm")
                if not isinstance(parent_lw, (int, float)) or not math.isfinite(float(parent_lw)) or float(parent_lw) <= 0:
                    parent_lw = None
                else:
                    parent_lw = float(parent_lw)

                dim_block_primitives = _collect_block_primitives_for_dimension(
                    block_name=resolved_dim_block_name,
                    base_tf=dim_tf,
                    parent_effective_color_index=parent_color_idx,
                    parent_effective_color_rgb=parent_color_rgb,
                    parent_effective_lineweight_mm=parent_lw,
                    stack=(resolved_dim_block_name,),
                )
                repair_info: Dict[str, object] = {}
                if dim_block_primitives:
                    dim_block_primitives, repair_info = _dimension_block_repair_arrow_precision(geom, dim_block_primitives)
                if not dim_block_primitives:
                    geom["dimension_block_status"] = "empty_block"
                    geom["dimension_block_failure_reason"] = f"no_renderable_primitives:{resolved_dim_block_name}"
                    geom["dimension_block_primitive_count"] = 0
                    continue

                text_primitive: Optional[Dict[str, object]] = None
                for prim in dim_block_primitives:
                    kind = str(prim.get("kind") or "").strip().lower()
                    if kind == "text":
                        prim["subtype"] = "dimension_text"
                        if text_primitive is None:
                            text_primitive = prim

                geom["dimension_block_primitives"] = dim_block_primitives
                geom["primitive_source"] = "dimension_block"
                geom["dimension_block_status"] = "applied"
                geom["dimension_block_failure_reason"] = None
                geom["dimension_block_primitive_count"] = len(dim_block_primitives)
                if repair_info:
                    geom["dimension_block_repair"] = repair_info

                if isinstance(text_primitive, dict):
                    text_pos = text_primitive.get("position")
                    if isinstance(text_pos, dict):
                        geom["text_position"] = text_pos
                    text_val = text_primitive.get("text")
                    if isinstance(text_val, str) and text_val.strip():
                        geom["text"] = text_val
                    text_height = text_primitive.get("height")
                    if isinstance(text_height, (int, float)) and math.isfinite(float(text_height)) and float(text_height) > 0:
                        geom["text_height"] = float(text_height)
                    text_color = text_primitive.get("color")
                    if text_color is not None:
                        geom["text_color"] = text_color
                    text_mask = text_primitive.get("text_mask")
                    if isinstance(text_mask, bool):
                        geom["text_mask"] = text_mask
                    text_mask_padding = text_primitive.get("text_mask_padding")
                    if isinstance(text_mask_padding, (int, float)) and math.isfinite(float(text_mask_padding)):
                        geom["text_mask_padding"] = float(text_mask_padding)
                    text_mask_color = text_primitive.get("text_mask_color")
                    if text_mask_color is not None:
                        geom["text_mask_color"] = text_mask_color
                    text_mask_use_canvas_bg = text_primitive.get("text_mask_use_canvas_bg")
                    if isinstance(text_mask_use_canvas_bg, bool):
                        geom["text_mask_use_canvas_bg"] = text_mask_use_canvas_bg

        if not spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}
        elif "model" not in spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}

        ordered_ids = sorted(spaces_by_id.keys(), key=lambda sid: (0 if sid == "model" else 1, sid))
        spaces = [spaces_by_id[sid] for sid in ordered_ids]
        block_catalog: Dict[str, Dict[str, object]] = {}
        for block_name in block_order:
            block_catalog[block_name] = {
                "name": block_name,
                "is_layout": bool(block_is_layout.get(block_name, False)),
                "entity_count": len(block_entities.get(block_name, [])),
                "origin": block_origin_by_name.get(block_name, {"x": 0.0, "y": 0.0, "z": 0.0}),
            }
        return (
            spaces,
            entities_by_space,
            block_refs_by_space,
            warnings,
            layer_styles,
            linetype_styles,
            text_styles,
            header_dim_defaults,
            {
                "dim_styles": dim_styles,
                "blocks": block_catalog,
            },
        )

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
            "parser_revision": DWG_CORE_PARSER_REV,
            "external_base_url": self.external_base_url or None,
            "external_prefix": self.external_prefix or None,
            "oda_read_exe": self.oda_read_exe,
            "oda_runtime_root": self.oda_runtime_root,
            "oda_runtime_in_project": self.oda_runtime_in_project,
            "oda_profile": self.oda_profile,
            "oda_version": self.oda_version,
            "oda_resolve_source": self.oda_resolve_source,
            "session_count": len(self.sessions),
            "timeouts": {
                "dwg_core_http_sec": self.external_timeout_sec,
                "oda_cli_sec": self.oda_timeout_sec,
                "oda_cli_retry_enabled": self.oda_timeout_retry_enabled,
                "oda_cli_retry_sec": self.oda_timeout_retry_sec,
                "oda_large_file_mb": self.oda_large_file_mb,
                "oda_large_file_sec": self.oda_large_file_timeout_sec,
            },
            "supports": {
                "direct_dwg": True,
                "spaces": True,
                "pick": True,
                "snap": True,
                "measure": True,
                "entities": True,
                "fonts": True,
                "shx_outline": self.enable_shx_outline,
                "shx_outline_oda": self._is_oda_vectorize_available(),
                "shx_debug_match": self.enable_shx_debug_match,
            },
            "fonts": {
                "font_dir": str(self.font_dir),
                "font_map_path": str(self.font_map_path),
                "font_map_count": len(self.font_map),
                "font_search_roots": [str(p) for p in self.font_search_roots],
                "shx_fallback_file": str(self.shx_fallback_file),
                "shx_fallback_exists": bool(self.shx_fallback_file.exists() and self.shx_fallback_file.is_file()),
                "shx_fallback_hits_total": int(sum(int(s.shx_fallback_hit_count) for s in self.sessions.values())),
                "shx_outline_enabled": self.enable_shx_outline,
                "shx_outline_oda_enabled": self.enable_shx_outline_oda,
                "force_text_vectorize": self.force_text_vectorize,
                "shx_debug_match_enabled": self.enable_shx_debug_match,
                "vectorize_cache_capacity": self.vectorize_cache_capacity,
                "vectorize_cache_size": len(self._vectorize_text_cache),
                "oda_vectorize_exe": self.oda_vectorize_exe,
                "oda_vectorize_exe_exists": bool(self._is_oda_vectorize_available()),
                "oda_vectorize_resolve_source": self.oda_vectorize_resolve_source,
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
            remote_shx_status = opened.get("shx_status") if isinstance(opened.get("shx_status"), dict) else {}
            outline_mode = str(
                remote_shx_status.get("outline_mode")
                or opened.get("shx_outline_mode")
                or "none"
            ).strip().lower() or "none"

            def _to_int(value: object, default: int = 0) -> int:
                try:
                    return int(value)  # type: ignore[arg-type]
                except Exception:
                    return default

            session = DwgDocSession(
                doc_id=doc_id,
                file_path=file_path,
                original_name=original_name,
                mode=mode,
                spaces=spaces,
                entities_by_space={},
                text_styles={},
                warnings=warnings,
                current_space=current_space,
                remote_doc_id=remote_doc_id,
            )
            session.shx_outline_mode = outline_mode
            session.shx_detected = bool(remote_shx_status.get("detected"))
            session.shx_true_outline = bool(remote_shx_status.get("true_outline"))
            session.shx_vectorize_attempted = bool(remote_shx_status.get("vectorize_attempted"))
            session.shx_vectorize_attached_count = _to_int(remote_shx_status.get("vectorize_attached_count"), 0)
            vectorize_error = remote_shx_status.get("vectorize_error")
            session.shx_vectorize_error = str(vectorize_error).strip() if vectorize_error else None
            session.shx_fallback_text_count = _to_int(remote_shx_status.get("fallback_text_count"), 0)
            session.shx_missing_original_fonts = self._string_list(remote_shx_status.get("missing_original_shx_fonts"))
            session.shx_resolved_original_fonts = self._string_list(remote_shx_status.get("resolved_original_shx_fonts"))
            fallback_name_raw = remote_shx_status.get("fallback_shx_file")
            session.shx_fallback_file_name = str(fallback_name_raw or "").strip() or None
            session.shx_fallback_hit_count = _to_int(remote_shx_status.get("fallback_hit_count"), 0)
            session.shx_diagnostics_unavailable = bool(remote_shx_status.get("diagnostics_unavailable"))
            session.shx_debug_match = (
                remote_shx_status.get("debug_match")
                if isinstance(remote_shx_status.get("debug_match"), dict)
                else None
            )
            session.view_state["remote_doc_id"] = remote_doc_id
            self.sessions[doc_id] = session

            return {
                "doc_id": doc_id,
                "mode": mode,
                "parser_revision": DWG_CORE_PARSER_REV,
                "spaces": spaces,
                "current_space": current_space,
                "warnings": warnings,
                "shx_status": self._build_shx_status(session),
            }

        if self.mode == "oda_cli":
            dump_text = self._run_oda_read_dump(file_path)
            (
                spaces,
                entities_by_space,
                block_refs_by_space,
                warnings,
                layer_styles,
                linetype_styles,
                text_styles,
                header_dim_defaults,
                semantic_tables,
            ) = self._parse_oda_dump(dump_text)
            dim_styles = (
                semantic_tables.get("dim_styles", {})
                if isinstance(semantic_tables.get("dim_styles"), dict)
                else {}
            )
            block_catalog = (
                semantic_tables.get("blocks", {})
                if isinstance(semantic_tables.get("blocks"), dict)
                else {}
            )
            if not spaces:
                spaces = [{"id": "model", "display_name": "Model", "kind": "model"}]
            current_space = "model" if any(s.get("id") == "model" for s in spaces) else str(spaces[0].get("id", "model"))

            shx_outline_mode = "none"
            has_text = self._has_text_entities(entities_by_space)
            has_shx_text = self._has_shx_text_entities(entities_by_space)
            has_shx_style_hints = self._has_shx_style_hints(text_styles)
            shx_detected = has_shx_text or has_shx_style_hints
            shx_vectorize_attempted = False
            shx_vectorize_attached_count = 0
            shx_vectorize_error: Optional[str] = None
            shx_debug_match: Optional[Dict[str, object]] = None
            should_try_vectorize = (
                has_text
                and self.enable_shx_outline
                and self._is_oda_vectorize_available()
            )
            if should_try_vectorize:
                shx_vectorize_attempted = True
                try:
                    cache_key = self._vectorize_cache_key(file_path)
                    vector_text_primitives = self._vectorize_cache_get(cache_key)
                    parse_meta: Dict[str, object]
                    cache_hit = vector_text_primitives is not None
                    if vector_text_primitives is None:
                        vector_dump = self._run_oda_vectorize_dump(file_path)
                        vector_text_primitives, parse_meta = self._parse_oda_vectorize_text_primitives(vector_dump)
                        self._vectorize_cache_put(cache_key, vector_text_primitives)
                    else:
                        parse_meta = self._build_vectorize_parse_meta_from_primitives(vector_text_primitives)

                    attached_count, attach_debug = self._attach_oda_vectorized_text_primitives_with_debug(
                        entities_by_space,
                        vector_text_primitives,
                        enable_debug=self.enable_shx_debug_match,
                    )
                    shx_vectorize_attached_count = attached_count
                    if self.enable_shx_debug_match:
                        shx_debug_match = {
                            **parse_meta,
                            **attach_debug,
                            "vectorize_cache_hit": cache_hit,
                            "vectorize_text_keys_count": len(vector_text_primitives),
                        }
                    if attached_count > 0:
                        shx_outline_mode = "oda_vectorize"
                    elif shx_detected:
                        shx_outline_mode = "stub"
                        warnings.append(
                            "SHX 轮廓提取未匹配到可替换文字实体，已回退为笔画模拟渲染。"
                        )
                except ExternalCoreError as exc:
                    shx_vectorize_error = str(exc)
                    if self.enable_shx_debug_match:
                        shx_debug_match = {
                            "vectorize_error": str(exc),
                            "vectorize_cache_hit": False,
                            "attach_candidate_entity_count": 0,
                            "matched_entity_count": 0,
                            "unmatched_entity_count": 0,
                        }
                    if shx_detected:
                        shx_outline_mode = "stub"
                        warnings.append(
                            f"SHX 轮廓提取失败（{exc}），已回退为笔画模拟渲染。"
                        )
            elif shx_detected and self.enable_shx_outline:
                shx_outline_mode = "stub"
            elif shx_detected:
                shx_outline_mode = "disabled"

            shx_true_outline = shx_outline_mode == "oda_vectorize" and shx_vectorize_attached_count > 0
            shx_fallback_text_count = self._count_shx_text_fallback_entities(entities_by_space) if shx_detected else 0
            shx_font_resolution_warning = self._build_shx_font_resolution_warning(
                text_styles=text_styles,
                shx_detected=shx_detected,
                shx_true_outline=shx_true_outline,
            )
            if shx_font_resolution_warning:
                warnings.append(shx_font_resolution_warning)
            missing_font_warning = self._build_missing_font_warning(text_styles)
            if missing_font_warning:
                warnings.append(missing_font_warning)

            total_entities = sum(len(v) for v in entities_by_space.values())
            if total_entities == 0:
                warnings.append("ODA 已加载 DWG，但尚未提取到可显示的受支持图元。")

            doc_id = str(uuid.uuid4())
            session = DwgDocSession(
                doc_id=doc_id,
                file_path=file_path,
                original_name=original_name,
                mode="oda_cli",
                spaces=spaces,
                entities_by_space=entities_by_space,
                block_refs_by_space=block_refs_by_space,
                layer_styles=layer_styles,
                linetype_styles=linetype_styles,
                text_styles=text_styles,
                dim_styles=dim_styles,
                header_dim_defaults=header_dim_defaults,
                block_catalog=block_catalog,
                warnings=warnings,
                shx_outline_mode=shx_outline_mode,
                shx_detected=shx_detected,
                shx_true_outline=shx_true_outline,
                shx_vectorize_attempted=shx_vectorize_attempted,
                shx_vectorize_attached_count=shx_vectorize_attached_count,
                shx_vectorize_error=shx_vectorize_error,
                shx_fallback_text_count=shx_fallback_text_count,
                shx_debug_match=shx_debug_match if self.enable_shx_debug_match else None,
                current_space=current_space,
            )
            fonts_preview = self._collect_session_fonts(session)
            shx_diag = self._build_shx_diagnostics_from_fonts(fonts_preview)
            session.shx_missing_original_fonts = self._string_list(shx_diag.get("missing_original_shx_fonts"))
            session.shx_resolved_original_fonts = self._string_list(shx_diag.get("resolved_original_shx_fonts"))
            fallback_file = str(shx_diag.get("fallback_shx_file") or "").strip() or None
            session.shx_fallback_file_name = fallback_file
            session.shx_fallback_hit_count = int(shx_diag.get("fallback_hit_count") or 0)
            session.shx_diagnostics_unavailable = bool(shx_diag.get("diagnostics_unavailable"))

            if session.shx_missing_original_fonts:
                missing_text = self._format_missing_font_names(session.shx_missing_original_fonts)
                fallback_note = f"，已使用后备字体 {session.shx_fallback_file_name}" if session.shx_fallback_file_name else ""
                warning_text = f"未命中原始 SHX 字体：{missing_text}{fallback_note}。"
                if warning_text not in warnings:
                    warnings.append(warning_text)
            elif session.shx_detected and not session.shx_true_outline and session.shx_resolved_original_fonts:
                warning_text = "原始 SHX 字体已命中，当前降级更可能由轮廓匹配失败导致。"
                if warning_text not in warnings:
                    warnings.append(warning_text)

            session.view_state["entity_count"] = total_entities
            self.sessions[doc_id] = session
            return {
                "doc_id": doc_id,
                "mode": session.mode,
                "parser_revision": DWG_CORE_PARSER_REV,
                "spaces": spaces,
                "current_space": current_space,
                "shx_outline_mode": shx_outline_mode,
                "warnings": warnings,
                "shx_status": self._build_shx_status(session),
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
            text_styles={},
            warnings=warnings,
        )
        self.sessions[doc_id] = session
        return {
            "doc_id": doc_id,
            "mode": session.mode,
            "parser_revision": DWG_CORE_PARSER_REV,
            "spaces": spaces,
            "current_space": session.current_space,
            "warnings": warnings,
            "shx_status": self._build_shx_status(session),
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
        offset: int = 0,
    ) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        space = space_id or session.current_space

        if self.mode == "external_http":
            params: Dict[str, object] = {"space_id": space}
            if limit is not None:
                params["limit"] = int(limit)
            if offset > 0:
                params["offset"] = int(offset)
            query = urllib_parse.urlencode(params)
            suffix = "/entities"
            if query:
                suffix += f"?{query}"
            return self._external_doc_request(session, "GET", suffix)

        entity_offset = max(0, int(offset or 0))
        if isinstance(limit, int):
            entity_limit = int(limit) if limit > 0 else self.max_entities_per_space
        else:
            entity_limit = self.default_entity_api_limit
        space_kind = "model" if str(space).strip().lower() == "model" else "layout"
        space_display_name = str(space)
        for space_rec in session.spaces:
            if not isinstance(space_rec, dict):
                continue
            if str(space_rec.get("id", "")).strip() != str(space):
                continue
            space_kind = str(space_rec.get("kind", space_kind))
            space_display_name = str(space_rec.get("display_name", space_display_name))
            break
        all_entities = list(session.entities_by_space.get(space, []))
        end_index = min(len(all_entities), entity_offset + entity_limit)
        sliced = [self._entity_with_primitives(ent, space_kind=space_kind) for ent in all_entities[entity_offset:end_index]]
        return {
            "doc_id": doc_id,
            "space_id": space,
            "space_context": {
                "id": space,
                "kind": space_kind,
                "display_name": space_display_name,
            },
            "entities": sliced,
            "total_count": len(all_entities),
            "offset": entity_offset,
            "limit": entity_limit,
            "truncated": end_index < len(all_entities),
            "style_tables": {
                "layers": session.layer_styles,
                "linetypes": session.linetype_styles,
                "text_styles": session.text_styles,
                "dim_styles": session.dim_styles,
                "header_dim_defaults": session.header_dim_defaults,
                "blocks": session.block_catalog,
            },
            "semantic_contract": {
                "tracks": ["raw_semantics", "normalized_semantics", "mapping_status", "provenance"],
                "primitive_fields": ["resolved", "provenance", "annotation_context", "style_ref"],
            },
        }

    def list_hierarchy(self, doc_id: str, space_id: Optional[str] = None) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        space = space_id or session.current_space

        if self.mode == "external_http":
            params: Dict[str, object] = {"space_id": space}
            query = urllib_parse.urlencode(params)
            suffix = "/hierarchy"
            if query:
                suffix += f"?{query}"
            return self._external_doc_request(session, "GET", suffix)

        def _render_state_for_entity(raw_obj: Dict[str, object]) -> Dict[str, object]:
            primitives = self._entity_primitives(raw_obj)
            primitive_count = len(primitives)
            return {
                "primitive_count": primitive_count,
                "renderable": primitive_count > 0,
                "source": "entity_primitives",
            }

        def _to_hierarchy_record(raw_obj: Dict[str, object], *, is_block_ref: bool) -> Dict[str, object]:
            entity_id = str(raw_obj.get("id", "")).strip()
            parent_raw = raw_obj.get("parent_block_id")
            parent_block_id = str(parent_raw).strip() if isinstance(parent_raw, str) and str(parent_raw).strip() else None
            etype = str(raw_obj.get("type", "UNKNOWN")).upper() or "UNKNOWN"
            layer = str(raw_obj.get("layer", "0"))
            bbox = raw_obj.get("bbox") if isinstance(raw_obj.get("bbox"), dict) else None
            handle = str(raw_obj.get("handle", "")).strip()
            geom = raw_obj.get("geom") if isinstance(raw_obj.get("geom"), dict) else {}
            block_name = str(geom.get("block_name", "")).strip() if is_block_ref else ""
            semantic_type = "block_ref" if is_block_ref else str(raw_obj.get("semantic_type") or self._entity_semantic_type(etype))
            semantic_subtype = (
                "BLOCK_REF"
                if is_block_ref
                else str(raw_obj.get("semantic_subtype") or self._entity_semantic_subtype(etype, geom, raw_obj.get("source_acdb_type")))
            )
            category_key = semantic_subtype or etype
            category_label = self._hierarchy_category_label(category_key)
            return {
                "id": entity_id,
                "type": etype,
                "layer": layer,
                "bbox": bbox,
                "handle": handle,
                "parent_block_id": parent_block_id,
                "block_name": block_name,
                "is_block_ref": is_block_ref,
                "semantic_type": semantic_type,
                "semantic_subtype": semantic_subtype,
                "category_key": category_key,
                "category_label": category_label,
                "render_state": (
                    {"primitive_count": 0, "renderable": True, "source": "block_ref"}
                    if is_block_ref
                    else _render_state_for_entity(raw_obj)
                ),
            }

        all_entities = [
            _to_hierarchy_record(ent, is_block_ref=False)
            for ent in session.entities_by_space.get(space, [])
            if isinstance(ent, dict)
        ]
        all_block_refs = [
            _to_hierarchy_record(ref, is_block_ref=True)
            for ref in session.block_refs_by_space.get(space, [])
            if isinstance(ref, dict)
        ]

        def _extract_handle(obj: Dict[str, object]) -> str:
            raw = str(obj.get("handle") or obj.get("id") or "").strip()
            if not raw:
                return ""
            if "@" in raw:
                raw = raw.split("@", 1)[0]
            if "/" in raw:
                raw = raw.rsplit("/", 1)[-1]
            return raw.upper()

        def _handle_sort_key(obj: Dict[str, object]) -> Tuple[int, int, str]:
            h = _extract_handle(obj)
            if not h:
                return (2, 0, "")
            try:
                return (0, int(h, 16), h)
            except Exception:
                return (1, 0, h)

        entities_by_parent: Dict[Optional[str], List[Dict[str, object]]] = {}
        for ent in all_entities:
            parent_raw = ent.get("parent_block_id")
            parent = str(parent_raw).strip() if isinstance(parent_raw, str) and str(parent_raw).strip() else None
            entities_by_parent.setdefault(parent, []).append(ent)

        block_refs_by_parent: Dict[Optional[str], List[Dict[str, object]]] = {}
        for ref in all_block_refs:
            parent_raw = ref.get("parent_block_id")
            parent = str(parent_raw).strip() if isinstance(parent_raw, str) and str(parent_raw).strip() else None
            block_refs_by_parent.setdefault(parent, []).append(ref)

        def _build_level(parent_block_id: Optional[str], visiting: set[str]) -> List[Dict[str, object]]:
            objs: List[Dict[str, object]] = []
            objs.extend(block_refs_by_parent.get(parent_block_id, []))
            objs.extend(entities_by_parent.get(parent_block_id, []))

            by_category: Dict[str, List[Dict[str, object]]] = {}
            for obj in objs:
                key = str(obj.get("category_key") or obj.get("type") or "UNKNOWN").upper() or "UNKNOWN"
                by_category.setdefault(key, []).append(obj)

            level_nodes: List[Dict[str, object]] = []
            parent_key = parent_block_id or "root"
            for cat_key in sorted(by_category.keys()):
                group_items = sorted(by_category[cat_key], key=_handle_sort_key)
                category_label = self._hierarchy_category_label(cat_key)
                item_nodes: List[Dict[str, object]] = []
                for item in group_items:
                    entity_id = str(item.get("id", "")).strip()
                    is_block_ref = bool(item.get("is_block_ref"))
                    bbox = item.get("bbox") if isinstance(item.get("bbox"), dict) else None
                    handle = _extract_handle(item)
                    block_name = str(item.get("block_name", "")).strip()
                    label = handle or entity_id or "--"
                    if is_block_ref and block_name:
                        label = f"{label} ({block_name})"
                    child_nodes: List[Dict[str, object]] = []
                    if is_block_ref and entity_id and entity_id not in visiting:
                        next_visiting = set(visiting)
                        next_visiting.add(entity_id)
                        child_nodes = _build_level(entity_id, next_visiting)
                    item_nodes.append(
                        {
                            "node_id": f"{'block' if is_block_ref else 'entity'}:{entity_id}",
                            "node_kind": "block_ref" if is_block_ref else "entity",
                            "label": label,
                            "type": str(item.get("type", "")).upper() or "UNKNOWN",
                            "semantic_type": str(item.get("semantic_type", "unknown")),
                            "semantic_subtype": str(item.get("semantic_subtype", "UNKNOWN")),
                            "entity_subtype": str(item.get("semantic_subtype", "UNKNOWN")),
                            "layer": str(item.get("layer", "0")),
                            "handle": handle or None,
                            "entity_id": entity_id,
                            "parent_block_id": parent_block_id,
                            "bbox": bbox,
                            "render_state": item.get("render_state"),
                            "children": child_nodes,
                        }
                    )
                level_nodes.append(
                    {
                        "node_id": f"category:{parent_key}:{cat_key}",
                        "node_kind": "category",
                        "label": category_label,
                        "type": cat_key,
                        "semantic_type": "category",
                        "semantic_subtype": cat_key,
                        "category_key": cat_key,
                        "category_label": category_label,
                        "layer": None,
                        "handle": None,
                        "entity_id": None,
                        "parent_block_id": parent_block_id,
                        "bbox": None,
                        "render_state": None,
                        "children": item_nodes,
                    }
                )
            return level_nodes

        tree = _build_level(None, set())
        return {
            "doc_id": doc_id,
            "space_id": space,
            "nodes": tree,
            "total_entity_count": len(all_entities),
            "total_block_ref_count": len(all_block_refs),
        }

    def _collect_session_fonts(self, session: DwgDocSession) -> List[Dict[str, object]]:
        aggregated: Dict[str, Dict[str, object]] = {}
        font_files: Dict[str, str] = {}
        shx_fallback_hits = 0

        for entities in session.entities_by_space.values():
            for ent in entities:
                if not _is_text_entity_type(ent.get("type")):
                    continue
                geom = ent.get("geom") if isinstance(ent.get("geom"), dict) else {}
                if not isinstance(geom, dict):
                    continue

                font_key = _sanitize_font_key(
                    geom.get("font_key")
                    or geom.get("font_style_name")
                    or geom.get("font_name")
                    or geom.get("font_family")
                )
                style_name = str(geom.get("font_style_name") or geom.get("style_name") or "").strip() or None
                font_name = str(geom.get("font_name") or style_name or "").strip() or None
                font_family = str(geom.get("font_family") or _font_family_from_name(font_name or style_name or "")).strip() or None
                font_kind = str(geom.get("font_kind") or _detect_font_kind(font_name or "")).strip().lower() or "unknown"
                font_source = str(geom.get("font_source") or ("text_style_table" if style_name else "fallback")).strip() or "fallback"

                record = aggregated.get(font_key)
                if record is None:
                    record = {
                        "key": font_key,
                        "style_name": style_name,
                        "name": font_name,
                        "family": font_family,
                        "kind": font_kind,
                        "source": font_source,
                        "usage_count": 0,
                    }
                    aggregated[font_key] = record
                record["usage_count"] = int(record.get("usage_count", 0)) + 1

        fonts: List[Dict[str, object]] = []
        for key, record in aggregated.items():
            name_or_style = record.get("name") or record.get("style_name") or record.get("family") or key
            resolved = self._resolve_font_file(name_or_style)
            kind = str(record.get("kind", "unknown")).lower()
            fallback_shx_hit = False
            if (
                not resolved
                and kind == "shx"
                and self.enable_shx_outline
                and self.shx_fallback_file.exists()
                and self.shx_fallback_file.is_file()
            ):
                resolved = self.shx_fallback_file
                fallback_shx_hit = True
                shx_fallback_hits += 1
            file_url: Optional[str] = None
            reason: Optional[str] = None
            available = False
            shx_mode = str(session.shx_outline_mode or "none").strip().lower()
            if resolved and resolved.exists():
                resolved_ext_kind = _detect_font_kind(str(resolved))
                if kind == "unknown":
                    kind = resolved_ext_kind
                if kind in ("ttf", "ttc", "otf"):
                    available = True
                    file_url = f"/api/dwg/{session.doc_id}/fonts/{urllib_parse.quote(key, safe='')}/file"
                    font_files[key] = str(resolved)
                elif kind == "shx":
                    if self.enable_shx_outline:
                        available = True
                        if shx_mode == "oda_vectorize":
                            if fallback_shx_hit:
                                reason = f"SHX rendered by ODA vectorized glyph outlines (fallback: {self.shx_fallback_file.name})."
                            else:
                                reason = "SHX rendered by ODA vectorized glyph outlines."
                        else:
                            if fallback_shx_hit:
                                reason = f"SHX rendered by server-side stroke outline emulation (fallback: {self.shx_fallback_file.name})."
                            else:
                                reason = "SHX rendered by server-side stroke outline emulation."
                    else:
                        reason = "SHX font detected: frontend fallback font will be used."
                else:
                    reason = "Unsupported font file type."
            else:
                if kind == "shx":
                    if self.enable_shx_outline:
                        available = True
                        if shx_mode == "oda_vectorize":
                            reason = "SHX rendered by ODA vectorized glyph outlines (font file optional)."
                        else:
                            reason = "SHX rendered by server-side stroke outline emulation (font file not required)."
                    else:
                        reason = "SHX font file not found on server."
                else:
                    reason = "Font file not found on server."

            fonts.append(
                {
                    "key": key,
                    "style_name": record.get("style_name"),
                    "name": record.get("name"),
                    "family": record.get("family"),
                    "kind": kind,
                    "source": record.get("source"),
                    "usage_count": int(record.get("usage_count", 0)),
                    "available": available,
                    "file_name": Path(font_files[key]).name if available and key in font_files else None,
                    "file_url": file_url,
                    "reason": reason,
                    "fallback_shx_hit": fallback_shx_hit,
                    "fallback_shx_file_name": self.shx_fallback_file.name if fallback_shx_hit else None,
                }
            )

        fonts.sort(key=lambda f: (str(f.get("kind", "")), str(f.get("style_name", "")), str(f.get("name", ""))))
        session.font_files = font_files
        session.shx_fallback_hit_count = shx_fallback_hits
        return fonts

    def list_fonts(self, doc_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            try:
                return self._external_doc_request(session, "GET", "/fonts")
            except ExternalCoreError:
                # Keep UI usable even if remote core does not provide a dedicated /fonts endpoint.
                return {"doc_id": doc_id, "fonts": [], "count": 0, "warnings": ["Remote DWG core did not expose /fonts endpoint."]}

        fonts = self._collect_session_fonts(session)
        shx_diagnostics = self._build_shx_diagnostics_from_fonts(fonts)
        session.shx_missing_original_fonts = self._string_list(shx_diagnostics.get("missing_original_shx_fonts"))
        session.shx_resolved_original_fonts = self._string_list(shx_diagnostics.get("resolved_original_shx_fonts"))
        session.shx_fallback_file_name = str(shx_diagnostics.get("fallback_shx_file") or "").strip() or None
        session.shx_fallback_hit_count = int(shx_diagnostics.get("fallback_hit_count") or 0)
        session.shx_diagnostics_unavailable = bool(shx_diagnostics.get("diagnostics_unavailable"))

        warnings: List[str] = []
        if any(str(f.get("kind")) == "shx" for f in fonts):
            if self.enable_shx_outline:
                if str(session.shx_outline_mode).strip().lower() == "oda_vectorize":
                    warnings.append("SHX 字体当前由 ODA 真实轮廓渲染。")
                else:
                    warnings.append("SHX 字体当前由服务端笔画模拟渲染。")
            else:
                warnings.append("SHX 字体当前由前端降级字体渲染。")

        if session.shx_missing_original_fonts:
            missing_text = self._format_missing_font_names(session.shx_missing_original_fonts)
            fallback_note = f"已使用后备字体 {session.shx_fallback_file_name}。" if session.shx_fallback_file_name else "未检测到后备 SHX 字体。"
            warnings.append(f"未命中原始 SHX 字体：{missing_text}。{fallback_note}")
        elif bool(session.shx_detected) and not bool(session.shx_true_outline) and session.shx_resolved_original_fonts:
            warnings.append("原始 SHX 字体均已命中，当前降级更可能由轮廓匹配失败导致。")

        return {
            "doc_id": doc_id,
            "fonts": fonts,
            "count": len(fonts),
            "warnings": warnings,
            "shx_outline_mode": session.shx_outline_mode,
            "shx_diagnostics": shx_diagnostics,
            "shx_fallback_file": str(self.shx_fallback_file),
            "shx_fallback_exists": bool(self.shx_fallback_file.exists() and self.shx_fallback_file.is_file()),
            "shx_fallback_hit_count": int(session.shx_fallback_hit_count),
        }

    def get_font_file(self, doc_id: str, font_key: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None
        key = _sanitize_font_key(font_key)
        if key not in session.font_files:
            # Lazy refresh once to avoid stale cache issues.
            self._collect_session_fonts(session)
        path_raw = session.font_files.get(key)
        if not path_raw:
            return None
        p = Path(path_raw)
        if not p.exists() or not p.is_file():
            return None
        return {"doc_id": doc_id, "font_key": key, "path": p}

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

    def _build_shx_outline_primitives(self, geom: Dict[str, object]) -> List[Dict[str, object]]:
        text = str(geom.get("text", ""))
        if not text:
            return []
        position = geom.get("position")
        if not isinstance(position, dict):
            return []
        lines = text.replace("\r", "").split("\n")
        if not lines:
            return []

        is_mtext = bool(geom.get("is_mtext", False))
        text_vertical = bool(geom.get("text_vertical", False))
        height_source = geom.get("height") if is_mtext or text_vertical else geom.get("actual_height", geom.get("height", 100.0))
        try:
            height = float(height_source)
        except Exception:
            height = 100.0
        if not math.isfinite(height) or height <= 1e-9:
            return []
        try:
            width_factor = float(geom.get("width_factor", 1.0))
        except Exception:
            width_factor = 1.0
        if not math.isfinite(width_factor) or width_factor <= 0:
            width_factor = 1.0
        try:
            oblique_deg = float(geom.get("oblique", 0.0))
        except Exception:
            oblique_deg = 0.0
        try:
            rotation_deg = float(geom.get("rotation", 0.0))
        except Exception:
            rotation_deg = 0.0
        mirrored_x = bool(geom.get("mirrored_x", False))
        mirrored_y = bool(geom.get("mirrored_y", False))
        shear = math.tan(math.radians(oblique_deg))
        rot_rad = math.radians(rotation_deg)
        cos_r = math.cos(rot_rad)
        sin_r = math.sin(rot_rad)

        base_x = float(position.get("x", 0.0))
        base_y = float(position.get("y", 0.0))
        base_z = float(position.get("z", 0.0))

        line_gap = height * (1.22 if is_mtext else 1.0)
        char_w = height * 0.62 * width_factor
        advance = height * 0.72 * width_factor
        try:
            target_width = float(geom.get("actual_width", 0.0))
        except Exception:
            target_width = 0.0
        max_line_len = max((len(line) for line in lines), default=0)
        natural_width = max(0.0, max_line_len * advance)
        fit_x_scale = 1.0
        if (
            not text_vertical
            and not is_mtext
            and abs(math.sin(rot_rad)) < 0.985
            and
            math.isfinite(target_width)
            and target_width > 1e-9
            and math.isfinite(natural_width)
            and natural_width > 1e-9
            and str(geom.get("text_extents_source") or "").strip().lower() in ("oda_bbox", "oda_actual_width")
        ):
            fit_x_scale = max(1e-6, min(1000.0, target_width / natural_width))

        outlines: List[Dict[str, object]] = []
        for line_index, line in enumerate(lines):
            x_cursor = 0.0
            y_offset = -line_index * line_gap
            for char_index, ch in enumerate(line):
                glyph = _shx_char_strokes(ch)
                if glyph is None:
                    # Unknown character, let frontend text fallback render this entity.
                    return []
                if glyph:
                    for stroke in glyph:
                        if len(stroke) < 2:
                            continue
                        points: List[Dict[str, float]] = []
                        for px, py in stroke:
                            x_local = x_cursor + px * char_w
                            y_local = y_offset + py * height
                            if text_vertical:
                                x_local = line_index * line_gap + px * char_w
                                y_local = -(char_index * line_gap) + py * height
                            x_local *= fit_x_scale
                            if mirrored_x:
                                x_local = -x_local
                            if mirrored_y:
                                y_local = -y_local
                            x_sheared = x_local + shear * y_local
                            y_sheared = y_local
                            xr = x_sheared * cos_r - y_sheared * sin_r
                            yr = x_sheared * sin_r + y_sheared * cos_r
                            points.append({"x": base_x + xr, "y": base_y + yr, "z": base_z})
                        if len(points) >= 2:
                            outlines.append(
                                {
                                    "kind": "polyline",
                                    "points": points,
                                    "closed": False,
                                    "subtype": "shx_outline",
                                }
                            )
                if not text_vertical:
                    x_cursor += advance
        return outlines

    def _primitive_build_context(self) -> PrimitiveBuildContext:
        return PrimitiveBuildContext(
            enable_shx_outline=self.enable_shx_outline,
            build_shx_outline_primitives=self._build_shx_outline_primitives,
            resolve_entity_text_color=_resolve_entity_text_color,
            entity_semantic_subtype=self._entity_semantic_subtype,
            resolve_dimension_display_text=_resolve_dimension_display_text,
        )

    def _entity_primitives(self, ent: Dict[str, object]) -> List[Dict[str, object]]:
        return build_entity_primitives(ent, self._primitive_build_context())

    def _dimension_payload_context(self) -> DimensionPayloadContext:
        return DimensionPayloadContext(
            resolve_dimension_display_text=_resolve_dimension_display_text,
            resolve_rgb_color_decimal=_resolve_rgb_color_decimal,
            parse_aci_from_color_name=_parse_aci_from_color_name,
            point_distance=_point_distance,
            distance_to_segment=_distance_to_segment,
        )

    def _entity_semantic_type(self, ent_type: object) -> str:
        return entity_semantic_type(ent_type)

    def _entity_semantic_subtype(
        self,
        ent_type: object,
        geom: Optional[Dict[str, object]] = None,
        source_acdb_type: object = None,
    ) -> str:
        return entity_semantic_subtype(ent_type, geom, source_acdb_type)

    def _hierarchy_category_label(self, category_key: object) -> str:
        return hierarchy_category_label(category_key)

    def _build_dimension_payload(
        self,
        geom: Dict[str, object],
        primitives: List[Dict[str, object]],
    ) -> Dict[str, object]:
        return build_dimension_payload(geom, primitives, self._dimension_payload_context())

    @staticmethod
    def _has_semantic_value(value: object) -> bool:
        return has_semantic_value(value)

    def _required_semantic_keys(self, ent_type: str) -> List[str]:
        return required_semantic_keys(ent_type)

    def _build_mapping_status(
        self,
        *,
        ent_type: str,
        raw_semantics: Dict[str, object],
        normalized_semantics: Dict[str, object],
        provenance: Dict[str, object],
    ) -> Dict[str, object]:
        return build_mapping_status(
            ent_type=ent_type,
            raw_semantics=raw_semantics,
            normalized_semantics=normalized_semantics,
            provenance=provenance,
        )

    def _decorate_primitives_with_semantics(
        self,
        *,
        ent_type: str,
        primitives: List[Dict[str, object]],
        normalized_semantics: Dict[str, object],
        provenance: Dict[str, object],
        annotation_context: Dict[str, object],
        style_ref: Dict[str, object],
    ) -> List[Dict[str, object]]:
        return decorate_primitives_with_semantics(
            ent_type=ent_type,
            primitives=primitives,
            normalized_semantics=normalized_semantics,
            provenance=provenance,
            annotation_context=annotation_context,
            style_ref=style_ref,
        )

    def _entity_with_primitives(
        self,
        ent: Dict[str, object],
        *,
        space_kind: Optional[str] = None,
    ) -> Dict[str, object]:
        geom = ent.get("geom")
        if not isinstance(geom, dict):
            return ent
        out = dict(ent)
        geom_out = dict(geom)
        geom_out["source_type"] = str(geom_out.get("source_type") or str(ent.get("type", "")).upper())
        ent_type = str(ent.get("type", "")).upper()
        primitives = self._entity_primitives(ent)

        style_obj = ent.get("style", {}) if isinstance(ent.get("style"), dict) else {}
        color_index_raw = style_obj.get("color_index")
        if not isinstance(color_index_raw, (int, float)) or not math.isfinite(float(color_index_raw)):
            color_index_raw = _parse_aci_from_color_name(style_obj.get("color"))
        color_index_effective = style_obj.get("effective_color_index")
        if not isinstance(color_index_effective, (int, float)) or not math.isfinite(float(color_index_effective)):
            color_index_effective = color_index_raw
        lineweight_mm_effective = style_obj.get("effective_lineweight_mm")
        if not isinstance(lineweight_mm_effective, (int, float)) or not math.isfinite(float(lineweight_mm_effective)):
            lineweight_mm_effective = _lineweight_to_mm(style_obj.get("lineweight")) or self.default_lineweight_mm

        dim_kind = _normalize_dimension_kind(geom_out.get("dim_kind")) if ent_type == "DIMENSION" else ""
        raw_semantics: Dict[str, object] = {
            "layer": ent.get("layer"),
            "color_index": color_index_raw,
            "color": style_obj.get("color"),
            "lineweight": style_obj.get("lineweight"),
            "linetype": style_obj.get("linetype"),
            "text_style": style_obj.get("text_style") or geom_out.get("style_name") or geom_out.get("text_style"),
            "text": geom_out.get("text"),
            "text_position": geom_out.get("position") if _is_text_entity_type(ent_type) else geom_out.get("text_position"),
            "text_height": geom_out.get("height") if _is_text_entity_type(ent_type) else geom_out.get("text_height"),
            "dimension_style": geom_out.get("dimension_style"),
            "dim_kind": dim_kind if ent_type == "DIMENSION" else "",
            "arrow_block1": geom_out.get("arrow_block1") if ent_type == "DIMENSION" else None,
            "arrow_block2": geom_out.get("arrow_block2") if ent_type == "DIMENSION" else None,
            "text_mask": geom_out.get("text_mask"),
            "text_mask_color": geom_out.get("text_mask_color"),
            "primitive_count": len(primitives),
        }
        normalized_semantics: Dict[str, object] = {
            "layer": str(ent.get("layer") or "0"),
            "color_index": int(color_index_effective) if isinstance(color_index_effective, (int, float)) else None,
            "color_rgb": _resolve_rgb_color_decimal(
                style_obj.get("effective_color_rgb")
                or style_obj.get("effective_color")
                or style_obj.get("color")
                or style_obj.get("effective_color_index")
                or style_obj.get("color_index")
            ),
            "lineweight_mm": float(lineweight_mm_effective) if isinstance(lineweight_mm_effective, (int, float)) else self.default_lineweight_mm,
            "linetype": str(style_obj.get("linetype") or "ByLayer"),
            "text_style": str(style_obj.get("text_style") or geom_out.get("style_name") or geom_out.get("text_style") or "").strip() or None,
            "text": _clean_oda_text_value(geom_out.get("text")),
            "text_position": geom_out.get("position") if _is_text_entity_type(ent_type) else geom_out.get("text_position"),
            "text_height": (
                float(geom_out.get("height"))
                if _is_text_entity_type(ent_type) and isinstance(geom_out.get("height"), (int, float))
                else float(geom_out.get("text_height"))
                if isinstance(geom_out.get("text_height"), (int, float))
                else None
            ),
            "dimension_style": str(geom_out.get("dimension_style") or "").strip() or None,
            "dim_kind": dim_kind if ent_type == "DIMENSION" else None,
            "arrow_block1": str(geom_out.get("arrow_block1") or geom_out.get("arrow_block") or "").strip() or None,
            "arrow_block2": str(geom_out.get("arrow_block2") or geom_out.get("arrow_block") or "").strip() or None,
            "text_mask": bool(geom_out.get("text_mask", False)),
            "text_mask_color": _resolve_rgb_color_decimal(geom_out.get("text_mask_color")),
            "primitive_count": len(primitives),
            "primitive_source": str(geom_out.get("primitive_source") or "entity_geom"),
        }
        provenance: Dict[str, object] = {
            "layer": "entity.layer",
            "color_index": style_obj.get("effective_color_source") or "entity.style.color",
            "color_rgb": "resolved(color_index|color)",
            "lineweight_mm": style_obj.get("effective_lineweight_source") or "entity.style.lineweight",
            "linetype": "entity.style.linetype|ByLayer",
            "text_style": geom_out.get("font_source") or ("entity.style.text_style" if normalized_semantics.get("text_style") else ""),
            "text": "entity.geom.text",
            "text_position": "entity.geom.position|entity.geom.text_position",
            "text_height": "entity.geom.height|entity.geom.text_height",
            "dimension_style": "entity.geom.dimension_style",
            "dim_kind": "entity.geom.dim_kind",
            "arrow_block1": "entity.geom.arrow_block1|arrow_block",
            "arrow_block2": "entity.geom.arrow_block2|arrow_block",
            "text_mask": "entity.geom.text_mask",
            "text_mask_color": "entity.geom.text_mask_color",
            "primitive_count": "entity_primitives",
        }
        annotation_context = {
            "space_id": str(ent.get("space_id") or ""),
            "space_kind": str(space_kind or ("model" if str(ent.get("space_id") or "").strip().lower() == "model" else "layout")),
            "annotation_scale": geom_out.get("annotation_scale"),
            "viewport_scale": geom_out.get("viewport_scale"),
            "unit_scale": geom_out.get("unit_scale"),
            "dim_kind": dim_kind if ent_type == "DIMENSION" else None,
        }
        style_ref = {
            "layer": str(ent.get("layer") or "0"),
            "linetype": normalized_semantics.get("linetype"),
            "text_style": normalized_semantics.get("text_style"),
            "dim_style": normalized_semantics.get("dimension_style"),
        }
        mapping_status = self._build_mapping_status(
            ent_type=ent_type,
            raw_semantics=raw_semantics,
            normalized_semantics=normalized_semantics,
            provenance=provenance,
        )

        primitives = self._decorate_primitives_with_semantics(
            ent_type=ent_type,
            primitives=primitives,
            normalized_semantics=normalized_semantics,
            provenance=provenance,
            annotation_context=annotation_context,
            style_ref=style_ref,
        )
        if primitives:
            geom_out["primitives"] = primitives
        if ent_type == "DIMENSION":
            geom_out["dimension_payload"] = self._build_dimension_payload(geom_out, primitives)
        semantic_type = str(out.get("semantic_type") or self._entity_semantic_type(out.get("type"))).strip().lower() or "unknown"
        semantic_subtype = (
            str(out.get("semantic_subtype") or "").strip()
            or self._entity_semantic_subtype(out.get("type"), geom_out, out.get("source_acdb_type"))
        )
        out["semantic_type"] = semantic_type
        out["semantic_subtype"] = semantic_subtype
        out["raw_semantics"] = raw_semantics
        out["normalized_semantics"] = normalized_semantics
        out["mapping_status"] = mapping_status
        out["annotation_context"] = annotation_context
        out["style_ref"] = style_ref
        out["provenance"] = provenance
        out["geom"] = geom_out
        return out

    def _iter_space_entities(self, session: DwgDocSession, space_id: str):
        return iter_space_entities(session, space_id)

    def _iter_space_block_refs(self, session: DwgDocSession, space_id: str):
        return iter_space_block_refs(session, space_id)

    def _iter_entity_segments(self, ent: Dict[str, object]) -> List[Tuple[Dict[str, float], Dict[str, float]]]:
        return iter_entity_segments(ent, self._entity_primitives)

    def _iter_entity_text_points(self, ent: Dict[str, object]) -> List[Dict[str, float]]:
        return iter_entity_text_points(ent, self._entity_primitives)

    def pick(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None
        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/pick", payload)
        return pick_in_session(doc_id=doc_id, session=session, payload=payload, entity_primitives=self._entity_primitives)

    def snap(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None
        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/snap", payload)
        return snap_in_session(doc_id=doc_id, session=session, payload=payload, entity_primitives=self._entity_primitives)

    def measure(self, doc_id: str, payload: Dict[str, object]) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None
        if self.mode == "external_http":
            return self._external_doc_request(session, "POST", "/measure", payload)
        return measure_payload(doc_id, payload)

    def get_entity(self, doc_id: str, entity_id: str) -> Optional[Dict[str, object]]:
        session = self.get_session(doc_id)
        if not session:
            return None

        if self.mode == "external_http":
            entity_path = f"/entity/{urllib_parse.quote(entity_id, safe='')}"
            return self._external_doc_request(session, "GET", entity_path)

        def _with_dimension_context(entity_obj: Dict[str, object]) -> Dict[str, object]:
            out_entity = self._entity_with_primitives(entity_obj)
            try:
                if str(out_entity.get("type", "")).upper() != "DIMENSION":
                    return out_entity
                geom = out_entity.get("geom")
                if not isinstance(geom, dict):
                    return out_entity
                style_name = str(geom.get("dimension_style") or "").strip()
                style_rec = session.dim_styles.get(style_name, {}) if style_name else {}
                geom_out = dict(geom)
                geom_out["dim_style_record"] = dict(style_rec) if isinstance(style_rec, dict) else {}
                geom_out["dim_header_defaults"] = (
                    dict(session.header_dim_defaults)
                    if isinstance(session.header_dim_defaults, dict)
                    else {}
                )
                out = dict(out_entity)
                out["geom"] = geom_out
                return out
            except Exception:
                return out_entity

        for space_entities in session.entities_by_space.values():
            for ent in space_entities:
                if ent.get("id") == entity_id:
                    return {"doc_id": doc_id, "entity": _with_dimension_context(ent)}
        for space_block_refs in session.block_refs_by_space.values():
            for ref in space_block_refs:
                if ref.get("id") == entity_id:
                    return {"doc_id": doc_id, "entity": _with_dimension_context(ref)}
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
