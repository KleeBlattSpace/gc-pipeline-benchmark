#!/usr/bin/env node
/**
 * stratify-cs01.mjs — split the 240-tile sample by cell structure.
 * Rule (documented, structural): full-bleed = every image edge is ≥90% opaque
 * (content reaches all four edges, so standalone edge metrics are at least
 * *applicable*); otherwise fragment (assembly piece on transparent/empty
 * surround — standalone seam/border tests are category errors by construction).
 * Writes case-studies/01/data/stratification.json (committed, no images).
 */
import fs from 'node:fs';
import sharp from 'sharp';

const res = JSON.parse(fs.readFileSync('case-studies/01/data/batch-results.json', 'utf8'));
const out = { rule: 'full-bleed = each edge ≥90% opaque pixels; else fragment', generated_at: new Date().toISOString(), strata: {} };

for (const phase of ['before', 'after']) {
  const fb = [], fr = [];
  for (const t of res.tiles.filter((x) => x.phase === phase)) {
    const file = phase === 'before' ? t.file : t.file.replace('/_tiles/', '/_fixed/');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const edge = [0, 0, 0, 0], n = [W, W, H, H];
    for (let x = 0; x < W; x++) {
      if (data[(0 * W + x) * C + 3] >= 128) edge[0]++;
      if (data[((H - 1) * W + x) * C + 3] >= 128) edge[1]++;
    }
    for (let y = 0; y < H; y++) {
      if (data[(y * W + 0) * C + 3] >= 128) edge[2]++;
      if (data[(y * W + W - 1) * C + 3] >= 128) edge[3]++;
    }
    (edge.every((e, i) => e / n[i] >= 0.9) ? fb : fr).push(t);
  }
  const agg = (arr) => ({
    n: arr.length,
    production: arr.filter((t) => t.gate === 'Production').length,
    review: arr.filter((t) => t.gate === 'Review').length,
    reject: arr.filter((t) => t.gate === 'Reject').length,
    avg: Math.round((arr.reduce((s, t) => s + t.score, 0) / (arr.length || 1)) * 10) / 10,
  });
  out.strata[phase] = { full_bleed: agg(fb), fragment: agg(fr) };
}
await fs.promises.writeFile('case-studies/01/data/stratification.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.strata, null, 1));
