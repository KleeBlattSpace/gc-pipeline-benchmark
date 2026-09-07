#!/usr/bin/env tsx
/**
 * Case-study batch review harness (CS-01 … CS-N)
 * =================================================
 *
 * Scores real asset-pack tiles "before" (raw) and optionally "after"
 * (post-Doctor) through the same gates as the benchmark
 * (Production >= 92, Review 78–<92, Reject < 78 — imported from
 * Runner A's loss-functions, single source of truth) and emits:
 *
 *   case-studies/<id>/data/batch-results.json   machine-readable, provenance-stamped
 *   case-studies/<id>/data/tables.md            markdown fragments in the exact
 *                                               shape of the case study tables
 *
 * Scorer modes (--scorer):
 *   core   – the pinned tilefix-core submodule (evaluateQuality).
 *            REQUIRED for VERIFIED publications (--require-core enforces it).
 *   pixel  – public pixel-metric baseline implemented below (transparent
 *            heuristics; calibration comments included). Good for structure
 *            runs and before/after deltas while the core is unavailable.
 *   auto   – core if the submodule resolves, otherwise pixel with a loud notice.
 *
 * Usage:
 *   tsx scripts/case-study-batch.ts --manifest case-studies/01/packs-manifest.json
 *   tsx scripts/case-study-batch.ts --self-test
 *   tsx scripts/case-study-batch.ts --scorer core --require-core
 *
 * Drop-in location: gc-pipeline-benchmark repo root (scripts/).
 * Only dependencies already present there: sharp, tsx (node:* is stdlib).
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { gateForScore, type Gate } from '../runners/runner-a-scoring/loss-functions.js';

// ---------------------------------------------------------------- constants

const METRICS = ['seam', 'border', 'artifact', 'pattern', 'fidelity', 'textile'] as const;
type Metric = (typeof METRICS)[number];

const METRIC_WEIGHTS: Record<Metric, number> = {
  seam: 0.25, border: 0.2, artifact: 0.2, pattern: 0.1, fidelity: 0.15, textile: 0.1,
};

/** Metric → defect class naming used by the case-study taxonomy. */
const DEFECT_LABEL: Record<Metric, string> = {
  seam: 'Seam discontinuity',
  border: 'Border darkening / halo',
  artifact: 'Artifact (watermark / compression / stray pixels)',
  pattern: 'Pattern repetition',
  fidelity: 'Fidelity loss',
  textile: 'Textile irregularity',
};

const TILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_TILES_PER_PACK = 200;

// ------------------------------------------------------------------ types

interface PackEntry {
  id: string;                       // "A" … (pseudonym until license review)
  label?: string;
  rating?: number;                  // store rating, e.g. 4.9
  ratings_count?: number;
  source_url?: string;              // filled in SOURCES.md on VERIFIED release
  license?: string;
  before_dir: string;               // raw tiles (gitignored, never committed)
  after_dir?: string;               // post-Doctor export (gitignored)
  notes?: string;
}

interface Manifest {
  study: string;                    // "CS-01"
  expected_tiles?: number;          // cross-checked against discovery, e.g. 240
  pixel_class?: number;             // exact-size class, default 16
  hd_class?: number;                // normalized class, default 64
  packs: PackEntry[];
}

interface TileResult {
  pack: string;
  file: string;                     // path relative to repo root
  klass: '16x16' | '64x64';
  original: { w: number; h: number };
  sha256: string;
  phase: 'before' | 'after';
  score: number;                    // 0..100
  gate: Gate;
  metrics: Record<Metric, number>;  // 0..10, 10 = clean
  worst: Metric | 'none';
}

// ----------------------------------------------------------- small helpers

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Piecewise-linear calibration curve: points must be sorted by x. */
function curve(x: number, points: Array<[number, number]>): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1 || 1);
      return y1 + t * (y2 - y1);
    }
  }
  return last[1];
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const stdev = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
const pct1 = (n: number) => `${(n * 100).toFixed(1)} %`;

/** Deterministic RNG so self-test fixtures are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------- pixel baseline metrics
// All metrics are transparent heuristics on the raw RGBA buffer, normalized
// by the image's own global luminance spread so flat and busy tiles are
// treated fairly. Calibration curves live next to each metric — tune them
// against the public fixtures (npm run benchmark) if the baseline drifts.
// Anything subtler (true watermark detection, periodicity via autocorrelation)
// is deliberately left to the pinned core — this file stays explainable.

interface Pix { w: number; h: number; rgba: Uint8Array; L: Float32Array; alpha: Uint8Array }

async function loadPixels(file: string, pixelClass: number, hdClass: number) {
  const meta = await sharp(file).metadata();
  const ow = meta.width ?? 0;
  const oh = meta.height ?? 0;
  const isPixel = ow === pixelClass && oh === pixelClass;
  const size = isPixel ? pixelClass : hdClass; // HD sources normalize to hd_class
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .resize(size, size, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const L = new Float32Array(n);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    alpha[i] = data[i * 4 + 3];
  }
  return {
    original: { w: ow, h: oh },
    klass: (isPixel ? `${pixelClass}x${pixelClass}` : `${hdClass}x${hdClass}`) as '16x16' | '64x64',
    pix: { w: info.width, h: info.height, rgba: data, L, alpha } as Pix,
  };
}

function metricSeam(p: Pix): number {
  const { w, h, L } = p;
  // Edge continuity is measured against the image's OWN step size: a seamless
  // tile's boundary step ≈ an interior step; a seam is a step that towers over
  // the tile's typical gradient. (Normalizing by global std would punish busy
  // textures and let flat ones hide seams.)
  const stepV: number[] = [];
  const stepH: number[] = [];
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) stepV.push(Math.abs(L[y * w + x] - L[(y - 1) * w + x]));
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) stepH.push(Math.abs(L[y * w + x] - L[y * w + x - 1]));
  const edgeV: number[] = [];
  const edgeH: number[] = [];
  for (let x = 0; x < w; x++) edgeV.push(Math.abs(L[x] - L[(h - 1) * w + x])); // top ↔ bottom boundary
  for (let y = 0; y < h; y++) edgeH.push(Math.abs(L[y * w] - L[y * w + w - 1])); // left ↔ right boundary
  const baseV = Math.max(mean(stepV), 1.5); // floor keeps near-flat tiles at ratio ≈ 0
  const baseH = Math.max(mean(stepH), 1.5);
  const rV = mean(edgeV) / baseV;
  const rH = mean(edgeH) / baseH;
  const r = Math.max(rV, rH); // a seam on one axis is still a seam
  // r ≈ 1 → boundary behaves like an interior step; r ≥ 5 → hard seam
  return curve(r, [[0.9, 10], [1.4, 9], [2, 7.5], [3, 5], [5, 3], [9, 1.5]]);
}

function metricBorder(p: Pix): number {
  const { w, h, L, alpha } = p;
  const std = stdev(Array.from(L));
  const inner: number[] = [];
  const ringL: number[] = [];
  const ringA: number[] = [];
  const innerA: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const onRing = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const inner2 = x === 1 || y === 1 || x === w - 2 || y === h - 2;
      if (onRing) { ringL.push(L[i]); ringA.push(alpha[i]); }
      else if (inner2 || (w > 8 && h > 8 && (x + y) % 7 === 0)) inner.push(L[i]), innerA.push(alpha[i]);
    }
  }
  const fringe = Math.max(0, mean(inner) - mean(ringL) - 2); // darker border ⇒ positive
  const r = fringe / (std * 0.25 + 4);
  let score = curve(r, [[0.15, 10], [0.4, 8.5], [0.8, 6], [1.5, 3.5], [2.5, 1.5]]);
  const aFringe = Math.max(0, mean(innerA) - mean(ringA) - 6); // semi-transparent alpha fringe
  if (aFringe > 0) score = Math.min(score, curve(aFringe / 12, [[0.2, 10], [0.6, 7], [1.5, 4], [3, 2]]));
  return score;
}

function metricArtifact(p: Pix): number {
  const { w, h, L } = p;
  const residual: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const win: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) win.push(L[(y + dy) * w + x + dx]);
      win.sort((a, b) => a - b);
      residual.push(Math.abs(L[y * w + x] - win[4])); // |pixel − 3×3 median|
    }
  }
  const outliers = residual.filter((r) => r > 28).length / (residual.length || 1);
  // Impulse noise / stray pixels / blocky compression residue.
  // NOTE: structured watermarks are the core's job — this only catches speckle.
  return curve(outliers, [[0.002, 10], [0.008, 9], [0.02, 6.5], [0.05, 4], [0.12, 2]]);
}

function metricPattern(p: Pix): number {
  const { w, h, L } = p;
  const std = stdev(Array.from(L));
  if (std < 6) return 9; // near-flat: repetition is meaningless here
  const quads: number[][] = [[], [], [], []];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      quads[(y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1)].push(L[y * w + x]);
  const means = quads.map(mean);
  const stds = quads.map(stdev);
  const rep = (mean(means.map((m) => Math.abs(m - mean(means)))) + mean(stds.map((s) => Math.abs(s - mean(stds))))) / 2 / std;
  // rep → 0 ⇒ quadrants near-identical ⇒ visible period; rep ≈ 0.25+ is normal
  // statistical similarity on small tiles (quadrant means converge) and must
  // NOT count as repetition.
  return curve(rep, [[0.03, 2], [0.08, 4], [0.15, 7], [0.25, 8.8], [0.4, 10]]);
}

function metricFidelity(p: Pix): number {
  const { w, h, L } = p;
  const lap: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const c = L[y * w + x];
      lap.push(Math.abs(4 * c - L[(y - 1) * w + x] - L[(y + 1) * w + x] - L[y * w + x - 1] - L[y * w + x + 1]));
    }
  const v = stdev(lap); // Laplacian energy ≈ preserved detail
  return curve(v, [[1, 1.5], [4, 4.5], [9, 7], [25, 8.7], [64, 9.6], [128, 10]]);
}

function metricTextile(p: Pix): number {
  const { w, h, L } = p;
  const blockVars: number[] = [];
  const bs = 8;
  for (let by = 0; by + bs <= h; by += bs)
    for (let bx = 0; bx + bs <= w; bx += bs) {
      const vals: number[] = [];
      for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) vals.push(L[y * w + x]);
      blockVars.push(stdev(vals));
    }
  if (!blockVars.length || mean(blockVars) < 3) return 9; // uniformly calm texture
  const cv = stdev(blockVars) / (mean(blockVars) + 1e-3); // patchiness of texture frequency
  return curve(cv, [[0.3, 10], [0.6, 8.5], [0.9, 7], [1.3, 5.5], [2, 4]]);
}

function pixelBaselineScore(p: Pix): { score: number; metrics: Record<Metric, number> } {
  const metrics: Record<Metric, number> = {
    seam: metricSeam(p),
    border: metricBorder(p),
    artifact: metricArtifact(p),
    pattern: metricPattern(p),
    fidelity: metricFidelity(p),
    textile: metricTextile(p),
  };
  const score = clamp(Math.round(METRICS.reduce((s, m) => s + METRIC_WEIGHTS[m] * metrics[m], 0) * 10), 0, 100);
  return { score, metrics };
}

// ------------------------------------------------------------ core scorer
// Adapter for the pinned tilefix-core submodule. The core's exact call
// signature lives in the private repo — ADAPT HERE if it differs.
// The verified publication path MUST use this mode (--require-core).

interface CoreScorer { entry: string; commit: string; evaluate: (file: string) => Promise<{ score: number; metrics?: Record<string, number> }> }

async function loadCoreScorer(entryFlag?: string): Promise<CoreScorer | null> {
  const candidates = entryFlag
    ? [entryFlag]
    : ['tilefix-core/index.ts', 'tilefix-core/src/index.ts', 'tilefix-core/dist/index.js', 'tilefix-core/index.js'];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const mod: any = await import(pathToFileURL(path.resolve(c)).href);
    const fn = mod.evaluateQuality ?? mod.default?.evaluateQuality;
    if (typeof fn !== 'function') continue;
    let commit = 'unknown';
    try {
      const st = execSync('git submodule status tilefix-core', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      commit = (st.trim().split(/\s+/)[0] || 'unknown').replace(/^[+\-]/, '');
    } catch { /* git metadata absent (e.g. export) — provenance says 'unknown' */ }
    return {
      entry: c,
      commit,
      // ADAPT HERE: wrap the core's real signature. Default assumes it accepts
      // a file path or { filePath } and returns { score } or a number.
      evaluate: async (file: string) => {
        const out = await fn(file);
        const score = typeof out === 'number' ? out : out?.score;
        if (!Number.isFinite(score)) throw new Error(`core returned no usable score for ${file}`);
        return { score, metrics: typeof out === 'object' ? out.metrics : undefined };
      },
    };
  }
  return null;
}

// ------------------------------------------------------------ discovery

async function discoverTiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (TILE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  await walk(dir);
  return out.slice(0, MAX_TILES_PER_PACK);
}

async function sha256File(file: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex').slice(0, 16);
}

// ------------------------------------------------------------ aggregation

interface PhaseAgg { tiles: number; production: number; review: number; reject: number; avg: number }

function aggregate(results: TileResult[]): PhaseAgg {
  const scores = results.map((r) => r.score);
  return {
    tiles: results.length,
    production: results.filter((r) => r.gate === 'Production').length,
    review: results.filter((r) => r.gate === 'Review').length,
    reject: results.filter((r) => r.gate === 'Reject').length,
    avg: scores.length ? Math.round((mean(scores) + Number.EPSILON) * 10) / 10 : 0,
  };
}

function defectTaxonomy(before: TileResult[]): Array<{ label: string; metric: Metric; count: number; prevalence: number }> {
  const notPassing = before.filter((r) => r.gate !== 'Production');
  const counts = new Map<Metric, number>();
  for (const r of notPassing) {
    for (const m of METRICS) if (r.metrics[m] < 7) counts.set(m, (counts.get(m) ?? 0) + 1); // multi-defect counting allowed
  }
  const denom = notPassing.length || 1;
  return METRICS
    .map((m) => ({ label: DEFECT_LABEL[m], metric: m, count: counts.get(m) ?? 0, prevalence: (counts.get(m) ?? 0) / denom }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

// -------------------------------------------------------------- reporting

function renderTables(manifest: Manifest, before: TileResult[], after: TileResult[], scorerLabel: string): string {
  const b = aggregate(before);
  const a = aggregate(after);
  const tax = defectTaxonomy(before);
  const lines: string[] = [];

  lines.push(`<!-- Generated by scripts/case-study-batch.ts · ${new Date().toISOString()} · scorer: ${scorerLabel} -->`);
  lines.push(`<!-- Paste-blocks for docs/CASE_STUDY_01.md — replace illustrative tables, keep table shapes. -->`);
  lines.push('');

  lines.push('### 4.1 Gate distribution — before vs. after the fix pass');
  lines.push('');
  lines.push('| Gate | Threshold | Before | | After | |');
  lines.push('|---|---|---:|---:|---:|---:|');
  lines.push('| | | tiles | % | tiles | % |');
  lines.push(`| ✅ Production | ≥ 92 | ${b.production} | ${pct1(b.production / (b.tiles || 1))} | ${a.production} | ${pct1(a.production / (a.tiles || 1))} |`);
  lines.push(`| ⚠️ Review | 78 – <92 | ${b.review} | ${pct1(b.review / (b.tiles || 1))} | ${a.review} | ${pct1(a.review / (a.tiles || 1))} |`);
  lines.push(`| ❌ Reject | < 78 | ${b.reject} | ${pct1(b.reject / (b.tiles || 1))} | ${a.reject} | ${pct1(a.reject / (a.tiles || 1))} |`);
  lines.push(`| **Average score** | | **${b.avg.toFixed(1)}** | | **${a.avg.toFixed(1)}** | |`);
  lines.push('');

  lines.push('### 4.2 The defect taxonomy');
  lines.push('');
  lines.push('| # | Defect class | Metric | Prevalence |');
  lines.push('|---|---|---|---:|');
  tax.forEach((d, i) => lines.push(`| ${i + 1} | **${d.label}** | ${d.metric} | ${pct1(d.prevalence)} |`));
  lines.push('');

  lines.push('### 4.3 Per-pack view');
  lines.push('');
  lines.push('| Pack | Store rating | Tiles | Avg before | Worst defect class | Avg after |');
  lines.push('|---|---:|---:|---:|---|---:|');
  for (const pack of manifest.packs) {
    const pb = before.filter((r) => r.pack === pack.id);
    const pa = after.filter((r) => r.pack === pack.id);
    const ab = aggregate(pb);
    const aa = aggregate(pa);
    const worst = defectTaxonomy(pb)[0]?.metric ?? '—';
    lines.push(`| ${pack.id} | ${pack.rating?.toFixed(1) ?? '—'} ★ | ${pb.length} | ${ab.avg.toFixed(1)} | ${worst} | ${pa.length ? aa.avg.toFixed(1) : 'pending' } |`);
  }
  lines.push(`| **Σ / ø** | | **${b.tiles}** | **${b.avg.toFixed(1)}** | | ${a.tiles ? `**${a.avg.toFixed(1)}**` : 'pending'} |`);
  lines.push('');

  if (manifest.expected_tiles && before.length !== manifest.expected_tiles) {
    lines.push(`> ⚠️ COUNT MISMATCH: manifest expects ${manifest.expected_tiles} tiles, discovery found ${before.length}. Fix the manifest or the pack directories before publishing.`);
  }
  return lines.join('\n');
}

function provenanceBlock(manifest: Manifest, scorerLabel: string, before: TileResult[]): string {
  return [
    '| Field | Value |',
    '|---|---|',
    `| Data status | generated by batch harness — replace ILLUSTRATIVE only after --scorer core --require-core run |`,
    `| Scorer | ${scorerLabel} |`,
    `| Sample size | ${before.length} tiles, ${manifest.packs.length} packs (see manifest) |`,
    `| Dataset version | benchmark-v2 fixture set (16×16 + 64×64 classes) |`,
    `| Generated at | ${new Date().toISOString()} |`,
    `| Aggregation logic | mean per-tile score → gate counts; multi-defect counting (metric < 7/10) |`,
    `| Raw images | never mirrored in this repository (hashes only, in batch-results.json) |`,
  ].join('\n');
}

// ------------------------------------------------------------------ main

async function scoreDir(
  dir: string, packId: string, phase: 'before' | 'after',
  mode: 'core' | 'pixel', core: CoreScorer | null,
  pixelClass: number, hdClass: number,
): Promise<TileResult[]> {
  const files = await discoverTiles(dir);
  const results: TileResult[] = [];
  for (const file of files) {
    const sha = await sha256File(file);
    if (mode === 'core' && core) {
      // ADAPT HERE boundary: core mode forwards the original file untouched.
      const { score, metrics } = await core.evaluate(path.resolve(file));
      const gate = gateForScore(score);
      const metricMap: Record<Metric, number> = { seam: 10, border: 10, artifact: 10, pattern: 10, fidelity: 10, textile: 10 };
      if (metrics) for (const m of METRICS) if (Number.isFinite(metrics[m])) metricMap[m] = metrics[m];
      const worst = (METRICS.filter((m) => metricMap[m] < 7).sort((x, y) => metricMap[x] - metricMap[y])[0] ?? 'none') as Metric | 'none';
      const meta = await sharp(file).metadata();
      results.push({ pack: packId, file, klass: ((meta.width === pixelClass && meta.height === pixelClass) ? `${pixelClass}x${pixelClass}` : `${hdClass}x${hdClass}`) as '16x16' | '64x64', original: { w: meta.width ?? 0, h: meta.height ?? 0 }, sha256: sha, phase, score, gate, metrics: metricMap, worst });
    } else {
      const { klass, original, pix } = await loadPixels(file, pixelClass, hdClass);
      const { score, metrics } = pixelBaselineScore(pix);
      const worst = (METRICS.filter((m) => metrics[m] < 7).sort((x, y) => metrics[x] - metrics[y])[0] ?? 'none') as Metric | 'none';
      results.push({ pack: packId, file, klass, original, sha256: sha, phase, score, gate: gateForScore(score), metrics, worst });
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '');
  };
  const has = (name: string) => args.includes(`--${name}`);

  if (has('self-test')) return selfTest();

  const manifestPath = flag('manifest') ?? 'case-studies/01/packs-manifest.json';
  const outDir = flag('out') ?? path.dirname(manifestPath) + '/data';
  const scorerFlag = (flag('scorer') ?? 'auto') as 'auto' | 'core' | 'pixel';
  const requireCore = has('require-core');

  const manifest: Manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const pixelClass = manifest.pixel_class ?? 16;
  const hdClass = manifest.hd_class ?? 64;

  let core: CoreScorer | null = null;
  if (scorerFlag === 'core' || scorerFlag === 'auto') core = await loadCoreScorer(flag('core-entry') || undefined);
  let mode: 'core' | 'pixel';
  if (scorerFlag === 'core') {
    if (!core) { console.error('✖ --scorer core: tilefix-core could not be loaded (run `git submodule update --init --recursive` and `npm run core:check`).'); process.exit(2); }
    mode = 'core';
  } else if (scorerFlag === 'pixel') {
    mode = 'pixel';
  } else {
    mode = core ? 'core' : 'pixel';
    if (!core) console.log('ℹ tilefix-core not resolvable — falling back to PUBLIC PIXEL BASELINE. Numbers are NOT publication-grade. Use --require-core for the verified run.\n');
  }
  if (requireCore && mode !== 'core') { console.error('✖ --require-core given but core scorer unavailable. Verified publications require the pinned core.'); process.exit(2); }

  const scorerLabel = mode === 'core' ? `core (${core!.entry} @ ${core!.commit})` : 'pixel-baseline@1 (public heuristic)';

  const before: TileResult[] = [];
  const after: TileResult[] = [];
  for (const pack of manifest.packs) {
    before.push(...await scoreDir(pack.before_dir, pack.id, 'before', mode, core, pixelClass, hdClass));
    if (pack.after_dir) after.push(...await scoreDir(pack.after_dir, pack.id, 'after', mode, core, pixelClass, hdClass));
    const pb = before.filter((r) => r.pack === pack.id);
    console.log(`  ${pack.id}: ${pb.length} before${pack.after_dir ? ` / ${after.filter((r) => r.pack === pack.id).length} after` : ''}`);
  }
  if (!before.length) { console.error('✖ No tiles found — check manifest paths.'); process.exit(2); }

  await fs.mkdir(outDir, { recursive: true });
  const payload = {
    study: manifest.study,
    generated_at: new Date().toISOString(),
    scorer: scorerLabel,
    publication_grade: mode === 'core',
    manifest_packs: manifest.packs.map((p) => ({ id: p.id, rating: p.rating ?? null, source_url: p.source_url ?? null, license: p.license ?? null })),
    pooled: { before: aggregate(before), after: aggregate(after) },
    defect_taxonomy: defectTaxonomy(before),
    packs: manifest.packs.map((p) => ({ id: p.id, before: aggregate(before.filter((r) => r.pack === p.id)), after: aggregate(after.filter((r) => r.pack === p.id)) })),
    tiles: [...before, ...after],
  };
  await fs.writeFile(path.join(outDir, 'batch-results.json'), JSON.stringify(payload, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'tables.md'), renderTables(manifest, before, after, scorerLabel) + '\n\n## Provenance\n\n' + provenanceBlock(manifest, scorerLabel, before) + '\n');

  const b = payload.pooled.before;
  console.log(`\n✔ ${manifest.study}: ${b.tiles} tiles scored (${scorerLabel})`);
  console.log(`  before → ✅ ${b.production} · ⚠️ ${b.review} · ❌ ${b.reject} · avg ${b.avg}`);
  if (after.length) { const a = payload.pooled.after; console.log(`  after  → ✅ ${a.production} · ⚠️ ${a.review} · ❌ ${a.reject} · avg ${a.avg}`); }
  else console.log('  after  → pending (no after_dir in manifest yet)');
  console.log(`  wrote ${outDir}/batch-results.json and ${outDir}/tables.md`);
  if (!payload.publication_grade) console.log('  ⚠ public baseline only — run --scorer core --require-core before flipping the case study to VERIFIED.');
}

// -------------------------------------------------------------- self-test
// Generates synthetic packs with known defects into a temp dir and runs the
// full harness (discovery → scoring → aggregation → tables). Asserts harness
// invariants, not scorer quality. Run: tsx scripts/case-study-batch.ts --self-test

function periodicTexture(size: number, seed: number, opts: { jitter?: number; blur?: boolean; seam?: boolean; border?: boolean; speckle?: number; grid?: number }): { w: number; h: number; rgba: Buffer } {
  const rnd = mulberry32(seed);
  const g = opts.grid ?? 5; // wrapped control grid ⇒ tile is periodic by construction
  const ctl: number[] = Array.from({ length: g * g }, () => rnd());
  const w = size, h = size;
  const base = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * g, gy = (y / h) * g;
      const x0 = Math.floor(gx) % g, y0 = Math.floor(gy) % g;
      const x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
      const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
      const top = ctl[y0 * g + x0] * (1 - fx) + ctl[y0 * g + x1] * fx;
      const bot = ctl[y1 * g + x0] * (1 - fx) + ctl[y1 * g + x1] * fx;
      base[y * w + x] = 96 + (top * (1 - fy) + bot * fy) * 64; // 96..160
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = base[y * w + x];
      if (!opts.blur && opts.jitter) v += (rnd() - 0.5) * 2 * opts.jitter;
      if (opts.seam && x === 0) v *= 0.45;            // hard luminance step on left column
      if (opts.seam && x === w - 1) v *= 1.55;        // …and the right column ⇒ left↔right mismatch
      if (opts.border && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) v *= 0.72; // dark 1px ring
      if (opts.speckle && rnd() < opts.speckle) v = 255; // white impulse noise
      const c = clamp(Math.round(v), 0, 255);
      const i = (y * w + x) * 4;
      rgba[i] = c; rgba[i + 1] = c; rgba[i + 2] = c; rgba[i + 3] = 255;
    }
  }
  return { w, h, rgba };
}

async function selfTest() {
  const tmp = path.join(process.cwd(), '.case-study-selftest');
  await fs.rm(tmp, { recursive: true, force: true });
  const mk = async (dir: string, name: string, tex: { w: number; h: number; rgba: Buffer }) => {
    await fs.mkdir(dir, { recursive: true });
    await sharp(tex.rgba, { raw: { width: tex.w, height: tex.h, channels: 4 } }).png().toFile(path.join(dir, name));
  };
  const variants = {
    clean: (s: number, seed: number) => periodicTexture(s, seed, { jitter: 13, grid: 6 }),
    seam: (s: number, seed: number) => periodicTexture(s, seed, { jitter: 13, grid: 6, seam: true }),
    border: (s: number, seed: number) => periodicTexture(s, seed, { jitter: 13, grid: 6, border: true }),
    blur: (s: number, seed: number) => periodicTexture(s, seed, { blur: true, grid: 3 }), // 3-cell grid ⇒ genuinely over-smoothed
    speckle: (s: number, seed: number) => periodicTexture(s, seed, { jitter: 13, grid: 6, speckle: 0.03 }),
  } as const;
  // two packs; pack "ST-A" also gets an after-dir (cleaned versions of seam/border)
  for (const [pack, seedBase] of [['ST-A', 11], ['ST-B', 97]] as const) {
    const raw = path.join(tmp, 'raw', pack);
    for (const [name, gen] of Object.entries(variants)) {
      await mk(raw, `${name}_16.png`, gen(16, seedBase + name.length));
      await mk(raw, `${name}_64.png`, gen(64, seedBase + name.length * 3));
    }
  }
  const fixedA = path.join(tmp, 'fixed', 'ST-A');
  await mk(fixedA, 'seam_16.png', variants.clean(16, 411));
  await mk(fixedA, 'border_16.png', variants.clean(16, 412));

  const manifest: Manifest = {
    study: 'SELFTEST',
    expected_tiles: 20,
    packs: [
      { id: 'ST-A', rating: 4.9, before_dir: path.join(tmp, 'raw', 'ST-A'), after_dir: fixedA },
      { id: 'ST-B', rating: 4.7, before_dir: path.join(tmp, 'raw', 'ST-B') },
    ],
  };
  const manifestPath = path.join(tmp, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('— self-test: scoring synthetic packs with pixel baseline —');
  const before: TileResult[] = [];
  const after: TileResult[] = [];
  for (const pack of manifest.packs) {
    before.push(...(await scoreDir(pack.before_dir, pack.id, 'before', 'pixel', null, 16, 64)));
    if (pack.after_dir) after.push(...(await scoreDir(pack.after_dir, pack.id, 'after', 'pixel', null, 16, 64)));
  }
  const tables = renderTables(manifest, before, after, 'selftest');
  const resultsPath = path.join(tmp, 'tables.md');
  await fs.writeFile(resultsPath, tables);

  // ---- assertions: harness correctness + directional scorer sanity
  const find = (pack: string, name: string) => before.find((r) => r.pack === pack && r.file.endsWith(name))!;
  const failures: string[] = [];
  const expect = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };

  expect(before.length === 20, `expected 20 tiles, got ${before.length}`);
  expect(after.length === 2, `expected 2 after tiles, got ${after.length}`);
  const cleanA = find('ST-A', 'clean_16.png');
  const seamA = find('ST-A', 'seam_16.png');
  const borderA = find('ST-A', 'border_16.png');
  const blurA = find('ST-A', 'blur_16.png');
  const speckA = find('ST-A', 'speckle_16.png');
  expect(cleanA.gate === 'Production', `clean tile should pass Production, got ${cleanA.gate} (${cleanA.score})`);
  expect(seamA.score < cleanA.score - 10, `seam-broken (${seamA.score}) should score ≫ below clean (${cleanA.score})`);
  expect(borderA.score < cleanA.score - 8, `border-broken (${borderA.score}) should score well below clean (${cleanA.score})`);
  expect(speckA.score < cleanA.score, `speckle (${speckA.score}) should score below clean (${cleanA.score})`);
  expect(blurA.metrics.fidelity < 5, `blur fidelity should be < 5, got ${blurA.metrics.fidelity}`);
  expect(blurA.metrics.fidelity < cleanA.metrics.fidelity - 2, `blur fidelity (${blurA.metrics.fidelity}) should sit ≫ below clean (${cleanA.metrics.fidelity})`);
  expect(gateForScore(92) === 'Production' && gateForScore(91.9) === 'Review' && gateForScore(77.9) === 'Reject', 'gate thresholds drifted from loss-functions');
  expect(tables.includes('### 4.1') && tables.includes('### 4.3'), 'tables.md is missing fragments');
  expect(!tables.includes('COUNT MISMATCH'), 'count mismatch false positive');
  const agg = aggregate(before);
  expect(agg.production + agg.review + agg.reject === before.length, 'gate counts do not sum');

  const fixed = after[0];
  expect(fixed.gate === 'Production', `after-tile should be Production, got ${fixed.gate}`);

  console.log(`  clean ${cleanA.score} · seam-broken ${seamA.score} · border-broken ${borderA.score} · blur ${blurA.score} · speckle ${speckA.score}`);
  console.log(`  clean metrics: ${METRICS.map((m) => `${m}=${cleanA.metrics[m].toFixed(1)}`).join(' · ')}`);
  console.log(`  seam  metrics: ${METRICS.map((m) => `${m}=${seamA.metrics[m].toFixed(1)}`).join(' · ')}`);
  console.log(`  pooled: ✅ ${agg.production} ⚠️ ${agg.review} ❌ ${agg.reject} (of ${agg.tiles})`);
  if (failures.length) {
    console.error('\n✖ SELF-TEST FAILED:');
    failures.forEach((f) => console.error('   - ' + f));
    process.exit(1);
  }
  console.log('\n✔ self-test passed — harness (discovery → scoring → gating → aggregation → tables) is sound.');
  console.log(`  artifacts: ${resultsPath} (inspect and delete ${tmp} afterwards)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
