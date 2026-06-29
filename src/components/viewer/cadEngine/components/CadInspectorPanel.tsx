import { AlertTriangle, PanelRightClose } from 'lucide-react';
import type { BuildGlxDiagnostics } from '../dwgToGlx';
import type { TreeConsistencyDiagnostics } from '../hooks/contracts';
import type { CadEngineRuntimeDiagnostics } from '../runtimeDiagnostics';
import { buildEntityPropertySections, extractCadHandle } from '../inspector/registry';

interface CadInspectorPanelProps {
  selectedEntityId: string | null;
  selectedEntityRecord: Record<string, unknown> | null;
  renderDiagnostics: BuildGlxDiagnostics | null;
  runtimeDiagnostics: CadEngineRuntimeDiagnostics | null;
  diagnosticRows: Array<{ kind: string; input: number; rendered: number; skipped: number }>;
  treeConsistency: TreeConsistencyDiagnostics | null;
  warnings: string[];
  error: string | null;
  onCollapse: () => void;
}

export function CadInspectorPanel(props: CadInspectorPanelProps) {
  const {
    selectedEntityId,
    selectedEntityRecord,
    renderDiagnostics,
    runtimeDiagnostics,
    diagnosticRows,
    treeConsistency,
    warnings,
    error,
    onCollapse,
  } = props;

  const selectedHandle = selectedEntityRecord ? extractCadHandle(selectedEntityRecord) : '--';
  const selectedPropertySections = selectedEntityRecord ? buildEntityPropertySections(selectedEntityRecord) : [];

  return (
    <aside className="w-80 border-l border-gray-800 bg-gray-900 p-2 text-xs">
      <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>属性</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-gray-100"
          onClick={onCollapse}
          title="收起右侧栏"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between rounded border border-gray-800 bg-gray-950/70 px-2 py-1.5">
        <span className="text-[11px] text-gray-400">句柄</span>
        <span className="break-all text-cyan-100">{selectedHandle}</span>
      </div>
      <div className="mb-2 break-all rounded border border-gray-800 bg-gray-950/70 p-2 text-[11px] text-gray-300">{selectedEntityId ?? '--'}</div>

      {selectedEntityRecord ? (
        <div className="mb-2 max-h-80 space-y-2 overflow-auto pr-1">
          {selectedPropertySections.map((section) => (
            <details key={section.id} open={section.defaultOpen} className="rounded border border-gray-800 bg-gray-950/35">
              <summary className="flex cursor-pointer select-none items-center justify-between px-2 py-1.5 text-gray-300 hover:text-gray-100">
                <span>{section.title}</span>
                <span className="text-[10px] text-gray-500">{section.rows.length}</span>
              </summary>
              <div className="px-2 pb-2 pt-1">
                <div className="grid grid-cols-[116px_1fr] gap-x-2 gap-y-1">
                  {section.rows.map((row, index) => (
                    <div key={`${section.id}-${row.key}-${index}`} className="contents">
                      <span className="text-gray-500">{row.key}</span>
                      <span className="break-all text-gray-200">
                        {row.colorSwatch ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block h-3 w-3 rounded-sm border border-gray-500/70 align-middle"
                              style={{ backgroundColor: row.colorSwatch }}
                              aria-hidden="true"
                            />
                            <span>{row.value}</span>
                          </span>
                        ) : (
                          row.value
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
          <details>
            <summary className="cursor-pointer text-gray-500 hover:text-gray-300">原始 JSON</summary>
            <pre className="mt-1 max-h-56 overflow-auto rounded border border-gray-800 bg-gray-950/70 p-2 text-[11px] leading-4 text-gray-300">
              {JSON.stringify(selectedEntityRecord, null, 2)}
            </pre>
          </details>
        </div>
      ) : (
        <div className="mb-2 rounded border border-gray-800 bg-gray-950/70 p-2 text-gray-500">请选择图元查看属性。</div>
      )}

      <div className="mt-3 rounded border border-cyan-900/70 bg-cyan-950/20 p-2">
        <div className="mb-2 text-[11px] text-cyan-200">渲染诊断</div>
        {renderDiagnostics ? (
          <>
            <div className="space-y-1 text-[11px] text-cyan-100">
              <div>实体: {renderDiagnostics.entitiesProcessed}/{renderDiagnostics.entitiesInput} (隐藏 {renderDiagnostics.entitiesHidden})</div>
              <div>渲染/缺失: {renderDiagnostics.entitiesRendered}/{renderDiagnostics.entitiesMissingRender}</div>
              <div>回退实体: {renderDiagnostics.entitiesUsingFallback}</div>
              <div>图元: {renderDiagnostics.primitivesRendered}/{renderDiagnostics.primitivesInput} (跳过 {renderDiagnostics.primitivesSkipped})</div>
              <div>文字(Overlay/Engine): {renderDiagnostics.overlayTextCount}/{renderDiagnostics.engineTextCount}</div>
              {runtimeDiagnostics?.textGlyphs && (
                <>
                  <div>
                    字体: {runtimeDiagnostics.textGlyphs.fontFamily || '--'} / 模式 {runtimeDiagnostics.textGlyphs.renderMode || '--'} / 曲线细分{' '}
                    {runtimeDiagnostics.textGlyphs.curveSegments}
                  </div>
                  <div>字体URL: {runtimeDiagnostics.textGlyphs.fontPath || runtimeDiagnostics.fontAssetUrl || '--'}</div>
                  <div>
                    SHX单线: {runtimeDiagnostics.textGlyphs.shxStrokeTextEnabled ? '启用' : '禁用'} /{' '}
                    {runtimeDiagnostics.textGlyphs.shxFontLoaded ? '形字体OK' : '形字体缺失'} /{' '}
                    {runtimeDiagnostics.textGlyphs.shxBigFontLoaded ? 'Bigfont OK' : 'Bigfont缺失'} /{' '}
                    {runtimeDiagnostics.textGlyphs.shxBigFontMapLoaded ? '编码表OK' : '编码表缺失'} / 中文缩放{' '}
                    {runtimeDiagnostics.textGlyphs.shxBigFontScale.toFixed(2)}
                  </div>
                  <div>
                    SHX字体URL: {runtimeDiagnostics.textGlyphs.shxFontPath || '--'} / {runtimeDiagnostics.textGlyphs.shxBigFontPath || '--'}
                  </div>
                  {runtimeDiagnostics.textGlyphs.shxLoadError && <div>SHX加载错误: {runtimeDiagnostics.textGlyphs.shxLoadError}</div>}
                  <div>
                    文字对象/缺字: {runtimeDiagnostics.textGlyphs.textObjectCount}/{runtimeDiagnostics.textGlyphs.glyphMissingCount}
                  </div>
                  <div>
                    SHX/Typeface/Sprite: {runtimeDiagnostics.textGlyphs.shxTextObjectCount}/
                    {runtimeDiagnostics.textGlyphs.typefaceTextObjectCount}/{runtimeDiagnostics.textGlyphs.spriteTextObjectCount}
                  </div>
                  {runtimeDiagnostics.textGlyphs.mtextDefinedWidthCount > 0 && (
                    <div>
                      MTEXT宽度/换行: {runtimeDiagnostics.textGlyphs.mtextDefinedWidthCount}/
                      {runtimeDiagnostics.textGlyphs.mtextWrappedLineCount} · 最大行宽{' '}
                      {runtimeDiagnostics.textGlyphs.shxMaxLineAdvance.toFixed(2)} / 定义宽度{' '}
                      {runtimeDiagnostics.textGlyphs.shxWrapWidth.toFixed(2)}
                    </div>
                  )}
                  {(runtimeDiagnostics.textGlyphs.generatedQuestionMarkCount > 0 ||
                    runtimeDiagnostics.textGlyphs.sourceQuestionMarkCount > 0) && (
                    <div>
                      问号(源文本/缺字生成): {runtimeDiagnostics.textGlyphs.sourceQuestionMarkCount}/
                      {runtimeDiagnostics.textGlyphs.generatedQuestionMarkCount}
                    </div>
                  )}
                  {runtimeDiagnostics.textGlyphs.glyphMissingSamples.length > 0 && (
                    <div>缺字样例: {runtimeDiagnostics.textGlyphs.glyphMissingSamples.join(' ')}</div>
                  )}
                </>
              )}
              <div>网格实体: {renderDiagnostics.meshEntityCount}</div>
              {runtimeDiagnostics?.engineScene && (
                <div>
                  engine mesh/line nodes: {runtimeDiagnostics.engineScene.meshNodes}/{runtimeDiagnostics.engineScene.lineNodes} vtx:{' '}
                  {runtimeDiagnostics.engineScene.meshVertices}/{runtimeDiagnostics.engineScene.lineVertices}
                </div>
              )}
            </div>

            <div className="mt-2 max-h-44 overflow-auto rounded border border-cyan-900/60 bg-black/30 p-1">
              <table className="w-full text-[10px] text-cyan-100">
                <thead className="text-cyan-300">
                  <tr>
                    <th className="px-1 py-0.5 text-left">图元类型</th>
                    <th className="px-1 py-0.5 text-right">输入</th>
                    <th className="px-1 py-0.5 text-right">渲染</th>
                    <th className="px-1 py-0.5 text-right">跳过</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticRows.map((row) => (
                    <tr key={row.kind} className="border-t border-cyan-900/40">
                      <td className="px-1 py-0.5">{row.kind}</td>
                      <td className="px-1 py-0.5 text-right">{row.input}</td>
                      <td className="px-1 py-0.5 text-right">{row.rendered}</td>
                      <td className="px-1 py-0.5 text-right">{row.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-cyan-300/70">--</div>
        )}
      </div>

      <div className="mt-3 rounded border border-blue-900/70 bg-blue-950/20 p-2">
        <div className="mb-2 text-[11px] text-blue-200">树一致性</div>
        {treeConsistency ? (
          <div className="space-y-1 text-[11px] text-blue-100">
            <div>是否通过: {String(treeConsistency.ok)}</div>
            <div>空间: {treeConsistency.spaceId}</div>
            <div>实体/树节点: {treeConsistency.entityCount}/{treeConsistency.hierarchyCount}</div>
            <div>类型不一致: {treeConsistency.typeMismatches.length}</div>
            <div>子类型不一致: {treeConsistency.subtypeMismatches?.length ?? 0}</div>
            <div>树中缺失: {treeConsistency.missingInTree.length}</div>
            <div>树中冗余: {treeConsistency.extraInTree.length}</div>
            <div>字段缺失: {treeConsistency.missingRequiredFields.length}</div>
            <div>顺序稳定: {String(treeConsistency.orderStable)}</div>
          </div>
        ) : (
          <div className="text-[11px] text-blue-300/70">--</div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded border border-amber-700 bg-amber-900/20 p-2 text-xs text-amber-200">
          <div className="mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            警告 ({warnings.length})
          </div>
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="break-all">{warning}</div>
          ))}
        </div>
      )}

      {error && <div className="mt-3 rounded border border-red-800 bg-red-900/20 p-2 text-xs text-red-300">{error}</div>}
    </aside>
  );
}
