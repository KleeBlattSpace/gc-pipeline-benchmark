#!/usr/bin/env tsx
/**
 * audit-delivery-format.ts — CS-01 "Gap 0" audit: how do packs actually ship?
 * =============================================================================
 * Classifies each pack's delivery format and measures the atomization barrier:
 *
 *   - inventory: loose tile images vs atlas-sheet candidates (dimension heuristic)
 *   - atlas grid detection: gradient-energy projections per axis → dominant
 *     period (autocorrelation) → grid-line regularity → tile size, cols/rows, cells
 *   - packed/irregular atlases: big sheet, no dominant grid → still an atlas,
 *     but not machine-cuttable without smarter segmentation
 *   - pack-level format: atlas_only | loose_only | mixed
 *   - tile-level share: pre-cut tiles vs tiles locked inside sheets
 *
 * Output: case-studies/<id>/data/format-audit.json + format-audit.md
 *
 * Usage:
 *   tsx scripts/audit-delivery-format.ts --manifest case-studies/01/packs-manifest.json
 *   tsx scripts/audit-delivery-format.ts --self-test
 *
 * Drop-in: gc-pipeline-benchmark/scripts/ (deps: sharp only). Grid detection is
 * a transparent heuristic (documented curves/limits below) — the pinned core's
 * raster detection (Studio "Upload" step) remains the production-grade path.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const TILE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_SIDE = 2048;      // analysis cap (huge sheets downscaled — period detection survives)
const MIN_ATLAS_SIDE = 128; // below this an image is more likely a tile/sprite than a sheet
const GRID_REGULARITY_MIN = 0.6;
const LINE_STRENGTH_MIN = 1.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- grid detection

interface GridInfo { period: number; regularity: number; strength: number }

/**
 * Gradient-energy projection along one axis, then:
 *  1. autocorrelation over candidate periods (4 .. side/4) → dominant period
 *  2. grid-line strength at multiples of the period vs the projection median
 *  3. regularity = fraction of interior multiples that look like grid lines
 * Limits (documented): assumes grid anchored near 0 and uniform period —
 * padded/margined or multi-grid sheets score lower (they are usually also
 * not cleanly machine-cuttable, so the classification stays honest).
 */
function detectGridAxis(proj: Float64Array): GridInfo {
  const n = proj.length;
  const p = Array.from(proj);
  const mu = mean(p);
  const centered = p.map((v) => v - mu);
  const denom = centered.reduce((s, v) => s + v * v, 0) || 1;
  let bestPeriod = 0;
  let bestScore = 0;
  const maxLag = Math.min(256, Math.floor(n / 4));
  for (let lag = 4; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += centered[i] * centered[i + lag];
    const score = s / denom;
    if (score > bestScore) { bestScore = score; bestPeriod = lag; }
  }
  if (!bestPeriod) return { period: 0, regularity: 0, strength: 0 };

  const sorted = [...p].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-6;
  const interior: number[] = [];
  for (let k = 1; k * bestPeriod < n - 1; k++) {
    const pos = Math.round(k * bestPeriod);
    const local = Math.max(proj[pos - 1] ?? 0, proj[pos], proj[pos + 1] ?? 0);
    interior.push(local / median);
  }
  const lines = interior.filter((s) => s > LINE_STRENGTH_MIN).length;
  return { period: bestPeriod, regularity: interior.length ? lines / interior.length : 0, strength: bestScore };
}

interface AtlasInfo {
  file: string; w: number; h: number;
  is_atlas: boolean; kind: 'grid' | 'packed' | 'none';
  tile_w?: number; tile_h?: number; cols?: number; rows?: number; cells?: number;
  regularity?: number;
}

async function analyzeImage(file: string, rel: string): Promise<AtlasInfo> {
  const meta = await sharp(file).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const base: AtlasInfo = { file: rel, w, h, is_atlas: false, kind: 'none' };
  if (Math.min(w, h) < MIN_ATLAS_SIDE) return base; // loose tile / sprite, not a sheet

  const scale = Math.max(1, Math.max(w, h) / MAX_SIDE);
  const sw = Math.max(1, Math.round(w / scale));
  const sh = Math.max(1, Math.round(h / scale));
  const { data, info } = await sharp(file).greyscale().resize(sw, sh, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const L = data;
  const W = info.width;
  const H = info.height;

  const ex = new Float64Array(W); // vertical-edge energy per column
  const ey = new Float64Array(H); // horizontal-edge energy per row
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const dx = Math.abs(L[y * W + x] - L[y * W + x - 1]);
      const dy = Math.abs(L[y * W + x] - L[(y - 1) * W + x]);
      ex[x] += dx; ey[y] += dy;
    }
  }
  const gx = detectGridAxis(ex);
  const gy = detectGridAxis(ey);
  const periodOk = gx.period >= 4 && gy.period >= 4;
  const grid = periodOk && gx.regularity >= GRID_REGULARITY_MIN && gy.regularity >= GRID_REGULARITY_MIN;

  if (grid) {
    const tw = Math.round(gx.period * scale);
    const th = Math.round(gy.period * scale);
    const cols = Math.floor(w / tw);
    const rows = Math.floor(h / th);
    return { ...base, is_atlas: true, kind: 'grid', tile_w: tw, tile_h: th, cols, rows, cells: cols * rows, regularity: Math.min(gx.regularity, gy.regularity) };
  }
  // big sheet without a dominant uniform grid → packed/irregular atlas
  return { ...base, is_atlas: true, kind: 'packed' };
}

// ------------------------------------------------------------------ audit run

async function walkImages(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries: import('node:fs').Dirent[];
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (TILE_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

interface PackAudit {
  id: string; format: 'atlas_only' | 'loose_only' | 'mixed';
  loose_tiles: number; atlas_sheets: number; tiles_in_atlases: number;
  grid_atlases: number; packed_atlases: number;
  grids: Array<{ file: string; tile: string; cells: number; regularity: number }>;
}

async function auditPack(id: string, dir: string, root: string): Promise<PackAudit> {
  const files = await walkImages(dir);
  const results: AtlasInfo[] = [];
  for (const f of files) results.push(await analyzeImage(f, path.relative(root, f)));
  const loose = results.filter((r) => !r.is_atlas);
  const atlases = results.filter((r) => r.is_atlas);
  const grid = atlases.filter((r) => r.kind === 'grid');
  return {
    id,
    format: atlases.length && !loose.length ? 'atlas_only' : loose.length && !atlases.length ? 'loose_only' : 'mixed',
    loose_tiles: loose.length,
    atlas_sheets: atlases.length,
    tiles_in_atlases: grid.reduce((s, r) => s + (r.cells ?? 0), 0),
    grid_atlases: grid.length,
    packed_atlases: atlases.length - grid.length,
    grids: grid.map((r) => ({ file: r.file, tile: `${r.tile_w}×${r.tile_h}`, cells: r.cells ?? 0, regularity: Math.round((r.regularity ?? 0) * 100) / 100 })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
  const manifestPath = flag('manifest') ?? 'case-studies/01/packs-manifest.json';
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const outDir = path.join(path.dirname(manifestPath), 'data');
  await fs.mkdir(outDir, { recursive: true });

  const packs: PackAudit[] = [];
  for (const pack of manifest.packs) {
    const a = await auditPack(pack.id, path.resolve(pack.before_dir), process.cwd());
    packs.push(a);
    console.log(`  ${pack.id}: ${a.format.replace('_', '-')} · loose ${a.loose_tiles} · sheets ${a.atlas_sheets} (grid ${a.grid_atlases}, packed ${a.packed_atlases}) · tiles-in-sheets ${a.tiles_in_atlases}`);
  }

  const totalLoose = packs.reduce((s, p) => s + p.loose_tiles, 0);
  const totalInAtlas = packs.reduce((s, p) => s + p.tiles_in_atlases, 0);
  const atlasOnly = packs.filter((p) => p.format === 'atlas_only').length;
  const summary = {
    packs: packs.length,
    atlas_only: atlasOnly,
    mixed: packs.filter((p) => p.format === 'mixed').length,
    loose_only: packs.filter((p) => p.format === 'loose_only').length,
    pct_atlas_only: Math.round((atlasOnly / (packs.length || 1)) * 1000) / 10,
    tiles_precut: totalLoose,
    tiles_in_atlases: totalInAtlas,
    pct_tiles_locked_in_atlases: Math.round((totalInAtlas / (totalLoose + totalInAtlas || 1)) * 1000) / 10,
  };

  await fs.writeFile(path.join(outDir, 'format-audit.json'), JSON.stringify({ study: manifest.study, generated_at: new Date().toISOString(), summary, packs }, null, 2) + '\n');

  const md = [
    `<!-- Generated by scripts/audit-delivery-format.ts · ${new Date().toISOString()} -->`,
    '', '### 4.4 The delivery-format audit (Gap 0: atomization)', '',
    '| Pack | Format | Loose tiles | Atlas sheets | Grid-aligned | Packed | Tiles in sheets |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...packs.map((p) => `| ${p.id} | ${p.format.replace('_', '-')} | ${p.loose_tiles} | ${p.atlas_sheets} | ${p.grid_atlases} | ${p.packed_atlases} | ${p.tiles_in_atlases} |`),
    '', `**Pooled (illustrative until the real run):** ${summary.pct_atlas_only}% of packs ship atlas-only · ${summary.pct_tiles_locked_in_atlases}% of all delivered tiles arrive *inside* sheets (${totalInAtlas} of ${totalLoose + totalInAtlas}) · grid-aligned sheets are machine-cuttable, packed ones are not.`, '',
  ].join('\n');
  await fs.writeFile(path.join(outDir, 'format-audit.md'), md + '\n');
  console.log(`\n✔ ${summary.pct_atlas_only}% atlas-only · ${summary.pct_tiles_locked_in_atlases}% of tiles locked in sheets → ${path.relative(process.cwd(), outDir)}/format-audit.{json,md}`);
}

// ------------------------------------------------------------------ self-test

async function selfTest() {
  let failures = 0;
  const expect = (c: boolean, msg: string) => { if (!c) { failures++; console.log('  ✖ ' + msg); } else console.log('  ✔ ' + msg); };
  const tmp = await fs.mkdtemp('/tmp/cs01-audit-');

  // (a) grid atlas: 8×8 cells of 16px, distinct cell contents
  const g = 8, cell = 16, side = g * cell;
  const buf = Buffer.alloc(side * side * 4);
  const rnd = mulberry32(42);
  const cellBase: number[] = Array.from({ length: g * g }, () => 60 + rnd() * 120);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const v = cellBase[Math.floor(y / cell) * g + Math.floor(x / cell)] + (rnd() - 0.5) * 8;
    const i = (y * side + x) * 4;
    buf[i] = buf[i + 1] = buf[i + 2] = clamp(Math.round(v), 0, 255); buf[i + 3] = 255;
  }
  const atlasFile = path.join(tmp, 'sheet_grid.png');
  await sharp(buf, { raw: { width: side, height: side, channels: 4 } }).png().toFile(atlasFile);
  const a = await analyzeImage(atlasFile, 'sheet_grid.png');
  expect(a.is_atlas && a.kind === 'grid', `grid atlas detected (kind=${a.kind})`);
  expect(a.tile_w === 16 && a.tile_h === 16, `tile size 16×16 (got ${a.tile_w}×${a.tile_h})`);
  expect(a.cells === 64, `64 cells (got ${a.cells})`);
  expect((a.regularity ?? 0) > 0.75, `regularity > 0.75 (got ${a.regularity?.toFixed(2)})`);

  // (b) packed/irregular: big image, no uniform grid
  const noise = Buffer.alloc(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.round(rnd() * 255);
    noise[i * 4] = noise[i * 4 + 1] = noise[i * 4 + 2] = v; noise[i * 4 + 3] = 255;
  }
  const packedFile = path.join(tmp, 'sheet_packed.png');
  await sharp(noise, { raw: { width: 256, height: 256, channels: 4 } }).png().toFile(packedFile);
  const b = await analyzeImage(packedFile, 'sheet_packed.png');
  expect(b.is_atlas && b.kind === 'packed', `packed sheet → not grid (kind=${b.kind})`);

  // (c) loose tile: small image stays a tile
  const tileFile = path.join(tmp, 'tile.png');
  await sharp(Buffer.alloc(16 * 16 * 4).fill(128), { raw: { width: 16, height: 16, channels: 4 } }).png().toFile(tileFile);
  const c = await analyzeImage(tileFile, 'tile.png');
  expect(!c.is_atlas, 'loose 16×16 tile not classified as atlas');

  // (d) pack-level classification
  const packDir = path.join(tmp, 'packA'); await fs.mkdir(packDir);
  await fs.copyFile(atlasFile, path.join(packDir, 'sheet_grid.png'));
  let p = await auditPack('T', packDir, tmp);
  expect(p.format === 'atlas_only' && p.tiles_in_atlases === 64, `atlas_only + 64 tiles counted (got ${p.format}/${p.tiles_in_atlases})`);
  await fs.copyFile(tileFile, path.join(packDir, 'bonus_tile.png'));
  p = await auditPack('T', packDir, tmp);
  expect(p.format === 'mixed', `adding a loose tile → mixed (got ${p.format})`);

  await fs.rm(tmp, { recursive: true, force: true });
  console.log(failures ? `✖ ${failures} failures` : '✔ self-test passed (grid detection, packed sheets, loose tiles, pack classification)');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
