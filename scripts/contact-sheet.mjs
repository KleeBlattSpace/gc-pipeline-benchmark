#!/usr/bin/env node
/**
 * contact-sheet.mjs — CS-01 visual verification helper (LOCAL ONLY, outputs gitignored).
 * Renders a sheet scaled up with a grid overlay at the assumed tile size so a
 * human can verify atomization cuts before they enter the curated registry.
 * Usage: node scripts/contact-sheet.mjs <image> <tile> <scale> <out.png> [--cols N]
 *   --cols N: also render the first N cut cells as a strip below the sheet.
 */
import sharp from 'sharp';
import path from 'node:path';

const [img, tileS, scaleS, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const colsIdx = process.argv.indexOf('--cols');
const stripN = colsIdx === -1 ? 0 : Number(process.argv[colsIdx + 1] || 12);
if (!img || !tileS || !scaleS || !out) {
  console.error('usage: contact-sheet.mjs <image> <tile> <scale> <out.png> [--cols N]');
  process.exit(2);
}
const T = Number(tileS), S = Number(scaleS);
const meta = await sharp(img).metadata();
const W = meta.width, H = meta.height;
const sw = W * S, sh = H * S;

// grid overlay SVG
let lines = '';
for (let x = 0; x <= W; x += T) lines += `<line x1="${x * S}" y1="0" x2="${x * S}" y2="${sh}" stroke="#ff00ff" stroke-width="1"/>`;
for (let y = 0; y <= H; y += T) lines += `<line x1="0" y1="${y * S}" x2="${sw}" y2="${y * S}" stroke="#ff00ff" stroke-width="1"/>`;
// remainder highlight (pixels not covered by the grid)
const remX = W % T, remY = H % T;
const svg = `<svg width="${sw}" height="${sh}">${lines}`
  + (remX ? `<rect x="${(W - remX) * S}" y="0" width="${remX * S}" height="${sh}" fill="rgba(255,0,0,0.25)"/>` : '')
  + (remY ? `<rect x="0" y="${(H - remY) * S}" width="${sw}" height="${remY * S}" fill="rgba(255,0,0,0.25)"/>` : '')
  + `<text x="8" y="20" font-size="16" fill="#ffffff" stroke="#000000" stroke-width="3" paint-order="stroke">${path.basename(img)} ${W}x${H} grid=${T} rem=${remX},${remY}</text></svg>`;

let base = sharp(img).resize(sw, sh, { kernel: 'nearest' }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

if (stripN > 0) {
  // cut first stripN cells, scale each, join horizontally below
  const cells = [];
  const nx = Math.floor(W / T), ny = Math.floor(H / T);
  const raw = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const cellBufs = [];
  for (let i = 0; i < Math.min(stripN, nx * ny); i++) {
    const cx = (i % nx) * T, cy = Math.floor(i / nx) * T;
    const buf = Buffer.alloc(T * T * 4);
    for (let y = 0; y < T; y++) {
      const src = ((cy + y) * info.width + cx) * info.channels;
      data.copy(buf, y * T * 4, src, src + T * info.channels);
    }
    cellBufs.push(await sharp(buf, { raw: { width: T, height: T, channels: 4 } }).resize(T * S, T * S, { kernel: 'nearest' }).png().toBuffer());
  }
  const strip = await sharp({
    create: { width: cellBufs.length * T * S, height: T * S + 22, channels: 4, background: '#111827' },
  }).composite(cellBufs.map((input, i) => ({ input, top: 22, left: i * T * S }))).png().toBuffer();
  const sheet = await base.png().toBuffer();
  const sheetMeta = await sharp(sheet).metadata();
  const totalH = sheetMeta.height + T * S + 22 + 8;
  const totalW = Math.max(sheetMeta.width, cellBufs.length * T * S);
  const label = `<svg width="${totalW}" height="22"><text x="8" y="16" font-size="14" fill="#f8fafc">first ${cellBufs.length} cut cells (grid ${T}px)</text></svg>`;
  base = sharp({ create: { width: totalW, height: totalH, channels: 4, background: '#0b1220' } }).composite([
    { input: sheet, top: 0, left: 0 },
    { input: Buffer.from(label), top: sheetMeta.height + 4, left: 0 },
    { input: strip, top: sheetMeta.height + 8, left: 0 },
  ]);
}
await base.png().toFile(out);
console.log(`wrote ${out} (${W}x${H} / grid ${T} → ${Math.floor(W / T)}x${Math.floor(H / T)} cells, rem ${remX},${remY})`);
