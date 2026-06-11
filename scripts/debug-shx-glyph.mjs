#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage:
  node scripts/debug-shx-glyph.mjs <font.shx> <text> [options]

Options:
  --height <number>      Text/font height passed to getCadCharShape/getCharShape. Default: 10
  --map <file.json>      Optional char->SHX-code map, same idea as Scene3D._shxCodeForChar
  --json                 Output JSON only

Examples:
  node scripts/debug-shx-glyph.mjs server/fonts/gbcbig.shx 单 --height 10
  node scripts/debug-shx-glyph.mjs server/fonts/gbcbig.shx 单 --height 10 --map public/vendor/fonts/shx/EngineeringChinese.gb2312-map.json
`);
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length < 2 || args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(args.length < 2 ? 1 : 0);
  }

  const result = {
    fontPath: args.shift(),
    text: args.shift(),
    height: 10,
    mapPath: null,
    json: false,
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === '--height') {
      result.height = Number(args.shift());
    } else if (arg === '--map') {
      result.mapPath = args.shift();
    } else if (arg === '--json') {
      result.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(result.height) || result.height <= 0) {
    throw new Error(`Invalid --height: ${result.height}`);
  }
  return result;
}

function ensureCompiledParser() {
  const srcDir = path.join(repoRoot, 'src', 'vendor', 'shx-parser-src');
  const outDir = path.join(repoRoot, 'node_modules', '.tmp', 'debug-shx-parser');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const tsconfigPath = path.join(outDir, 'tsconfig.json');
  const relativeSrcDir = path.relative(outDir, srcDir).replace(/\\/g, '/');
  fs.writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'CommonJS',
      moduleResolution: 'node',
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
      verbatimModuleSyntax: false,
      strict: false,
      skipLibCheck: true,
      noEmitOnError: false,
      outDir: '.',
      rootDir: relativeSrcDir,
      declaration: false,
      sourceMap: false,
    },
    include: [`${relativeSrcDir}/*.ts`],
  }, null, 2));

  const tscCli = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

  const compiled = spawnSync(process.execPath, [tscCli, '-p', tsconfigPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (compiled.status !== 0) {
    throw new Error(`Failed to compile shx-parser-src:\n${compiled.stdout}\n${compiled.stderr}`);
  }

  const pkgPath = path.join(outDir, 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify({ type: 'commonjs' }, null, 2));
  return path.join(outDir, 'index.js');
}

function loadMap(mapPath) {
  if (!mapPath) return null;
  const abs = path.resolve(repoRoot, mapPath);
  const raw = fs.readFileSync(abs, 'utf8');
  return JSON.parse(raw);
}

function codeForChar(char, codeMap) {
  const codePoint = char.codePointAt(0);
  if (codeMap && Object.prototype.hasOwnProperty.call(codeMap, char)) {
    const mapped = Number(codeMap[char]);
    if (Number.isFinite(mapped) && mapped > 0) {
      return { codePoint, shxCode: mapped, source: 'map' };
    }
  }
  return { codePoint, shxCode: codePoint, source: 'unicode-codepoint' };
}

function bboxToObject(bbox) {
  if (!bbox) return null;
  return {
    minX: bbox.minX,
    minY: bbox.minY,
    maxX: bbox.maxX,
    maxY: bbox.maxY,
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
  };
}

function pointToObject(point) {
  if (!point) return null;
  return { x: point.x, y: point.y };
}

function summarizeShape(shape) {
  if (!shape) return null;
  const polylines = shape.polylines || [];
  return {
    bbox: bboxToObject(shape.bbox),
    lastPoint: pointToObject(shape.lastPoint),
    polylineCount: polylines.length,
    pointCount: polylines.reduce((sum, pl) => sum + pl.length, 0),
    firstPolyline: polylines[0]?.slice(0, 8).map(pointToObject) || [],
  };
}

function summarizeCadResult(result) {
  if (!result) return null;
  const polylines = result.polylines || [];
  return {
    bbox: bboxToObject(result.bbox),
    lastPoint: pointToObject(result.lastPoint),
    finalScale: result.finalScale,
    baselineY: result.baselineY,
    polylineCount: polylines.length,
    pointCount: polylines.reduce((sum, pl) => sum + pl.length, 0),
    firstPolyline: polylines[0]?.slice(0, 8).map(pointToObject) || [],
  };
}

function computeWorldBBox(bbox, insertion, xScale = 1, yScale = 1) {
  if (!bbox) return null;
  return {
    minX: insertion.x + bbox.minX * xScale,
    minY: insertion.y + bbox.minY * yScale,
    maxX: insertion.x + bbox.maxX * xScale,
    maxY: insertion.y + bbox.maxY * yScale,
    width: (bbox.maxX - bbox.minX) * xScale,
    height: (bbox.maxY - bbox.minY) * yScale,
  };
}

function printReport(report) {
  console.log('=== SHX glyph debug ===');
  console.log(`font: ${report.font.path}`);
  console.log(`fontType: ${report.font.type}`);
  console.log(`info: ${report.font.info}`);
  console.log(`height(cellH): ${report.font.height}, width: ${report.font.width}, baseUp: ${report.font.baseUp}, baseDown: ${report.font.baseDown}`);
  console.log(`input text: ${report.input.text}`);
  console.log(`text height: ${report.input.height}`);
  console.log(`scale formula: height / cadCellH = ${report.input.height} / ${report.font.cadCellHeight} = ${report.scale}`);
  console.log(`map: ${report.input.mapPath || '(none)'}`);

  for (const glyph of report.glyphs) {
    console.log('\n--- char ---');
    console.log(`char: ${glyph.char}`);
    console.log(`unicode codePoint: ${glyph.codePoint} (0x${glyph.codePoint.toString(16)})`);
    console.log(`shx code: ${glyph.shxCode} (0x${glyph.shxCode.toString(16)}), source: ${glyph.codeSource}`);
    console.log(`hasChar(shxCode): ${glyph.hasChar}`);

    if (glyph.cadShape) {
      console.log('getCadCharShape bbox:', glyph.cadShape.bbox);
      console.log('getCadCharShape lastPoint:', glyph.cadShape.lastPoint);
      console.log(`polylines/points: ${glyph.cadShape.polylineCount}/${glyph.cadShape.pointCount}`);
      console.log('world bbox at insertion(0,0):', glyph.worldBBoxAtOrigin);
      console.log(`world minY formula: 0 + ${glyph.cadShape.bbox.minY} = ${glyph.worldBBoxAtOrigin.minY}`);
    } else {
      console.log('getCadCharShape: null');
    }

    if (glyph.legacyShape) {
      console.log('getCharShape legacy bbox:', glyph.legacyShape.bbox);
      console.log('getCharShape legacy lastPoint:', glyph.legacyShape.lastPoint);
    } else {
      console.log('getCharShape legacy: null');
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const fontPath = path.resolve(repoRoot, options.fontPath);
const map = loadMap(options.mapPath);
const parserEntry = ensureCompiledParser();
const require = createRequire(import.meta.url);
const { ShxFont } = require(parserEntry);

const buffer = fs.readFileSync(fontPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const font = new ShxFont(arrayBuffer);
const fontData = font.fontData;

function cadCellHeight(fontData) {
  if (fontData.header.fontType === 'bigfont') {
    const above = Number(fontData.content.baseUp);
    return above > 0 ? above : 8;
  }
  return fontData.content.height;
}

const scale = options.height / cadCellHeight(fontData);
const glyphs = [...options.text].map((char) => {
  const code = codeForChar(char, map);
  const hasChar = font.hasChar(code.shxCode);
  const cadResult = hasChar ? font.getCadCharShape(code.shxCode, { fontSize: options.height }) : null;
  const legacyShape = hasChar ? font.getCharShape(code.shxCode, options.height) : null;
  const cadShape = summarizeCadResult(cadResult);

  return {
    char,
    codePoint: code.codePoint,
    shxCode: code.shxCode,
    codeSource: code.source,
    hasChar,
    cadShape,
    legacyShape: summarizeShape(legacyShape),
    worldBBoxAtOrigin: cadShape ? computeWorldBBox(cadShape.bbox, { x: 0, y: 0 }) : null,
  };
});

const report = {
  input: {
    fontPath: options.fontPath,
    text: options.text,
    height: options.height,
    mapPath: options.mapPath,
  },
  font: {
    path: fontPath,
    type: fontData.header.fontType,
    header: fontData.header.fileHeader,
    version: fontData.header.fileVersion,
    info: fontData.content.info,
    height: fontData.content.height,
    cadCellHeight: cadCellHeight(fontData),
    width: fontData.content.width,
    baseUp: fontData.content.baseUp,
    baseDown: fontData.content.baseDown,
    orientation: fontData.content.orientation,
    isExtended: fontData.content.isExtended,
  },
  scale,
  glyphs,
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}
