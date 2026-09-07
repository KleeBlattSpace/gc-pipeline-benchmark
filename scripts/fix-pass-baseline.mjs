#!/usr/bin/env node
/**
 * fix-pass-baseline.mjs — CS-01 PUBLIC-HEURISTIC fix pass (COMMITTED, disclosed).
 * ============================================================================
 * A minimal, fully transparent "after" leg for the structural run. It applies
 * at most two pixel-level ops per tile, ONLY when the corresponding baseline
 * metric flagged the tile (metric < 7) — mirroring Runner B's degradation
 * discipline (don't touch clean tiles):
 *
 *   op-border   1px outer ring ← nearest inner pixel (border normalization)
 *   op-despeck  |pixel − 3x3 median| > 28 → median   (impulse despeckle)
 *
 * Deliberately NOT attempted: seam healing (needs neighbor context — naive
 * edge blending destroys assembly pieces), pattern/fidelity/textile fixes
 * (need repaint-level ops = Doctor/core). The small resulting delta is itself
 * a finding: structural/assembly-context scores don't respond to pixel
 * touch-ups, which is why the VERIFIED leg needs the Doctor + pinned core.
 *
 * Usage: node scripts/fix-pass-baseline.mjs
 *   reads  case-studies/01/raw/<ID>/_tiles/*.png + data/batch-results.json
 *   writes case-studies/01/raw/<ID>/_fixed/*.png (LOCAL ONLY) + data/fixlog.json
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const RAW = 'case-studies/01/raw';
const results = JSON.parse(fs.readFileSync('case-studies/01/data/batch-results.json', 'utf8'));
const before = results.tiles.filter((t) => t.phase === 'before');

const fixlog = { generated_at: new Date().toISOString(), ops: 'border-normalize + despeckle, applied only when metric<7', tiles: [] };

for (const t of before) {
  const outDir = path.join(path.dirname(t.file), '..', '_fixed');
  await fs.promises.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, path.basename(t.file));
  const ops = [];
  const { data, info } = await sharp(t.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const px = (x, y, c) => data[(y * W + x) * C + c];

  if (t.metrics.border < 7) {
    ops.push('border');
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) {
      const sy = y === 0 ? 1 : H - 2;
      for (let c = 0; c < C; c++) data[(y * W + x) * C + c] = px(x, sy, c);
    }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) {
      const sx = x === 0 ? 1 : W - 2;
      for (let c = 0; c < C; c++) data[(y * W + x) * C + c] = px(sx, y, c);
    }
  }
  if (t.metrics.artifact < 7) {
    ops.push('despeckle');
    const L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.299 * data[i * C] + 0.587 * data[i * C + 1] + 0.114 * data[i * C + 2];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const win = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) win.push(L[(y + dy) * W + x + dx]);
        win.sort((a, b) => a - b);
        if (Math.abs(L[y * W + x] - win[4]) > 28) {
          // pull RGB toward the local median (grayscale median → per-channel shift)
          const shift = win[4] - L[y * W + x];
          for (let c = 0; c < 3; c++) data[(y * W + x) * C + c] = Math.max(0, Math.min(255, Math.round(data[(y * W + x) * C + c] + shift)));
        }
      }
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toFile(out);
  fixlog.tiles.push({ pack: t.pack, file: path.basename(t.file), ops, score_before: t.score });
}

await fs.promises.writeFile('case-studies/01/data/fixlog.json', JSON.stringify(fixlog, null, 2) + '\n');
const nB = fixlog.tiles.filter((t) => t.ops.includes('border')).length;
const nD = fixlog.tiles.filter((t) => t.ops.includes('despeckle')).length;
console.log(`✔ fix pass: ${fixlog.tiles.length} tiles → _fixed/ (${nB} border-normalized, ${nD} despeckled, ${fixlog.tiles.length - new Set(fixlog.tiles.filter((t) => t.ops.length).map((t) => t.file)).size} untouched)`);
