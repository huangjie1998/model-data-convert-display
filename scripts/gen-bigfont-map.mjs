#!/usr/bin/env node
/**
 * 为任意 BigFont SHX 生成 Unicode→SHX 内部码（GB2312/GBK/Big5）映射 JSON。
 *
 * 背景：
 *   AutoCAD BigFont（SHX 的 `bigfont` 子类）内部按 GB2312/GBK 双字节码组织字形。
 *   前端 Three.js 渲染拿到的是 Unicode 字符串，需要先翻成 BigFont 的内部 code 才能
 *   到 `ShxFont.hasChar(code)/getCadCharShape(code)` 查到字形。
 *
 *   `gbcbig.shx` 在 SHX 文件头里带了 subshape 表（Unicode→GB2312 的内嵌翻译），
 *   解析器走 `_resolveShxGlyph` 时不需要外部 map。但第三方 BigFont（如
 *   `EngineeringChinese.shx`、`@!hztxt万能字体.shx`）只有 GB2312 码段、没有 subshape
 *   表——前端只能靠这份外部 `*.gb2312-map.json` 把 Unicode 翻成 SHX code。
 *
 *   旧流程是为每个新 BigFont 手写 map（或一次性 dump）；本脚本把它做成"即插即用"：
 *   读 SHX → 列出所有合法 code → 用 TextDecoder 反查 Unicode → 写 JSON。
 *
 * 用法：
 *   node scripts/gen-bigfont-map.mjs <font.shx> [options]
 *
 * Options:
 *   --encoding <enc>   gb2312 | gbk | big5；默认 gb2312。
 *                      gbk 是 gb2312 的超集，遇到 GB 的扩展字（部首/扩展汉字）才需要切到 gbk。
 *   --out <file.json>  输出路径。默认放在 SHX 同目录、同名 + `.<encoding>-map.json`，
 *                      与已有 `EngineeringChinese.gb2312-map.json` 命名一致。
 *   --force            覆盖已存在的输出文件。
 *   --quiet            只打错误。
 *   --dry-run          只统计，不写文件。
 *
 * 输出格式（与 public/vendor/fonts/shx/EngineeringChinese.gb2312-map.json 一致）：
 *   { "字": <十进制 code>, ... }
 *
 * 例子：
 *   node scripts/gen-bigfont-map.mjs server/fonts/@!hztxt万能字体.shx --encoding gbk
 *   node scripts/gen-bigfont-map.mjs server/fonts/EngineeringChinese.shx
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage:
  node scripts/gen-bigfont-map.mjs <font.shx> [options]

Options:
  --encoding <enc>   gb2312 (default) | gbk | big5
  --out <file.json>  Output path. Default: <font>.<encoding>-map.json next to SHX.
  --force            Overwrite existing output file.
  --quiet            Only print errors.
  --dry-run          Don't write the file, just report stats.

Examples:
  node scripts/gen-bigfont-map.mjs server/fonts/EngineeringChinese.shx
  node scripts/gen-bigfont-map.mjs server/fonts/@!hztxt万能字体.shx --encoding gbk
`);
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length < 1 || args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(args.length < 1 ? 1 : 0);
  }

  const result = {
    fontPath: args.shift(),
    encoding: 'gb2312',
    outPath: null,
    force: false,
    quiet: false,
    dryRun: false,
  };

  while (args.length) {
    const arg = args.shift();
    switch (arg) {
      case '--encoding': {
        const v = String(args.shift() || '').toLowerCase();
        if (!['gb2312', 'gbk', 'big5'].includes(v)) {
          throw new Error(`Unsupported --encoding: ${v} (must be gb2312|gbk|big5)`);
        }
        result.encoding = v;
        break;
      }
      case '--out':
        result.outPath = args.shift();
        break;
      case '--force':
        result.force = true;
        break;
      case '--quiet':
        result.quiet = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

/** 编译 src/vendor/shx-parser-src/*.ts → CommonJS，复用 debug-shx-glyph.mjs 的套路。 */
function ensureCompiledParser() {
  const srcDir = path.join(repoRoot, 'src', 'vendor', 'shx-parser-src');
  const outDir = path.join(repoRoot, 'node_modules', '.tmp', 'gen-bigfont-map-parser');
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

  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
  return path.join(outDir, 'index.js');
}

/**
 * 用指定编码把一个 SHX 内部 code（uint16）反查成 Unicode 字符。
 * - 单字节 code（< 0x100）：直接当 ASCII。
 * - 双字节 code：BigFont 在文件里按 (highByte<<8 | lowByte) 存，所以拆字节直接 decode。
 *
 * 返回单个 Unicode 字符（可能是 BMP 之外的代理对，但 BigFont 不涉及），或 null（无效/控制符）。
 */
function decodeCode(code, decoder) {
  if (!Number.isFinite(code) || code <= 0 || code > 0xFFFF) return null;

  let bytes;
  if (code < 0x100) {
    // ASCII / 单字节区段：BigFont 在 < 0x80 区域基本是控制位，跳过。
    if (code < 0x20 || code === 0x7F) return null;
    bytes = new Uint8Array([code]);
  } else {
    const hi = (code >> 8) & 0xFF;
    const lo = code & 0xFF;
    // 双字节区段的高字节必须 ≥ 0x81（GB/GBK 的"区"起始）。
    // GB2312 高字节范围 0xA1..0xF7，低字节 0xA1..0xFE；
    // GBK 高字节 0x81..0xFE，低字节 0x40..0xFE（不含 0x7F）。
    // TextDecoder 拿到不合法的字节会抛错或返回 U+FFFD，下面统一过滤。
    bytes = new Uint8Array([hi, lo]);
  }

  let decoded;
  try {
    decoded = decoder.decode(bytes);
  } catch {
    return null;
  }
  if (!decoded || decoded.length === 0) return null;

  // 拒绝 U+FFFD（替换符）、控制符、PUA 私有区。
  // BigFont 的 code 0 是 font info（非字形），1-31 是控制位，都不能进 map。
  // PUA（U+E000-U+F8FF / U+F0000-U+FFFFD / U+100000-U+10FFFD）：字体作者自定义符号，
  // 前端拿到的 Unicode 字符串里不会出现这些值；留在 map 里既无用又会污染 dedup。
  for (const ch of decoded) {
    const cp = ch.codePointAt(0);
    if (cp === 0xFFFD) return null;
    if (cp < 0x20 || cp === 0x7F) return null;
    if (cp >= 0xE000 && cp <= 0xF8FF) return null;
    if (cp >= 0xF0000 && cp <= 0xFFFFD) return null;
    if (cp >= 0x100000 && cp <= 0x10FFFD) return null;
  }
  return decoded;
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = (...args) => { if (!options.quiet) console.log(...args); };
  const warn = (...args) => { if (!options.quiet) console.warn(...args); };

  const fontPath = path.resolve(process.cwd(), options.fontPath);
  if (!fs.existsSync(fontPath)) throw new Error(`Font not found: ${fontPath}`);

  const outPath = options.outPath
    ? path.resolve(process.cwd(), options.outPath)
    : (() => {
        const dir = path.dirname(fontPath);
        const base = path.basename(fontPath, path.extname(fontPath));
        return path.join(dir, `${base}.${options.encoding}-map.json`);
      })();

  if (!options.force && !options.dryRun && fs.existsSync(outPath)) {
    throw new Error(`Output exists (use --force to overwrite): ${outPath}`);
  }

  log(`[gen-bigfont-map] font:     ${fontPath}`);
  log(`[gen-bigfont-map] encoding: ${options.encoding}`);
  log(`[gen-bigfont-map] out:      ${outPath}${options.dryRun ? ' (dry-run)' : ''}`);

  const parserEntry = ensureCompiledParser();
  const require = createRequire(import.meta.url);
  const { ShxFont } = require(parserEntry);

  const buffer = fs.readFileSync(fontPath);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const font = new ShxFont(ab);
  const fontData = font.fontData;
  const fontType = fontData.header.fontType;

  log(`[gen-bigfont-map] fontType: ${fontType}, info: ${fontData.content.info || '(empty)'}`);

  if (fontType !== 'bigfont') {
    warn(`[gen-bigfont-map] WARNING: font is "${fontType}", not "bigfont". ` +
         `Generating a map probably doesn't make sense for this font.`);
  }

  // `decoder.decode` 默认对不合法字节会替换成 U+FFFD（不抛错）。
  // 我们靠 decodeCode 里的 U+FFFD 过滤来剔除不合法 code，所以这里不需要 fatal:true。
  const decoder = new TextDecoder(options.encoding);

  const data = fontData.content.data || {};
  const codes = Object.keys(data)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  log(`[gen-bigfont-map] total shapes in font: ${codes.length}`);

  /** @type {Record<string, number>} */
  const map = {};
  /** @type {Map<string, number[]>} 同一个 Unicode 字符被多个 code 命中时记录冲突 */
  const collisions = new Map();
  let asciiCount = 0;
  let cjkCount = 0;
  let skipped = 0;

  for (const code of codes) {
    const ch = decodeCode(code, decoder);
    if (ch === null) {
      skipped++;
      continue;
    }
    // BigFont 单字节段一般是 ASCII 重影，不放进 map（前端只在 CJK 路径用这张表）。
    if (code < 0x100) {
      asciiCount++;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(map, ch)) {
      const existing = map[ch];
      if (existing !== code) {
        const list = collisions.get(ch) || [existing];
        list.push(code);
        collisions.set(ch, list);
      }
      continue;
    }
    map[ch] = code;
    cjkCount++;
  }

  log(`[gen-bigfont-map] mapped:   ${cjkCount} CJK chars`);
  log(`[gen-bigfont-map] ascii:    ${asciiCount} (excluded from map)`);
  log(`[gen-bigfont-map] skipped:  ${skipped} (invalid / control / decode failed)`);
  if (collisions.size > 0) {
    log(`[gen-bigfont-map] collisions: ${collisions.size} chars decoded from multiple codes ` +
        `(kept first; this can happen when font encodes both GB2312 and GBK variants of the same glyph)`);
    if (!options.quiet) {
      let shown = 0;
      for (const [ch, list] of collisions) {
        if (shown++ >= 5) break;
        console.log(`  '${ch}' (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}): codes [${list.join(', ')}]`);
      }
      if (collisions.size > shown) console.log(`  ... and ${collisions.size - shown} more`);
    }
  }

  if (cjkCount === 0) {
    warn(`[gen-bigfont-map] WARNING: no CJK chars mapped. ` +
         `Wrong --encoding? Or this isn't a CJK BigFont.`);
  }

  // 输出与 EngineeringChinese.gb2312-map.json 同格式：单行不缩进太奢侈，按字符排序、紧凑。
  // 用 sorted keys 让 diff 稳定。
  const sortedKeys = Object.keys(map).sort();
  const lines = ['{'];
  sortedKeys.forEach((k, idx) => {
    const tail = idx === sortedKeys.length - 1 ? '' : ',';
    // JSON.stringify 对 key 自动处理转义（含双引号 / 反斜杠 / 控制符）。
    lines.push(`  ${JSON.stringify(k)}: ${map[k]}${tail}`);
  });
  lines.push('}');
  const json = lines.join('\n') + '\n';

  if (options.dryRun) {
    log(`[gen-bigfont-map] dry-run: would write ${json.length} bytes to ${outPath}`);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, 'utf8');
    log(`[gen-bigfont-map] wrote ${json.length} bytes → ${outPath}`);
  }
}

main().catch((err) => {
  console.error(`[gen-bigfont-map] ERROR: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
