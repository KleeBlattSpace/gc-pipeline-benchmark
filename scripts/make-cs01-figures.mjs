#!/usr/bin/env node
/**
 * make-cs01-figures.mjs — abstract SVG figures for CS-01 (no pack artwork reproduced).
 * Reads case-studies/01/data/{batch-results,stratification}.json → data/figures/*.svg
 */
import fs from 'node:fs';

const batch = JSON.parse(fs.readFileSync('case-studies/01/data/batch-results.json', 'utf8'));
const strat = JSON.parse(fs.readFileSync('case-studies/01/data/stratification.json', 'utf8'));
fs.mkdirSync('case-studies/01/data/figures', { recursive: true });

const C = { prod: '#34d399', rev: '#fbbf24', rej: '#f87171', bg: '#0b1220', tx: '#e2e8f0', mut: '#94a3b8' };

// --- fig 1: stratified gate distribution (100% stacked bars) ---
{
  const rows = [
    ['overall · before', batch.pooled.before],
    ['overall · after', batch.pooled.after],
    ['full-bleed · before', strat.strata.before.full_bleed],
    ['fragment · before', strat.strata.before.fragment],
  ];
  const W = 720, bh = 34, gap = 22, L = 170, R = 150, T = 56;
  const H = T + rows.length * (bh + gap) + 34;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += `<text x="${L}" y="26" font-size="17" fill="#f8fafc" font-family="sans-serif" font-weight="bold">CS-01 gate distribution — overall vs stratified (pixel baseline, n=240)</text>`;
  s += `<text x="${L}" y="44" font-size="12" fill="${C.mut}" font-family="sans-serif">fragments (assembly pieces) cannot pass standalone edge tests by construction — 0 Production before and after</text>`;
  rows.forEach(([label, g], i) => {
    const y = T + i * (bh + gap), bw = W - L - R;
    const p = g.production / g.tiles ?? g.production / g.n, r = g.review / (g.tiles ?? g.n);
    const n = g.tiles ?? g.n;
    const wp = bw * (g.production / n), wr = bw * (g.review / n);
    s += `<text x="${L - 10}" y="${y + 22}" font-size="13" fill="${C.tx}" text-anchor="end" font-family="sans-serif">${label} (n=${n})</text>`;
    s += `<rect x="${L}" y="${y}" width="${wp.toFixed(1)}" height="${bh}" fill="${C.prod}"/><rect x="${L + wp}" y="${y}" width="${wr.toFixed(1)}" height="${bh}" fill="${C.rev}"/><rect x="${L + wp + wr}" y="${y}" width="${(bw - wp - wr).toFixed(1)}" height="${bh}" fill="${C.rej}"/>`;
    s += `<text x="${L + bw + 10}" y="${y + 22}" font-size="12" fill="${C.mut}" font-family="sans-serif">${g.production}·${g.review}·${g.reject-rejectFix(g)} avg ${g.avg}</text>`;
  });
  function rejectFix(g) { return 0; }
  s += `<text x="${L}" y="${H - 10}" font-size="12" fill="${C.mut}" font-family="sans-serif"><tspan fill="${C.prod}">■</tspan> Production ≥92  <tspan fill="${C.rev}">■</tspan> Review 78–&lt;92  <tspan fill="${C.rej}">■</tspan> Reject &lt;78 · counts shown as P·R·X</text></svg>`;
  fs.writeFileSync('case-studies/01/data/figures/gates-stratified.svg', s + '\n');
  console.log('wrote figures/gates-stratified.svg');
}

// --- fig 2: metric means before → after ---
{
  const tiles = batch.tiles;
  const bef = tiles.filter((t) => t.phase === 'before'), aft = tiles.filter((t) => t.phase === 'after');
  const M = ['seam', 'border', 'artifact', 'pattern', 'fidelity', 'textile'];
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const b = Object.fromEntries(M.map((m) => [m, mean(bef.map((t) => t.metrics[m]))]));
  const a = Object.fromEntries(M.map((m) => [m, mean(aft.map((t) => t.metrics[m]))]));
  const W = 720, H = 400, L = 90, R = 40, T = 56, B = 40;
  const bw = W - L - R, bh = H - T - B;
  const X = (v) => L + (v / 10) * bw;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += `<text x="${L}" y="26" font-size="17" fill="#f8fafc" font-family="sans-serif" font-weight="bold">CS-01 metric means — before → after heuristic fix pass (0–10)</text>`;
  s += `<text x="${L}" y="44" font-size="12" fill="${C.mut}" font-family="sans-serif">target metrics improve (border, artifact); coupled metrics degrade (seam, fidelity) — naive fixes without degradation penalties</text>`;
  s += `<line x1="${X(7)}" y1="${T - 6}" x2="${X(7)}" y2="${T + bh}" stroke="#475569" stroke-dasharray="4 3"/><text x="${X(7)}" y="${T - 10}" font-size="11" fill="${C.mut}" text-anchor="middle" font-family="sans-serif">flag threshold 7</text>`;
  M.forEach((m, i) => {
    const y = T + (i + 0.5) * (bh / M.length);
    s += `<text x="${L - 10}" y="${y + 5}" font-size="13" fill="${C.tx}" text-anchor="end" font-family="sans-serif">${m}</text>`;
    s += `<line x1="${L}" y1="${y}" x2="${L + bw}" y2="${y}" stroke="#1e293b"/>`;
    s += `<line x1="${X(b[m])}" y1="${y}" x2="${X(a[m])}" y2="${y}" stroke="${a[m] >= b[m] ? C.prod : C.rej}" stroke-width="4"/>`;
    s += `<circle cx="${X(b[m])}" cy="${y}" r="5" fill="${C.bg}" stroke="${C.tx}" stroke-width="2"/><circle cx="${X(a[m])}" cy="${y}" r="5" fill="${a[m] >= b[m] ? C.prod : C.rej}"/>`;
    s += `<text x="${L + bw + 8}" y="${y + 4}" font-size="11" fill="${C.mut}" font-family="sans-serif">${b[m].toFixed(2)} → ${a[m].toFixed(2)}</text>`;
  });
  s += `<text x="${L}" y="${H - 10}" font-size="12" fill="${C.mut}" font-family="sans-serif">○ before · ● after · green = improved, red = degraded</text></svg>`;
  fs.writeFileSync('case-studies/01/data/figures/metrics-delta.svg', s + '\n');
  console.log('wrote figures/metrics-delta.svg');
}
