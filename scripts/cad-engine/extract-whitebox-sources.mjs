import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const bundlePath = path.join(repoRoot, 'public/vendor/cadPreivew.min.js');
const outputRoot = path.join(repoRoot, 'src/vendor/cad-engine-whitebox');
const outputSourcesRoot = path.join(outputRoot, 'sources');
const outputMetaPath = path.join(outputRoot, 'extraction-meta.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeSourcePath(sourcePath, index) {
  let safe = sourcePath.replace(/^[A-Za-z]:\\/g, '');
  safe = safe.replace(/^\.\//, '');
  safe = safe.replace(/^\//, '');
  safe = safe.replace(/\?/g, '_');
  safe = safe.replace(/\*/g, '_');
  safe = safe.replace(/</g, '_');
  safe = safe.replace(/>/g, '_');
  safe = safe.replace(/\|/g, '_');
  safe = safe.replace(/"/g, '_');
  safe = safe.replace(/:/g, '_');

  if (!safe || safe.endsWith('/')) {
    safe = `unknown/source_${index}.txt`;
  }
  return safe;
}

function extractInlineSourceMap(bundleText) {
  const marker = '//# sourceMappingURL=data:application/json;charset=utf-8;base64,';
  const idx = bundleText.lastIndexOf(marker);
  if (idx < 0) {
    throw new Error('Inline source map marker not found in bundle.');
  }
  const base64 = bundleText.slice(idx + marker.length).trim();
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

function writeSources(sourceMap) {
  const sources = Array.isArray(sourceMap.sources) ? sourceMap.sources : [];
  const contents = Array.isArray(sourceMap.sourcesContent) ? sourceMap.sourcesContent : [];

  ensureDir(outputSourcesRoot);

  const written = [];
  for (let i = 0; i < sources.length; i += 1) {
    const sourcePath = String(sources[i] ?? `unknown/source_${i}.txt`);
    const content = String(contents[i] ?? '');
    const safeRelative = sanitizeSourcePath(sourcePath, i);
    const outPath = path.join(outputSourcesRoot, safeRelative);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, content, 'utf8');
    written.push({
      index: i,
      source: sourcePath,
      output: path.relative(outputRoot, outPath).replace(/\\/g, '/'),
      bytes: Buffer.byteLength(content, 'utf8'),
    });
  }
  return written;
}

function main() {
  ensureDir(outputRoot);
  const bundleText = fs.readFileSync(bundlePath, 'utf8');
  const sourceMap = extractInlineSourceMap(bundleText);
  const files = writeSources(sourceMap);

  const meta = {
    extractedAt: new Date().toISOString(),
    bundlePath: path.relative(repoRoot, bundlePath).replace(/\\/g, '/'),
    fileCount: files.length,
    includesSourcesContent: Array.isArray(sourceMap.sourcesContent),
    files,
  };

  fs.writeFileSync(outputMetaPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`Extracted ${files.length} source files to ${path.relative(repoRoot, outputSourcesRoot)}`);
}

main();
