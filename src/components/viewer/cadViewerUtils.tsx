import { memo } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, LocateFixed } from 'lucide-react';
import type { DwgDocFont, DwgEntityLite, DwgHierarchyNode, DwgOpenResponse, DwgPrimitive } from '@/services/dwgApi';

export type ViewerMode = 'select' | 'measure';
export type SelectionScope = 'block' | 'entity';
export type BoxSelectModifier = 'replace' | 'add' | 'toggle';

export interface WorldPoint {
  x: number;
  y: number;
  z?: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CanvasMetrics {
  width: number;
  height: number;
  dpr: number;
}

export interface CachedLineMetrics {
  advance: number;
  leftOverhang: number;
  rightOverhang: number;
  ascent: number;
  descent: number;
}

export interface ShxDebugMatch {
  vectorizeTextEntityCount: number;
  vectorizeTextKeysCount: number;
  vectorizePrimitivesTotal: number;
  shapeFileTextTrueCount: number;
  attachCandidateEntityCount: number;
  matchedEntityCount: number;
  unmatchedEntityCount: number;
  noVectorizePayloadCount: number;
  keyMismatchCount: number;
  filteredByFontKindCount: number;
  emptyAfterOptimizeCount: number;
  filteredNonShxCount: number;
  vectorizeCacheHit: boolean;
  vectorizeError: string | null;
  vectorizeTextKeySamples: string[];
  unmatchedKeySamples: string[];
  orphanVectorizeKeySamples: string[];
  keyMismatchSamples: Array<{
    entityId: string;
    handle: string;
    instancePath: string[];
    candidateKeys: string[];
  }>;
}

export interface ShxRenderStatus {
  detected: boolean;
  outlineMode: 'none' | 'oda_vectorize' | 'stub' | 'disabled' | string;
  trueOutline: boolean;
  vectorizeAttempted: boolean;
  vectorizeAttachedCount: number;
  vectorizeError: string | null;
  fallbackTextCount: number;
  vectorizeAvailable: boolean;
  missingOriginalShxFonts: string[];
  resolvedOriginalShxFonts: string[];
  fallbackShxFile: string | null;
  fallbackHitCount: number;
  diagnosticsUnavailable: boolean;
  debugMatch: ShxDebugMatch | null;
}

export interface WarningLineItem {
  id: string;
  text: string;
  kind: 'normal' | 'shx_diagnostic';
}

export interface FlatHierarchyRow {
  node: DwgHierarchyNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  isSelected: boolean;
  visible: boolean;
  rowInteractive: boolean;
  rowLabel: string;
}

export interface HierarchyVirtualRowProps {
  row: FlatHierarchyRow;
  virtualStart: number;
  onToggleNode: (nodeId: string) => void;
  onSelectNode: (node: DwgHierarchyNode) => void | Promise<void>;
  onLocateNode: (node: DwgHierarchyNode) => void;
  onToggleVisibility: (nodeId: string) => void;
}

export const HierarchyVirtualRow = memo(
  function HierarchyVirtualRow({
    row,
    virtualStart,
    onToggleNode,
    onSelectNode,
    onLocateNode,
    onToggleVisibility,
  }: HierarchyVirtualRowProps) {
    const node = row.node;
    return (
      <div className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${virtualStart}px)` }}>
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded ${row.rowInteractive ? 'cursor-pointer' : 'cursor-not-allowed'} ${
            !row.visible ? 'opacity-45' : ''
          } ${row.isSelected ? 'bg-cyan-900/35 text-cyan-100' : 'hover:bg-gray-800/70 text-gray-200'}`}
          style={{ paddingLeft: `${8 + row.depth * 14}px` }}
          onClick={() => {
            if (node.node_kind === 'category') onToggleNode(node.node_id);
            else if (row.rowInteractive) void onSelectNode(node);
          }}
          title={node.node_kind === 'category' ? `Category ${node.label}` : `${row.rowInteractive ? '' : 'Hidden or filtered '}Handle ${node.handle || '--'}`}
        >
          {row.hasChildren ? (
            <button
              type="button"
              className="h-4 w-4 inline-flex items-center justify-center text-gray-400 hover:text-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                onToggleNode(node.node_id);
              }}
            >
              {row.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="inline-block h-4 w-4" />
          )}

          <span className={`truncate flex-1 ${node.node_kind === 'category' ? 'text-gray-300 font-medium' : ''}`}>{row.rowLabel}</span>

          {node.node_kind !== 'category' && (
            <span className="text-[10px] text-gray-500">{node.type || '--'}</span>
          )}

          {node.node_kind !== 'category' && node.bbox && (
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center text-emerald-300 hover:text-emerald-200"
              title="Locate"
              onClick={(e) => {
                e.stopPropagation();
                onLocateNode(node);
              }}
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            className={`h-5 w-5 inline-flex items-center justify-center ${
              row.visible ? 'text-cyan-300 hover:text-cyan-100' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={row.visible ? 'Hide' : 'Show'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(node.node_id);
            }}
          >
            {row.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.virtualStart === next.virtualStart &&
    prev.row.node.node_id === next.row.node.node_id &&
    prev.row.depth === next.row.depth &&
    prev.row.hasChildren === next.row.hasChildren &&
    prev.row.expanded === next.row.expanded &&
    prev.row.isSelected === next.row.isSelected &&
    prev.row.visible === next.row.visible &&
    prev.row.rowInteractive === next.row.rowInteractive &&
    prev.row.rowLabel === next.row.rowLabel &&
    prev.onToggleNode === next.onToggleNode &&
    prev.onSelectNode === next.onSelectNode &&
    prev.onLocateNode === next.onLocateNode &&
    prev.onToggleVisibility === next.onToggleVisibility
);

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isPoint(value: unknown): value is WorldPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return isFiniteNumber(p.x) && isFiniteNumber(p.y);
}

export function formatNumber(v: number | undefined, digits = 3): string {
  if (v === undefined || Number.isNaN(v)) return '--';
  return v.toFixed(digits);
}

export function formatPointCompact(p: unknown, digits = 3): string | null {
  if (!isPoint(p)) return null;
  const z = typeof p.z === 'number' && Number.isFinite(p.z) ? `, ${formatNumber(p.z, digits)}` : '';
  return `(${formatNumber(p.x, digits)}, ${formatNumber(p.y, digits)}${z})`;
}

export function boolToCn(v: unknown): string {
  return Boolean(v) ? '是' : '否';
}

export function snapModeToCn(modeRaw: unknown): string {
  const m = String(modeRaw || '').toLowerCase();
  if (m === 'endpoint') return '端点';
  if (m === 'midpoint') return '中点';
  if (m === 'center') return '圆心';
  if (!m) return '--';
  return m;
}

export function normalizeLayerName(layerRaw: unknown): string {
  const layer = String(layerRaw ?? '').trim();
  return layer || '0';
}

export const PICK_BOX_SIZE_PX = 10;
export const BLOCK_PICK_BOX_SIZE_PX = 6;
export const PICK_TOLERANCE_FACTORS = [0.65, 0.9, 1.1] as const;
export const BOX_SELECT_DRAG_THRESHOLD_PX = 4;
export const CAD_TEXT_FALLBACK_FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
export const DEFAULT_NORMAL_LINEWEIGHT_MM = 0.25;
export const NORMAL_LINEWEIGHT_MM_TO_PX = 2.2; // 中等基准：1mm -> 2.2px（固定屏幕线宽）
export const NORMAL_LINEWEIGHT_MIN_PX = 0.9;
export const NORMAL_LINEWEIGHT_MAX_PX = 16;
export const GEOMETRIC_LINEWEIGHT_MIN_PX = 0.55;
export const GEOMETRIC_LINEWEIGHT_MAX_PX = 220;
export const DEFAULT_SHX_RENDER_STATUS: ShxRenderStatus = {
  detected: false,
  outlineMode: 'none',
  trueOutline: false,
  vectorizeAttempted: false,
  vectorizeAttachedCount: 0,
  vectorizeError: null,
  fallbackTextCount: 0,
  vectorizeAvailable: false,
  missingOriginalShxFonts: [],
  resolvedOriginalShxFonts: [],
  fallbackShxFile: null,
  fallbackHitCount: 0,
  diagnosticsUnavailable: false,
  debugMatch: null,
};

export function sanitizeCssFontFamily(raw: unknown): string {
  const s = String(raw || '').trim().replace(/['"]/g, '');
  return s;
}

export function buildCadTextFontFamily(primary: unknown): string {
  const p = sanitizeCssFontFamily(primary);
  if (!p) return CAD_TEXT_FALLBACK_FONT;
  return `"${p}", ${CAD_TEXT_FALLBACK_FONT}`;
}

export function _sanitizeFontKeyUi(raw: unknown): string {
  const token = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return token || '';
}

export function boxSelectModifierFromEvent(event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>): BoxSelectModifier {
  if (event.ctrlKey || event.metaKey) return 'toggle';
  if (event.shiftKey) return 'add';
  return 'replace';
}

export function buildFileKey(file: File | null): string | null {
  if (!file) return null;
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function extractCadHandleAndPath(entity: Record<string, unknown>): { handle: string; instancePath: string | null; internalId: string | null } {
  const internalId = String(entity.id ?? '').trim() || null;
  const candidateHandle = [entity.handle, entity.raw_handle, entity.source_handle, entity.id]
    .map((v) => String(v ?? '').trim())
    .find((v) => v.length > 0);

  const idRaw = candidateHandle || '';
  const atIndex = idRaw.indexOf('@');
  const base = atIndex >= 0 ? idRaw.slice(0, atIndex) : idRaw;
  const instancePath = atIndex >= 0 ? idRaw.slice(atIndex + 1).trim() || null : null;
  const cleanedBase = base.split('/').pop() || base;
  const handle = cleanedBase ? cleanedBase.toUpperCase() : '--';

  return { handle, instancePath, internalId };
}

export function isTextLikeTypeName(typeRaw: unknown): boolean {
  const t = String(typeRaw || '').toUpperCase();
  return t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB' || t === 'ATTDEF' || t === 'DIMENSION';
}

export function isBlockRefType(typeRaw: unknown): boolean {
  return String(typeRaw || '').toUpperCase() === 'BLOCK_REF';
}

export function isTextLikeEntityLite(entity: DwgEntityLite): boolean {
  if (isTextLikeTypeName(entity.type)) return true;
  const geom = entity.geom as Record<string, unknown> | undefined;
  const primitives = asPrimitiveList((geom || {}) as Record<string, unknown>);
  return primitives.some((p) => p.kind === 'text');
}

export function firstNonEmptyString(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t) return t;
  }
  return null;
}

export function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const t = String(item ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function toNonNegativeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function normalizeShxDebugMatch(raw: unknown): ShxDebugMatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const vectorizeError = String(obj.vectorize_error ?? '').trim();
  const keyMismatchSamplesRaw = Array.isArray(obj.key_mismatch_samples) ? obj.key_mismatch_samples : [];
  const keyMismatchSamples = keyMismatchSamplesRaw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .slice(0, 10)
    .map((item) => ({
      entityId: String(item.entity_id ?? '').trim(),
      handle: String(item.handle ?? '').trim(),
      instancePath: toUniqueStringList(item.instance_path),
      candidateKeys: toUniqueStringList(item.candidate_keys),
    }));
  return {
    vectorizeTextEntityCount: toNonNegativeInt(obj.vectorize_text_entity_count),
    vectorizeTextKeysCount: toNonNegativeInt(obj.vectorize_text_keys_count),
    vectorizePrimitivesTotal: toNonNegativeInt(obj.vectorize_primitives_total),
    shapeFileTextTrueCount: toNonNegativeInt(obj.shape_file_text_true_count),
    attachCandidateEntityCount: toNonNegativeInt(obj.attach_candidate_entity_count),
    matchedEntityCount: toNonNegativeInt(obj.matched_entity_count),
    unmatchedEntityCount: toNonNegativeInt(obj.unmatched_entity_count),
    noVectorizePayloadCount: toNonNegativeInt(obj.no_vectorize_payload_count),
    keyMismatchCount: toNonNegativeInt(obj.key_mismatch_count),
    filteredByFontKindCount: toNonNegativeInt(obj.filtered_by_font_kind_count),
    emptyAfterOptimizeCount: toNonNegativeInt(obj.empty_after_optimize_count),
    filteredNonShxCount: toNonNegativeInt(obj.filtered_non_shx_count),
    vectorizeCacheHit: Boolean(obj.vectorize_cache_hit),
    vectorizeError: vectorizeError || null,
    vectorizeTextKeySamples: toUniqueStringList(obj.vectorize_text_key_samples),
    unmatchedKeySamples: toUniqueStringList(obj.unmatched_key_samples),
    orphanVectorizeKeySamples: toUniqueStringList(obj.orphan_vectorize_key_samples),
    keyMismatchSamples,
  };
}

export function resolveShxRenderStatus(opened: DwgOpenResponse): ShxRenderStatus {
  const raw = opened.shx_status;
  const outlineMode = String(raw?.outline_mode ?? opened.shx_outline_mode ?? 'none');
  const vectorizeAttachedCountRaw = Number(raw?.vectorize_attached_count);
  const fallbackTextCountRaw = Number(raw?.fallback_text_count);
  const vectorizeAttachedCount = Number.isFinite(vectorizeAttachedCountRaw) ? Math.max(0, vectorizeAttachedCountRaw) : 0;
  const fallbackTextCount = Number.isFinite(fallbackTextCountRaw) ? Math.max(0, fallbackTextCountRaw) : 0;
  const fallbackHitCountRaw = Number(raw?.fallback_hit_count);
  const fallbackHitCount = Number.isFinite(fallbackHitCountRaw) ? Math.max(0, fallbackHitCountRaw) : 0;
  const trueOutline = Boolean(raw?.true_outline) || (outlineMode === 'oda_vectorize' && vectorizeAttachedCount > 0 && fallbackTextCount === 0);
  const vectorizeErrorText = String(raw?.vectorize_error ?? '').trim();
  const missingOriginalShxFonts = toUniqueStringList(raw?.missing_original_shx_fonts);
  const resolvedOriginalShxFonts = toUniqueStringList(raw?.resolved_original_shx_fonts);
  const fallbackShxFile = String(raw?.fallback_shx_file ?? '').trim() || null;
  const debugMatch = normalizeShxDebugMatch(raw?.debug_match);
  return {
    detected: Boolean(raw?.detected) || fallbackTextCount > 0,
    outlineMode,
    trueOutline,
    vectorizeAttempted: Boolean(raw?.vectorize_attempted),
    vectorizeAttachedCount,
    vectorizeError: vectorizeErrorText ? vectorizeErrorText : null,
    fallbackTextCount,
    vectorizeAvailable: Boolean(raw?.vectorize_available),
    missingOriginalShxFonts,
    resolvedOriginalShxFonts,
    fallbackShxFile,
    fallbackHitCount,
    diagnosticsUnavailable: Boolean(raw?.diagnostics_unavailable),
    debugMatch,
  };
}

export function isShxFallbackText(status: ShxRenderStatus, fontKindRaw: unknown): boolean {
  const fontKind = String(fontKindRaw || '').trim().toLowerCase();
  if (fontKind !== 'shx') return false;
  if (status.trueOutline) return false;
  return true;
}

export function truncateCadLine(line: string, maxChars: number): string {
  if (!line || line.length <= maxChars) return line;
  return `${line.slice(0, maxChars)}...`;
}

export function translateDwgWarningToCn(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  if (/^SHX ODA outline extraction produced no matched text entities; fallback to stroke emulation\.?$/i.test(text)) {
    return 'SHX 轮廓提取未匹配到可替换文字实体，已回退为笔画模拟渲染。';
  }
  const shxFailed = text.match(/^SHX ODA outline extraction failed \((.+)\); fallback to stroke emulation\.?$/i);
  if (shxFailed) {
    return `SHX 轮廓提取失败（${shxFailed[1]}），已回退为笔画模拟渲染。`;
  }
  if (/^OdVectorizeEx not configured\/found; SHX uses stroke outline emulation\.?$/i.test(text)) {
    return '未配置或未找到 OdVectorizeEx，SHX 将使用笔画模拟渲染。';
  }
  if (/^ODA parser loaded the DWG but did not extract supported entities yet\.?$/i.test(text)) {
    return 'ODA 已加载 DWG，但尚未提取到可显示的受支持图元。';
  }
  if (/^SHX font file not found on server\.?$/i.test(text)) {
    return 'SHX 字体文件在服务器未找到。';
  }
  if (/^Font file not found on server\.?$/i.test(text)) {
    return '字体文件在服务器未找到。';
  }
  if (/^Remote DWG core did not expose \/fonts endpoint\.?$/i.test(text)) {
    return '远端 DWG 内核未提供 /fonts 接口，无法返回字体明细。';
  }
  if (/^Current file is not a DWG document\.?$/i.test(text)) {
    return '当前文件不是 DWG 图纸。';
  }

  const odReadTimeout = text.match(/^OdReadEx timed out after ([\d.]+)s for (.+?)(?:\.\s*Try increasing DWG_ODA_TIMEOUT_SEC\.?)?$/i);
  if (odReadTimeout) {
    return `OdReadEx 读取超时（${odReadTimeout[1]}s，${odReadTimeout[2]}）。请提高 DWG_ODA_TIMEOUT_SEC（建议 420 或更高）并重启后端。`;
  }

  return text;
}
export function normalizeWarningsForUi(warningsRaw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of warningsRaw) {
    const localized = translateDwgWarningToCn(raw).trim();
    if (!localized) continue;
    if (seen.has(localized)) continue;
    seen.add(localized);
    out.push(localized);
  }
  return out;
}

export function parseMissingFontWarningForUi(warningRaw: string): { title: string; items: string[] } | null {
  const warning = String(warningRaw || '').trim();
  let title = '';
  let detail = '';
  if (warning.startsWith('以下字体文件在服务器未找到')) {
    title = '字体缺失名单';
    detail = warning.replace(/^以下字体文件在服务器未找到[:：]?/, '').trim();
    detail = detail.replace(/。?已按可用字体或降级策略渲染。?$/, '').trim();
  } else if (warning.startsWith('未命中原始 SHX 字体')) {
    title = 'SHX未命中名单';
    detail = warning.replace(/^未命中原始 SHX 字体[:：]?/, '').trim();
    detail = detail
      .replace(/。?已使用后备字体.*$/, '')
      .replace(/。?未检测到后备 SHX 字体。?$/, '')
      .trim();
  } else {
    return null;
  }

  if (!detail) return { title, items: [] };

  const normalized = detail.replace(/[，；]/g, ';');
  const rawItems = normalized
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const items =
    title === 'SHX未命中名单' && rawItems.length === 1
      ? rawItems[0]
          .split('、')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : rawItems;
  return { title, items };
}
export function buildShxFontDiagnosticFromDocFonts(status: ShxRenderStatus, fonts: DwgDocFont[]): string | null {
  if (!status.detected || status.trueOutline) return null;

  if (status.missingOriginalShxFonts.length > 0) {
    const shown = status.missingOriginalShxFonts.slice(0, 8);
    const suffix = status.missingOriginalShxFonts.length > 8 ? ` 等${status.missingOriginalShxFonts.length}项` : '';
    const fallbackNote = status.fallbackShxFile ? `，已使用后备字体 ${status.fallbackShxFile}` : '';
    return `SHX 字体诊断：未命中原始 SHX 字体 ${shown.join('、')}${suffix}${fallbackNote}。`;
  }

  if (status.diagnosticsUnavailable) {
    return 'SHX 字体诊断：远端未提供完整字体诊断信息，当前降级可能由轮廓匹配失败或字体未命中导致。';
  }

  const shxFonts = fonts.filter((f) => String(f.kind || '').trim().toLowerCase() === 'shx');
  if (!shxFonts.length) {
    return 'SHX 字体诊断：未获取到 SHX 字体明细，当前降级可能是轮廓匹配失败或远端未返回字体信息。';
  }

  const missing: string[] = [];
  const found: string[] = [];
  const seenMissing = new Set<string>();
  const seenFound = new Set<string>();
  let fallbackFileName: string | null = status.fallbackShxFile;

  for (const font of shxFonts) {
    const label = String(font.name || font.style_name || font.key || '').trim() || '未命名SHX';
    const reason = String(font.reason || '').toLowerCase();
    const fallbackHit = Boolean(font.fallback_shx_hit);
    const fallbackFile = String(font.fallback_shx_file_name || '').trim();
    if (!fallbackFileName && fallbackFile) fallbackFileName = fallbackFile;
    const looksMissing = fallbackHit || !font.available || reason.includes('not found') || reason.includes('未找到');
    if (looksMissing) {
      if (!seenMissing.has(label)) {
        seenMissing.add(label);
        missing.push(label);
      }
      continue;
    }
    if (!seenFound.has(label)) {
      seenFound.add(label);
      found.push(label);
    }
  }

  if (missing.length > 0) {
    const shown = missing.slice(0, 8);
    const suffix = missing.length > 8 ? ` 等${missing.length}项` : '';
    const fallbackNote = fallbackFileName ? `，已使用后备字体 ${fallbackFileName}` : '';
    return `SHX 字体诊断：未命中原始 SHX 字体 ${shown.join('、')}${suffix}${fallbackNote}。`;
  }

  const foundShown = found.slice(0, 6);
  const foundText = foundShown.length > 0 ? `（已识别 ${foundShown.join('、')}）` : '';
  return `SHX 字体诊断：未发现缺失 SHX 字体${foundText}，当前降级更可能由轮廓匹配失败导致。`;
}

export function cleanCadText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\P/gi, '\n')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '')
    .trim();
}

export function colorFromAci(index: number): string {
  const fixed: Record<number, string> = {
    0: '#cbd5e1',
    1: '#ff0000',
    2: '#ffff00',
    3: '#00ff00',
    4: '#00ffff',
    5: '#0000ff',
    6: '#ff00ff',
    7: '#ffffff',
    8: '#808080',
    9: '#c0c0c0',
    250: '#333333',
    251: '#444444',
    252: '#555555',
    253: '#666666',
    254: '#777777',
    255: '#888888',
  };
  if (fixed[index]) return fixed[index];
  return `hsl(${(index * 137.5) % 360} 70% 60%)`;
}

export function resolveTextAlign(modeRaw: string): CanvasTextAlign {
  const m = modeRaw.toLowerCase();
  if (m.includes('right')) return 'right';
  if (m.includes('center') || m.includes('mid')) return 'center';
  return 'left';
}

export function resolveTextBaseline(modeRaw: string): CanvasTextBaseline {
  const m = modeRaw.toLowerCase();
  if (m.includes('top')) return 'top';
  if (m.includes('middle') || m.includes('mid') || m.includes('center')) return 'middle';
  if (m.includes('bottom')) return 'bottom';
  return 'alphabetic';
}

export function getBboxAnchor(bbox: DwgEntityLite['bbox'], align: CanvasTextAlign, baseline: CanvasTextBaseline): WorldPoint | null {
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const x = align === 'center' ? (minX + maxX) * 0.5 : align === 'right' ? maxX : minX;
  const y = baseline === 'top' ? maxY : baseline === 'middle' ? (minY + maxY) * 0.5 : minY;
  return { x, y, z: Number(bbox.min.z || 0) };
}

export function entityColor(entity: DwgEntityLite): string {
  const style = entity.style as Record<string, unknown> | undefined;
  const geom = entity.geom as Record<string, unknown> | undefined;
  const colorIndexRaw = style?.effective_color_index ?? style?.color_index ?? geom?.color_index;
  if (isFiniteNumber(colorIndexRaw) && colorIndexRaw >= 0) {
    if (colorIndexRaw === 256) return '#94a3b8';
    return colorFromAci(Math.round(colorIndexRaw));
  }

  const colorName = String(style?.effective_color ?? style?.color ?? geom?.color ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(colorName)) return colorName;
  if (/^ACI\s+\d+$/i.test(colorName)) {
    const n = Number(colorName.replace(/\D+/g, ''));
    if (Number.isFinite(n)) return colorFromAci(n);
  }
  if (/^foreground$/i.test(colorName)) return colorFromAci(7);
  return '#94a3b8';
}

export function toPositiveFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function parseCadLineweightMm(raw: unknown): number | null {
  const token = String(raw ?? '').trim();
  if (!token) return null;
  const lower = token.toLowerCase();
  if (
    lower === 'default' ||
    lower === 'bylayer' ||
    lower === 'byblock' ||
    lower === 'klnwtbylayer' ||
    lower === 'klnwtbyblock' ||
    lower === 'klnwtbylwdefault'
  ) {
    return null;
  }
  const enumMatch = lower.match(/^klnwt(\d+)$/);
  if (enumMatch) {
    const centiMm = Number(enumMatch[1]);
    if (Number.isFinite(centiMm) && centiMm > 0) return centiMm / 100;
    return null;
  }
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function resolveEntityNormalLineweightMm(entity: DwgEntityLite): number {
  const style = (entity.style || {}) as Record<string, unknown>;
  const effective = toPositiveFiniteNumber(style.effective_lineweight_mm);
  if (effective) return effective;
  const parsed = parseCadLineweightMm(style.lineweight);
  if (parsed) return parsed;
  const mm = toPositiveFiniteNumber(style.lineweight_mm);
  if (mm) return mm;
  return DEFAULT_NORMAL_LINEWEIGHT_MM;
}

export function resolvePolylineGeometricWidthWorld(
  entity: DwgEntityLite,
  primitive?: Extract<DwgPrimitive, { kind: 'polyline' }>
): number | null {
  const geom = (entity.geom || {}) as Record<string, unknown>;
  const globalW = toPositiveFiniteNumber(primitive?.global_width ?? geom.global_width);
  if (globalW) return globalW;
  const startW = toPositiveFiniteNumber(primitive?.start_width ?? geom.start_width);
  const endW = toPositiveFiniteNumber(primitive?.end_width ?? geom.end_width);
  if (startW && endW) return Math.max(startW, endW);
  return startW ?? endW ?? null;
}

export function resolveStrokeWidthPx(
  entity: DwgEntityLite,
  zoom: number,
  showNormalLineweight: boolean,
  primitive?: DwgPrimitive
): number {
  const entityType = String(entity.type || '').toUpperCase();
  const polylinePrimitive = primitive && primitive.kind === 'polyline' ? primitive : undefined;
  if (entityType === 'POLYLINE' || polylinePrimitive) {
    const worldW = resolvePolylineGeometricWidthWorld(entity, polylinePrimitive);
    if (worldW && Number.isFinite(zoom) && zoom > 0) {
      const px = worldW * zoom;
      if (Number.isFinite(px) && px > 0) {
        return Math.max(GEOMETRIC_LINEWEIGHT_MIN_PX, Math.min(GEOMETRIC_LINEWEIGHT_MAX_PX, px));
      }
    }
  }
  if (!showNormalLineweight) return 1.1;
  const mm = resolveEntityNormalLineweightMm(entity);
  const px = mm * NORMAL_LINEWEIGHT_MM_TO_PX;
  if (!Number.isFinite(px) || px <= 0) return 1.1;
  return Math.max(NORMAL_LINEWEIGHT_MIN_PX, Math.min(NORMAL_LINEWEIGHT_MAX_PX, px));
}

export function hatchPatternIsCross(patternNameRaw: unknown): boolean {
  const name = String(patternNameRaw || '').trim().toLowerCase();
  if (!name) return false;
  return (
    name.includes('cross') ||
    name.includes('grid') ||
    name.includes('net') ||
    name.includes('ansi32') ||
    name.includes('ansi33') ||
    name.includes('ansi34') ||
    name.includes('ansi35')
  );
}

export function traceClosedScreenRingsPath(ctx: CanvasRenderingContext2D, rings: Array<Array<{ x: number; y: number }>>): boolean {
  let traced = false;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const first = ring[0];
    if (!Number.isFinite(first.x) || !Number.isFinite(first.y)) continue;
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ring.length; i += 1) {
      const p = ring[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    traced = true;
  }
  return traced;
}

export function drawHatchPatternLinesInClip(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  color: string,
  angleDeg: number,
  spacingPx: number,
  cross: boolean
): void {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const radius = Math.hypot(w, h) * 0.6 + spacingPx * 2;
  const drawOneDirection = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.beginPath();
    for (let x = -radius; x <= radius; x += spacingPx) {
      ctx.moveTo(x, -radius);
      ctx.lineTo(x, radius);
    }
    ctx.stroke();
    ctx.restore();
  };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = 1;
  drawOneDirection(angleDeg);
  if (cross) drawOneDirection(angleDeg + 90);
  ctx.restore();
}

export function bboxVisible(bbox: DwgEntityLite['bbox'], view: WorldBounds): boolean {
  if (!bbox?.min || !bbox?.max) return true;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return true;
  if (maxX < view.minX || minX > view.maxX) return false;
  if (maxY < view.minY || minY > view.maxY) return false;
  return true;
}

export function distanceToBboxWorld(point: WorldPoint, bbox: DwgEntityLite['bbox']): number | null {
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const loX = Math.min(minX, maxX);
  const hiX = Math.max(minX, maxX);
  const loY = Math.min(minY, maxY);
  const hiY = Math.max(minY, maxY);
  const dx = point.x < loX ? loX - point.x : point.x > hiX ? point.x - hiX : 0;
  const dy = point.y < loY ? loY - point.y : point.y > hiY ? point.y - hiY : 0;
  return Math.hypot(dx, dy);
}

export function asPrimitiveList(geom: Record<string, unknown>): DwgPrimitive[] {
  const raw = geom.primitives;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is DwgPrimitive => Boolean(p) && typeof p === 'object' && typeof (p as any).kind === 'string');
}

export function pointDistanceWorld(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegmentWorld(point: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-12) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(point.x - cx, point.y - cy);
}

export function normalizeAngleDeg(a: number): number {
  let v = a % 360;
  if (v < 0) v += 360;
  return v;
}

export function distanceToPrimitiveWorld(point: WorldPoint, primitive: DwgPrimitive, targetBbox?: DwgEntityLite['bbox']): number | null {
  if (primitive.kind === 'line') {
    if (!isPoint(primitive.start) || !isPoint(primitive.end)) return null;
    return distanceToSegmentWorld(point, primitive.start, primitive.end);
  }
  if (primitive.kind === 'polyline') {
    const pts = primitive.points.filter(isPoint);
    if (pts.length < 2) return null;
    let d = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pts.length - 1; i += 1) d = Math.min(d, distanceToSegmentWorld(point, pts[i], pts[i + 1]));
    if (Boolean(primitive.closed) && pts.length > 2) d = Math.min(d, distanceToSegmentWorld(point, pts[pts.length - 1], pts[0]));
    return Number.isFinite(d) ? d : null;
  }
  if (primitive.kind === 'polygon') {
    let d = Number.POSITIVE_INFINITY;
    for (const ring of primitive.rings) {
      const pts = ring.filter(isPoint);
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i += 1) d = Math.min(d, distanceToSegmentWorld(point, pts[i], pts[i + 1]));
      d = Math.min(d, distanceToSegmentWorld(point, pts[pts.length - 1], pts[0]));
    }
    return Number.isFinite(d) ? d : null;
  }
  if (primitive.kind === 'circle') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.radius)) return null;
    return Math.abs(pointDistanceWorld(point, primitive.center) - Number(primitive.radius));
  }
  if (primitive.kind === 'arc') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.radius)) return null;
    const center = primitive.center;
    const radius = Number(primitive.radius);
    let startDeg = Number(primitive.start_angle ?? 0);
    let deltaDeg = ((Number(primitive.end_angle ?? 360) - startDeg) % 360 + 360) % 360;
    if (deltaDeg <= 1e-6) deltaDeg = 360;

    if (isPoint(primitive.start) && isPoint(primitive.end)) {
      const sp = normalizeAngleDeg((Math.atan2(primitive.start.y - center.y, primitive.start.x - center.x) * 180) / Math.PI);
      const ep = normalizeAngleDeg((Math.atan2(primitive.end.y - center.y, primitive.end.x - center.x) * 180) / Math.PI);
      startDeg = sp;
      const ccwDelta = ((ep - sp) % 360 + 360) % 360 || 360;
      const cwDelta = 360 - ccwDelta;
      let sweepDeg = ccwDelta;
      if (targetBbox && ccwDelta < 360 - 1e-6 && cwDelta < 360 - 1e-6) {
        const sampleA = sampleArcWorld(center, radius, (startDeg * Math.PI) / 180, (ccwDelta * Math.PI) / 180, 24);
        const sampleB = sampleArcWorld(center, radius, (startDeg * Math.PI) / 180, (-cwDelta * Math.PI) / 180, 24);
        const scoreA = arcBboxScore(bboxFromWorldPoints(sampleA), targetBbox);
        const scoreB = arcBboxScore(bboxFromWorldPoints(sampleB), targetBbox);
        if (scoreB < scoreA) sweepDeg = -cwDelta;
      }
      deltaDeg = sweepDeg;
    }

    const sweepRad = (deltaDeg * Math.PI) / 180;
    const approxPxRadius = Math.max(radius, 1);
    const steps = Math.max(8, Math.min(160, Math.ceil((Math.abs(sweepRad) * approxPxRadius) / 10)));
    const pts = sampleArcWorld(center, radius, (startDeg * Math.PI) / 180, sweepRad, steps);
    if (pts.length < 2) return null;

    let d = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pts.length - 1; i += 1) {
      d = Math.min(d, distanceToSegmentWorld(point, pts[i], pts[i + 1]));
    }
    if (!Number.isFinite(d)) return null;
    return d;
  }
  if (primitive.kind === 'ellipse') {
    if (!isPoint(primitive.center) || !Number.isFinite(primitive.rx) || !Number.isFinite(primitive.ry)) return null;
    const center = primitive.center;
    const rx = Math.abs(Number(primitive.rx));
    const ry = Math.abs(Number(primitive.ry));
    if (rx <= 1e-9 || ry <= 1e-9) return null;
    const rot = (Number(primitive.rotation || 0) * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const start = Number(primitive.start_angle ?? 0);
    let delta = ((Number(primitive.end_angle ?? 360) - start) % 360 + 360) % 360;
    if (delta <= 1e-9) delta = 360;
    const steps = 48;
    let d = Number.POSITIVE_INFINITY;
    let prev: WorldPoint | null = null;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = ((start + delta * t) * Math.PI) / 180;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      const p: WorldPoint = {
        x: center.x + ex * cosR - ey * sinR,
        y: center.y + ex * sinR + ey * cosR,
        z: center.z || 0,
      };
      if (prev) d = Math.min(d, distanceToSegmentWorld(point, prev, p));
      prev = p;
    }
    return Number.isFinite(d) ? d : null;
  }
  if (primitive.kind === 'text') return isPoint(primitive.position) ? pointDistanceWorld(point, primitive.position) : null;
  if (primitive.kind === 'point') return isPoint(primitive.position) ? pointDistanceWorld(point, primitive.position) : null;
  return null;
}

export function distanceToEntityWorld(point: WorldPoint, entity: DwgEntityLite): number | null {
  const geom = (entity.geom || {}) as Record<string, unknown>;
  const primitives = asPrimitiveList(geom);
  let d = Number.POSITIVE_INFINITY;

  for (const primitive of primitives) {
    const pd = distanceToPrimitiveWorld(point, primitive, entity.bbox);
    if (pd !== null) d = Math.min(d, pd);
  }

  const typeUpper = String(entity.type || '').toUpperCase();
  if (!primitives.length && typeUpper === 'LINE') {
    const start = geom.start;
    const end = geom.end;
    if (isPoint(start) && isPoint(end)) d = Math.min(d, distanceToSegmentWorld(point, start, end));
  }

  if (isTextLikeEntityLite(entity)) {
    const bboxDist = distanceToBboxWorld(point, entity.bbox);
    if (bboxDist !== null) d = Math.min(d, bboxDist);
  }

  return Number.isFinite(d) ? d : null;
}

export function findLocalPickEntityId(point: WorldPoint, tolWorld: number, entities: DwgEntityLite[], view: WorldBounds): string | null {
  let best: { id: string; dist: number } | null = null;

  for (const ent of entities) {
    if (!bboxVisible(ent.bbox, view)) continue;
    const bboxDist = distanceToBboxWorld(point, ent.bbox);
    if (bboxDist !== null && bboxDist > tolWorld * 1.5) continue;

    const dist = distanceToEntityWorld(point, ent);
    if (dist === null || dist > tolWorld) continue;
    if (!best || dist < best.dist) best = { id: ent.id, dist };
  }

  return best?.id || null;
}

export function toEntityLiteForPick(entity: Record<string, unknown>, fallbackSpaceId: string): DwgEntityLite | null {
  const id = String(entity.id ?? '').trim();
  const type = String(entity.type ?? '').trim();
  const geom = entity.geom;
  if (!id || !type || !geom || typeof geom !== 'object') return null;

  let bbox: DwgEntityLite['bbox'] | undefined;
  const rawBbox = entity.bbox;
  if (rawBbox && typeof rawBbox === 'object') {
    const b = rawBbox as Record<string, unknown>;
    const bmin = b.min;
    const bmax = b.max;
    if (bmin && typeof bmin === 'object' && bmax && typeof bmax === 'object') {
      const minObj = bmin as Record<string, unknown>;
      const maxObj = bmax as Record<string, unknown>;
      const minX = Number(minObj.x);
      const minY = Number(minObj.y);
      const maxX = Number(maxObj.x);
      const maxY = Number(maxObj.y);
      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        bbox = {
          min: { x: minX, y: minY, z: Number(minObj.z || 0) },
          max: { x: maxX, y: maxY, z: Number(maxObj.z || 0) },
        };
      }
    }
  }

  return {
    id,
    type,
    layer: String(entity.layer ?? '0'),
    space_id: String(entity.space_id ?? fallbackSpaceId),
    geom: geom as DwgEntityLite['geom'],
    style: entity.style && typeof entity.style === 'object' ? (entity.style as Record<string, unknown>) : undefined,
    bbox,
  };
}

export function isEntityRecordHit(entity: Record<string, unknown>, point: WorldPoint, tolWorld: number, fallbackSpaceId: string): boolean {
  const lite = toEntityLiteForPick(entity, fallbackSpaceId);
  if (!lite) return false;
  const dist = distanceToEntityWorld(point, lite);
  return typeof dist === 'number' && Number.isFinite(dist) && dist <= tolWorld;
}

export function includePrimitiveBounds(includePoint: (p: WorldPoint) => void, primitives: DwgPrimitive[]) {
  for (const primitive of primitives) {
    if (primitive.kind === 'line') {
      if (isPoint(primitive.start)) includePoint(primitive.start);
      if (isPoint(primitive.end)) includePoint(primitive.end);
      continue;
    }
    if (primitive.kind === 'polyline') {
      primitive.points.forEach((p) => {
        if (isPoint(p)) includePoint(p);
      });
      continue;
    }
    if (primitive.kind === 'polygon') {
      primitive.rings.forEach((ring) =>
        ring.forEach((p) => {
          if (isPoint(p)) includePoint(p);
        })
      );
      continue;
    }
    if (primitive.kind === 'circle') {
      const c = primitive.center;
      const r = Number(primitive.radius);
      if (isPoint(c) && Number.isFinite(r)) {
        includePoint({ x: c.x - r, y: c.y - r, z: c.z || 0 });
        includePoint({ x: c.x + r, y: c.y + r, z: c.z || 0 });
      }
      continue;
    }
    if (primitive.kind === 'arc') {
      const c = primitive.center;
      const r = Number(primitive.radius);
      if (isPoint(c) && Number.isFinite(r)) {
        includePoint({ x: c.x - r, y: c.y - r, z: c.z || 0 });
        includePoint({ x: c.x + r, y: c.y + r, z: c.z || 0 });
      }
      continue;
    }
    if (primitive.kind === 'ellipse') {
      const c = primitive.center;
      const rx = Number(primitive.rx);
      const ry = Number(primitive.ry);
      if (isPoint(c) && Number.isFinite(rx) && Number.isFinite(ry)) {
        includePoint({ x: c.x - rx, y: c.y - ry, z: c.z || 0 });
        includePoint({ x: c.x + rx, y: c.y + ry, z: c.z || 0 });
      }
      continue;
    }
    if (primitive.kind === 'text') {
      if (isPoint(primitive.position)) includePoint(primitive.position);
      continue;
    }
    if (primitive.kind === 'point') {
      if (isPoint(primitive.position)) includePoint(primitive.position);
    }
  }
}

export function normalizeAngleRad(a: number): number {
  const twoPi = Math.PI * 2;
  let v = a % twoPi;
  if (v < 0) v += twoPi;
  return v;
}

export function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const r = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));
  ctx.beginPath();
  const roundRectCapable = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, radii?: number) => void };
  if (typeof roundRectCapable.roundRect === 'function') {
    roundRectCapable.roundRect(x, y, width, height, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }
  ctx.fill();
}

export function sampleArcWorld(center: WorldPoint, radius: number, startRad: number, sweepRad: number, steps: number): WorldPoint[] {
  const n = Math.max(2, steps);
  const pts: WorldPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = startRad + sweepRad * t;
    pts.push({
      x: center.x + radius * Math.cos(a),
      y: center.y + radius * Math.sin(a),
      z: center.z || 0,
    });
  }
  return pts;
}

export function sampleEllipseWorld(
  center: WorldPoint,
  rx: number,
  ry: number,
  rotationRad: number,
  startRad: number,
  sweepRad: number,
  steps: number
): WorldPoint[] {
  const n = Math.max(8, steps);
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);
  const pts: WorldPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = startRad + sweepRad * t;
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    pts.push({
      x: center.x + ex * cosR - ey * sinR,
      y: center.y + ex * sinR + ey * cosR,
      z: center.z || 0,
    });
  }
  return pts;
}

export function bboxFromWorldPoints(points: WorldPoint[]): WorldBounds | null {
  if (!points.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

export function arcBboxScore(candidate: WorldBounds | null, target: DwgEntityLite['bbox']): number {
  if (!candidate || !target?.min || !target?.max) return Number.POSITIVE_INFINITY;
  const tMinX = Number(target.min.x);
  const tMinY = Number(target.min.y);
  const tMaxX = Number(target.max.x);
  const tMaxY = Number(target.max.y);
  if (![tMinX, tMinY, tMaxX, tMaxY].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return (
    Math.abs(candidate.minX - tMinX) +
    Math.abs(candidate.minY - tMinY) +
    Math.abs(candidate.maxX - tMaxX) +
    Math.abs(candidate.maxY - tMaxY)
  );
}

export function computeEntitiesBounds(entities: DwgEntityLite[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  const includePoint = (p: WorldPoint) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    found = true;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const entity of entities) {
    if (entity.bbox?.min && entity.bbox?.max) {
      includePoint({ x: Number(entity.bbox.min.x), y: Number(entity.bbox.min.y), z: Number(entity.bbox.min.z || 0) });
      includePoint({ x: Number(entity.bbox.max.x), y: Number(entity.bbox.max.y), z: Number(entity.bbox.max.z || 0) });
      continue;
    }

    const geom = entity.geom || {};
    const primitives = asPrimitiveList(geom as Record<string, unknown>);
    if (primitives.length > 0) {
      includePrimitiveBounds(includePoint, primitives);
      continue;
    }
    if (entity.type === 'LINE') {
      const start = (geom as any).start;
      const end = (geom as any).end;
      if (isPoint(start)) includePoint(start);
      if (isPoint(end)) includePoint(end);
    } else if (entity.type === 'POLYLINE' || entity.type === 'SPLINE') {
      const points = (geom as any).vertices || (geom as any).points;
      if (Array.isArray(points)) {
        points.forEach((v) => {
          if (isPoint(v)) includePoint(v);
        });
      }
    } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      const center = (geom as any).center;
      const radius = Number((geom as any).radius);
      if (isPoint(center) && Number.isFinite(radius)) {
        includePoint({ x: center.x - radius, y: center.y - radius, z: center.z || 0 });
        includePoint({ x: center.x + radius, y: center.y + radius, z: center.z || 0 });
      }
    } else if (entity.type === 'ELLIPSE') {
      const center = (geom as any).center;
      const rx = Number((geom as any).rx);
      const ry = Number((geom as any).ry);
      if (isPoint(center) && Number.isFinite(rx) && Number.isFinite(ry)) {
        includePoint({ x: center.x - rx, y: center.y - ry, z: center.z || 0 });
        includePoint({ x: center.x + rx, y: center.y + ry, z: center.z || 0 });
      }
    } else if (entity.type === 'TEXT') {
      const pos = (geom as any).position;
      if (isPoint(pos)) includePoint(pos);
    }
  }

  if (!found) return null;
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

export function hierarchyChildren(node: DwgHierarchyNode): DwgHierarchyNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

export function collectHierarchyEntityPathMap(nodes: DwgHierarchyNode[], out: Map<string, string[]>, path: string[] = []) {
  for (const node of nodes) {
    path.push(node.node_id);
    const entityId = typeof node.entity_id === 'string' ? node.entity_id.trim() : '';
    if (entityId && !out.has(entityId)) {
      out.set(entityId, [...path]);
    }
    const children = hierarchyChildren(node);
    if (children.length > 0) collectHierarchyEntityPathMap(children, out, path);
    path.pop();
  }
}

export function areStringSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

export function collectFirstLayerExpandedNodeIds(nodes: DwgHierarchyNode[]): Set<string> {
  const expanded = new Set<string>();
  for (const node of nodes) {
    if (node.node_kind === 'category') expanded.add(node.node_id);
  }
  return expanded;
}

export function collectHierarchyLayers(nodes: DwgHierarchyNode[], out: Set<string>) {
  for (const node of nodes) {
    if (node.node_kind !== 'category') {
      out.add(normalizeLayerName(node.layer));
    }
    const children = hierarchyChildren(node);
    if (children.length > 0) collectHierarchyLayers(children, out);
  }
}

export function collectHierarchyNodeMap(nodes: DwgHierarchyNode[], out: Map<string, DwgHierarchyNode>) {
  for (const node of nodes) {
    out.set(node.node_id, node);
    const children = hierarchyChildren(node);
    if (children.length > 0) collectHierarchyNodeMap(children, out);
  }
}

export function collectHierarchyEntityIdsFromNode(node: DwgHierarchyNode, out: Set<string>) {
  const id = typeof node.entity_id === 'string' ? node.entity_id.trim() : '';
  if (id) out.add(id);
  const children = hierarchyChildren(node);
  for (const child of children) collectHierarchyEntityIdsFromNode(child, out);
}

export function getEntityRecordId(entity: Record<string, unknown>): string | null {
  const id = String(entity.id ?? entity.entity_id ?? '').trim();
  return id || null;
}

export function entityWorldBounds(entity: DwgEntityLite): WorldBounds | null {
  const bbox = entity.bbox;
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

export function boundsIntersects(a: WorldBounds, b: WorldBounds): boolean {
  if (a.maxX < b.minX || a.minX > b.maxX) return false;
  if (a.maxY < b.minY || a.minY > b.maxY) return false;
  return true;
}

export function boundsContains(outer: WorldBounds, inner: WorldBounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export function hierarchyBboxToWorldBounds(
  bbox: DwgHierarchyNode['bbox'] | DwgEntityLite['bbox'] | null | undefined
): WorldBounds | null {
  if (!bbox?.min || !bbox?.max) return null;
  const minX = Number(bbox.min.x);
  const minY = Number(bbox.min.y);
  const maxX = Number(bbox.max.x);
  const maxY = Number(bbox.max.y);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

