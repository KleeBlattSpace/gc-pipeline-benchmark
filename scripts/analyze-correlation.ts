#!/usr/bin/env tsx
/**
 * analyze-correlation.ts — CS-01: does popularity predict failure? (pre-registered)
 * =============================================================================
 * Tests the pre-registered hypotheses from docs/CASE_STUDY_01.md §3.1:
 *
 *   H1  higher pack popularity ↔ higher share of tiles failing gates
 *   H2  any H1 association is mediated by delivery format (atlas-orientation)
 *   H3  exceptions (popular AND beginner-ready) exist — the barrier is a choice
 *
 * Stats (pack-level, n = manifest packs):
 *   - Spearman ρ between popularity (downloads; fallback: inverse rank) and
 *     % tiles not passing gates (Review+Reject, before-phase)
 *   - permutation p-value (10,000 label shuffles, seeded → reproducible)
 *   - exploratory partial ρ controlling for atlas-share (needs format-audit.json)
 *   - outlier/exception detection via rank-residuals (H3 candidates)
 *
 * Outputs: case-studies/<id>/data/correlation.{json,md} + scatter SVG figure.
 *
 * Honesty rules baked in: n=10 is pilot-grade — outputs always print n and the
 * "no headline claim without ρ AND p together" reminder; verdicts are canned
 * ("consistent with H1" / "not consistent" / "underpowered"), never "proven".
 *
 * Usage:
 *   tsx scripts/analyze-correlation.ts --manifest case-studies/01/packs-manifest.json
 *   tsx scripts/analyze-correlation.ts --self-test
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PERMS = 10_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ statistics

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // mid-rank for ties
    for (let k = i; k <= j; k++) out[idx[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

const spearman = (xs: number[], ys: number[]) => pearson(ranks(xs), ranks(ys));

/** Permutation two-sided p-value for Spearman ρ (seeded → reproducible). */
function permP(xs: number[], ys: number[], seed = 20260907): { rho: number; p: number } {
  const rho = spearman(xs, ys);
  const rnd = mulberry32(seed);
  const n = ys.length;
  let count = 0;
  for (let it = 0; it < PERMS; it++) {
    const perm = ys.slice();
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    if (Math.abs(spearman(xs, perm)) >= Math.abs(rho) - 1e-12) count++;
  }
  return { rho, p: (count + 1) / (PERMS + 1) };
}

/** Exploratory: partial Spearman via rank-residualization (control z). */
function partialSpearman(xs: number[], ys: number[], z: number[]): number {
  const rx = ranks(xs), ry = ranks(ys), rz = ranks(z);
  // OLS residual of a on b in rank space: a - (r_ab * sigma_a / sigma_b) * (b - mean_b)
  const resid = (a: number[], b: number[]) => {
    const slope = (pearson(b, a) * stdev(a)) / (stdev(b) || 1);
    return a.map((v, i) => v - slope * (b[i] - mean(b)));
  };
  return pearson(resid(rx, rz), resid(ry, rz));
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const stdev = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / (a.length || 1));

/** H3 exceptions: largest rank-space residual from the ρ-fit. */
function exceptions(packs: string[], xs: number[], ys: number[]): Array<{ pack: string; residual: number }> {
  const rx = ranks(xs), ry = ranks(ys);
  const b = pearson(rx, ry);
  return packs
    .map((pack, i) => ({ pack, residual: Math.abs(ry[i] - b * rx[i]) }))
    .sort((a, c) => c.residual - a.residual)
    .slice(0, 3);
}

function verdict(n: number, rho: number, p: number): string {
  if (n < 8) return 'underpowered — report, do not headline';
  if (p > 0.05) return 'not consistent with H1 at α=0.05 — popularity does not predict failure here; report honestly (a null is also a finding)';
  return rho > 0
    ? `consistent with H1 (ρ=+${rho.toFixed(2)}, p=${p.toFixed(3)}) — pilot-grade only; headline allowed in the soft form, never "proven"`
    : `INVERSE of H1 (ρ=${rho.toFixed(2)}, p=${p.toFixed(3)}) — more popular packs fail LESS here; report honestly and revisit the mechanism`;
}

// -------------------------------------------------------------------- figure

function scatterSvg(points: Array<{ pack: string; x: number; y: number }>, title: string): string {
  const W = 720, H = 460, L = 70, R = 30, T = 50, B = 50;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = 0, y1 = 100;
  const px = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const py = (y: number) => H - B - ((y - y0) / (y1 - y0 || 1)) * (H - T - B);
  const dots = points.map((p) =>
    `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="7" fill="#fbbf24" stroke="#0b1220" stroke-width="2"/>` +
    `<text x="${(px(p.x) + 11).toFixed(1)}" y="${(py(p.y) + 4).toFixed(1)}" font-size="14" fill="#e2e8f0" font-family="sans-serif">${p.pack}</text>`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0b1220"/>
  <text x="${L}" y="28" font-size="17" fill="#f8fafc" font-family="sans-serif" font-weight="bold">${title}</text>
  <text x="${L}" y="46" font-size="12" fill="#94a3b8" font-family="sans-serif">each dot = one pack · y = % tiles below Production gate (before fix pass)</text>
  <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#334155" stroke-width="2"/>
  <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#334155" stroke-width="2"/>
  ${[0, 25, 50, 75, 100].map((v) => `<text x="${L - 10}" y="${py(v) + 4}" font-size="12" fill="#64748b" text-anchor="end" font-family="sans-serif">${v}%</text>`).join('\n  ')}
  <text x="${(W - R + L) / 2}" y="${H - 15}" font-size="12" fill="#7dd3fc" text-anchor="middle" font-family="sans-serif">pack popularity (downloads)</text>
  ${dots}
</svg>\n`;
}

// ----------------------------------------------------------------------- run

interface RunInput { packs: Array<{ id: string; downloads?: number | null; rank?: number }> }

async function analyze(manifestPath: string, auditPath?: string) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const results = JSON.parse(await fs.readFile(path.join(path.dirname(manifestPath), 'data', 'batch-results.json'), 'utf8'));
  const perPack = new Map<string, { fail: number; total: number }>();
  for (const t of results.tiles ?? []) {
    if (t.phase !== 'before') continue;
    const e = perPack.get(t.pack) ?? { fail: 0, total: 0 };
    e.total++; if (t.gate !== 'Production') e.fail++;
    perPack.set(t.pack, e);
  }
  const rows = (manifest.packs as RunInput['packs']).map((p) => {
    const e = perPack.get(p.id) ?? { fail: 0, total: 0 };
    return { id: p.id, downloads: p.downloads, rank: p.rank, failPct: e.total ? (e.fail / e.total) * 100 : 0, tiles: e.total };
  }).filter((r) => r.tiles > 0);

  const pop = rows.map((r) => r.downloads ?? (r.rank ? -r.rank : NaN));
  const fail = rows.map((r) => r.failPct);
  if (pop.some(Number.isNaN)) throw new Error('packs need downloads or rank for popularity');

  const { rho, p } = permP(pop, fail);
  const exc = exceptions(rows.map((r) => r.id), pop, fail);

  let partial: number | null = null;
  if (auditPath) {
    const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'));
    const atlasShare = new Map(audit.packs.map((a: any) => [a.id, a.atlas_sheets ? a.tiles_in_atlases / Math.max(1, a.tiles_in_atlases + a.loose_tiles) : 0]));
    const z = rows.map((r) => atlasShare.get(r.id) ?? 0);
    partial = partialSpearman(pop, fail, z);
  }

  const outDir = path.join(path.dirname(manifestPath), 'data');
  await fs.mkdir(outDir, { recursive: true });
  const summary = {
    n: rows.length, spearman_rho: Math.round(rho * 1000) / 1000, perm_p: Math.round(p * 1000) / 1000,
    partial_rho_controlling_atlas_share: partial === null ? null : Math.round(partial * 1000) / 1000,
    exceptions_by_residual: exc, verdict: verdict(rows.length, rho, p),
    reminder: 'pre-registered in CS-01 §3.1 — report ρ and p together; n=10 is pilot-grade; never headline "proven"',
  };
  await fs.writeFile(path.join(outDir, 'correlation.json'), JSON.stringify({ generated_at: new Date().toISOString(), ...summary, packs: rows }, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'correlation-scatter.svg'), scatterSvg(rows.map((r) => ({ pack: r.id, x: r.downloads ?? r.rank, y: r.failPct })), 'Popularity vs. failure share (before fix pass)'));
  const md = [
    `<!-- Generated by scripts/analyze-correlation.ts · ${new Date().toISOString()} -->`, '',
    '### 4.5 Does popularity predict failure? *(pre-registered H1)*', '',
    `**n = ${summary.n} packs** · Spearman **ρ = ${summary.spearman_rho > 0 ? '+' : ''}${summary.spearman_rho}** · permutation **p = ${summary.perm_p}**${partial !== null ? ` · partial ρ (controlling atlas-share, exploratory) = ${partial > 0 ? '+' : ''}${partial.toFixed(2)}` : ''}`, '',
    `Verdict: ${summary.verdict}`, '',
    `Exception candidates (largest residuals — H3, "the barrier is a choice"): ${exc.map((e) => `${e.pack} (${e.residual.toFixed(1)})`).join(', ')}`, '',
    `![scatter](correlation-scatter.svg)`, '',
  ].join('\n');
  await fs.writeFile(path.join(outDir, 'correlation.md'), md + '\n');
  console.log(`ρ=${summary.spearman_rho} p=${summary.perm_p} (n=${summary.n}) → ${outDir}/correlation.{json,md} + scatter SVG`);
  console.log(`  ${summary.verdict}`);
}

// ------------------------------------------------------------------ self-test

async function selfTest() {
  let failures = 0;
  const expect = (c: boolean, msg: string) => { if (!c) { failures++; console.log('  ✖ ' + msg); } else console.log('  ✔ ' + msg); };
  const tmp = await fs.mkdtemp('/tmp/cs01-corr-');

  // stats primitives
  expect(Math.abs(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]) - 1) < 1e-9, 'spearman perfect monotone = 1');
  expect(Math.abs(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]) + 1) < 1e-9, 'spearman inverse = -1');
  expect(Math.abs(spearman([1, 2, 3, 4], [1, 2, 3, 4]) - pearson([1, 2, 3, 4], [1, 2, 3, 4])) < 1e-9, 'rank fallback consistent');

  // H1 scenario: popularity predicts failure (seeded, deterministic)
  const popA = [5e3, 12e3, 30e3, 60e3, 90e3, 140e3, 200e3, 310e3, 500e3, 800e3];
  const failA = [12, 18, 25, 30, 38, 44, 51, 60, 66, 75];
  const a = permP(popA, failA);
  expect(a.rho > 0.95 && a.p <= 0.05, `H1 detected: ρ=${a.rho.toFixed(3)}, p=${a.p.toFixed(4)} (seeded permutation)`);

  // null scenario: rank-independent pattern → no signal
  const failNull = [30, 70, 30, 70, 30, 70, 30, 70, 30, 70]; // alternating, trend-free vs x
  const b = permP(popA, failNull);
  expect(Math.abs(b.rho) < 0.3, `null: |ρ| small (got ${b.rho.toFixed(3)})`);

  // H3 exceptions: 9 trend + 1 wild off-trend pack
  const failExc = [...failA]; failExc[7] = 5; // popular pack that ships beginner-ready
  const exc = exceptions('ABCDEFGHIJ'.split(''), popA, failExc);
  expect(exc[0].pack === 'H', `exception located (got ${exc[0].pack})`);

  // partial spearman sanity: controlling the mediator kills the association
  const atlas = popA.map((_, i) => i); // perfect mediator proxy
  const partial = partialSpearman(popA, failA, atlas);
  expect(Math.abs(partial) < 0.2, `partial ρ ≈ 0 when controlling perfect mediator (got ${partial.toFixed(3)})`);

  // figure smoke
  const svg = scatterSvg(popA.map((x, i) => ({ pack: 'ABCDEFGHIJ'[i], x, y: failA[i] })), 'selftest');
  expect(svg.startsWith('<svg') && svg.includes('circle'), 'scatter SVG generated');

  // end-to-end on synthetic manifest + results
  const dir = path.join(tmp, 'case-studies', '01');
  await fs.mkdir(path.join(dir, 'data'), { recursive: true });
  const synthManifest = {
    study: 'SELFTEST',
    packs: popA.map((d, i) => ({ id: 'ABCDEFGHIJ'[i], downloads: d, rank: i + 1, before_dir: 'x' })),
  };
  await fs.writeFile(path.join(dir, 'packs-manifest.json'), JSON.stringify(synthManifest));
  const tiles: unknown[] = [];
  popA.forEach((_, i) => {
    const n = 24, nFail = Math.round((failA[i] / 100) * n);
    for (let k = 0; k < n; k++) tiles.push({ pack: 'ABCDEFGHIJ'[i], phase: 'before', gate: k < nFail ? 'Reject' : 'Production' });
  });
  await fs.writeFile(path.join(dir, 'data', 'batch-results.json'), JSON.stringify({ tiles }));
  await analyze(path.join(dir, 'packs-manifest.json'));
  const corr = JSON.parse(await fs.readFile(path.join(dir, 'data', 'correlation.json'), 'utf8'));
  expect(corr.n === 10 && corr.spearman_rho > 0.9 && corr.perm_p <= 0.05, `end-to-end: ρ=${corr.spearman_rho}, p=${corr.perm_p} written`);
  expect((await fs.readFile(path.join(dir, 'data', 'correlation-scatter.svg'), 'utf8')).length > 500, 'figure written');

  await fs.rm(tmp, { recursive: true, force: true });
  console.log(failures ? `✖ ${failures} failures` : '✔ self-test passed (ρ, permutation p, exceptions, partial ρ, figure, end-to-end)');
  process.exit(failures ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
else {
  const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i === -1 ? undefined : args[i + 1]; };
  analyze(flag('manifest') ?? 'case-studies/01/packs-manifest.json', flag('format-audit')).catch((e) => { console.error(e); process.exit(1); });
}
