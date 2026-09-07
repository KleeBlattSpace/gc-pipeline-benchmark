#!/usr/bin/env node
/**
 * atomize-cs01.mjs — CS-01 curated atomization + sampling (COMMITTED methodology).
 * ============================================================================
 * Why this exists: the pre-registered heuristic grid detector
 * (scripts/audit-delivery-format.ts) was run as-is for the Gap-0 audit, but on
 * real packs it misfires both ways — spurious micro-periods on noisy sheets
 * (E cover art "4x4", G 3x-scaled sheets "6x6"), 3x-multiple periods on
 * autotile sheets (H terrain "96x96" instead of 32), missed sparse-but-aligned
 * grids (I industrial sheets → "packed"), and doc/mockup false positives.
 * Cutting tiles on those periods would fabricate broken tiles.
 *
 * So tile EXTRACTION uses a curated registry below: every entry names the
 * sheet, the tile size, and the source of truth (Tiled .tsx / filename /
 * author convention / visual verification via scripts/contact-sheet.mjs).
 * All sizes were human-verified against grid-overlay renders before sampling.
 *
 * Sampling (deterministic, seed 20260907):
 *   pool = all non-empty cells of a pack's registry sheets (J: loose files)
 *   empty = transparent sheets: <2% opaque pixels
 *           opaque sheets: luma stdev < 1.0 (uniform fills carry no tile info)
 *   sample = seeded shuffle(pool)[:24]  → 240 tiles total, 24 per pack
 *
 * Outputs (gitignored working dirs + committed registry record):
 *   case-studies/01/raw/<ID>/_tiles/*.png     sampled tiles (LOCAL ONLY)
 *   case-studies/01/data/registry.json         registry + counts + sampling log
 *
 * Usage: node scripts/atomize-cs01.mjs [--tiles-only]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const RAW = 'case-studies/01/raw';
const SEED = 20260907;
const PER_PACK = 24;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Registry: sheet path (relative to RAW/<ID>/_extracted or RAW/<ID>), tile px,
 * truth = how the size was established.
 *   tsx      — Tiled .tsx tileset metadata shipped with the pack
 *   filename — size stated in the file name
 *   visual   — human-verified on grid-overlay render (contact-sheet.mjs)
 *   author   — author's documented convention for the pack family
 */
const REGISTRY = {
  A: { size: 16, truth: 'visual+author (Cup Nooble 16px family; all sheets 16-multiples, overlay-verified)', sheets: [
    'Sprout Lands - Sprites - Basic pack/Tilesets/Grass.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Hills.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Tilled Dirt.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Tilled_Dirt.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Tilled_Dirt_v2.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Tilled_Dirt_Wide.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Tilled_Dirt_Wide_v2.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Water.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Fences.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Doors.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Wooden House.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Wooden_House_Roof_Tilset.png',
    'Sprout Lands - Sprites - Basic pack/Tilesets/Wooden_House_Walls_Tilset.png',
    'Sprout Lands - Sprites - Basic pack/Objects/Paths.png',
  ]},
  B: { size: 16, truth: 'visual+author (Cup Nooble 16px family; GrassLayers/snow/ground sheets overlay-verified)', sheets: [
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/Grass_Tile_Layers.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/Grass_Tile_layers2.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/Grass_Tile_layers3.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/Grass_Tile_layers4.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/blue_tint_Grass_Tile_Layers.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/blue_tint_Grass_Tile_Layers2.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/blue_tint_Grass_Tile_Layers3.png',
    'Sprout Sorry pack/Early Access/Plant update 2/Ground tilesets/blue_tint_Grass_Tile_Layers4.png',
    'Sprout Sorry pack/Early Access/Sprout winter/snow tiles 1.png',
    'Sprout Sorry pack/Early Access/Sprout winter/snow tiles 2.png',
    'Sprout Sorry pack/Early Access/Sprout winter/ice tiles.png',
    'Sprout Sorry pack/Early Access/Dungeon Pack/tiles/Dungeon_walls.png',
    'Sprout Sorry pack/Early Access/Dungeon Pack/tiles/ground_dirt_orange.png',
    'Sprout Sorry pack/Early Access/Dungeon Pack/tiles/ground_dirt_orange_dark.png',
    'Sprout Sorry pack/Early Access/Dungeon Pack/tiles/Rails.png',
    'Sprout Sorry pack/Early Access/Dungeon Pack/tiles/dungeon_walls_decor_gates.png',
  ]},
  C: { size: 16, truth: 'visual+author (Pixel_Poem 16px dungeon family; sheets 16-multiples, overlay-verified)', sheets: [
    { file: '2D Pixel Dungeon Asset Pack/Dungeon_Tileset_at.png', exclude: [{ x: 0, y: 0, w: 512, h: 96 }] }, // title lettering block, not tiles
    '2D Pixel Dungeon Asset Pack/character and tileset/Dungeon_Tileset.png',
  ]},
  D: { size: 32, truth: 'visual (overlay-verified: features snap to 32, span 2x2 at 16; Stone Ground also detector-confirmed 32 reg=1.0)', sheets: [
    'Texture/TX Tileset Grass.png',
    'Texture/TX Tileset Stone Ground.png',
    'Texture/TX Tileset Wall.png',
  ]},
  E: { size: 16, truth: 'visual+author (Anokolisa 16px sidescroller family; Tiles.png overlay-verified)', sheets: [
    'Legacy-Fantasy - High Forest 2.3/Assets/Tiles.png',
    'Legacy-Fantasy - High Forest 2.3/Assets/Interior-01.png',
    'Legacy Fantasy - Debug Map/Assets/Tiles.png',
  ]},
  F: { size: 16, truth: 'visual+author (Szadi 16px platformer family; mainlev overlay-verified)', sheets: [
    'mainlev_build.png',
  ]},
  G: { size: 16, truth: 'tsx (gentle forest v01.tsx: tilewidth=16) + visual overlay-verified', sheets: [
    'gentle sheets/gentle forest v01.png',
    { file: 'gentle sheets/gentle 32x32 v01.png', size: 32, truth: 'tsx (tilewidth=32)' },
  ], note: 'v02/v03 palette variants excluded from sampling (identical layouts, would triple-count); counted as shipped sheets in the audit' },
  H: { size: 32, truth: 'filename (32x32) + visual overlay-verified', sheets: [
    'Sprites/14-TileSets/Terrain (32x32).png',
    'Sprites/14-TileSets/Decorations (32x32).png',
  ]},
  I: { size: 16, truth: 'visual+author (0x72 16px family; v1+v2 overlay-verified grid-aligned; heuristic detector missed: sparse content)', sheets: [
    { file: 'industrial.v1.png', size: 16 },
    { file: 'industrial.v2.png', size: 16 },
  ], note: 'sheets live directly in raw/I (shipped as bare PNGs, not zipped)' },
  J: { size: 64, truth: 'loose files (no cutting; isometric 64x64 blocks, projection caveat applies)', loose: 'Isometric_Tiles_Pixel_Art/Blocks' },
};

const norm = (s) => (typeof s === 'string' ? { file: s } : s);

async function cellStats(buf, channels) {
  // buf: T*T*channels raw; returns {opaqueShare, lumaStd}
  const n = buf.length / channels;
  let opaque = 0;
  const L = [];
  for (let i = 0; i < n; i++) {
    const a = channels === 4 ? buf[i * channels + 3] : 255;
    if (a >= 128) opaque++;
    L.push(0.299 * buf[i * channels] + 0.587 * buf[i * channels + 1] + 0.114 * buf[i * channels + 2]);
  }
  const mean = L.reduce((s, v) => s + v, 0) / L.length;
  const std = Math.sqrt(L.reduce((s, v) => s + (v - mean) ** 2, 0) / L.length);
  return { opaqueShare: opaque / n, lumaStd: std };
}

async function atomizeSheet(pack, entry, defaultSize) {
  const { file, size, exclude } = { size: defaultSize, ...norm(entry) };
  const base = pack === 'I' ? path.join(RAW, pack) : path.join(RAW, pack, '_extracted');
  const full = path.join(base, file);
  const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const T = size;
  const nx = Math.floor(info.width / T), ny = Math.floor(info.height / T);
  const cells = [];
  let skippedEmpty = 0, skippedExcluded = 0;
  for (let cy = 0; cy < ny; cy++) {
    for (let cx = 0; cx < nx; cx++) {
      const px = cx * T, py = cy * T;
      if ((exclude || []).some((r) => px < r.x + r.w && px + T > r.x && py < r.y + r.h && py + T > r.y)) { skippedExcluded++; continue; }
      const buf = Buffer.alloc(T * T * info.channels);
      for (let y = 0; y < T; y++) {
        const src = ((py + y) * info.width + px) * info.channels;
        data.copy(buf, y * T * info.channels, src, src + T * info.channels);
      }
      const st = await cellStats(buf, info.channels);
      const hasAlpha = info.channels === 4;
      // empty rule: transparent sheets → <2% opaque; opaque sheets → uniform (std<1)
      // (checked per-cell: cells with real transparency use the alpha rule)
      const usesAlpha = hasAlpha && st.opaqueShare < 0.999;
      const empty = usesAlpha ? st.opaqueShare < 0.02 : st.lumaStd < 1.0;
      if (empty) { skippedEmpty++; continue; }
      cells.push({ buf, channels: info.channels, cx, cy, file });
    }
  }
  return { cells, nx, ny, addressable: nx * ny, skippedEmpty, skippedExcluded, w: info.width, h: info.height, size: T };
}

async function main() {
  const tilesOnly = process.argv.includes('--tiles-only');
  const log = { seed: SEED, per_pack: PER_PACK, generated_at: new Date().toISOString(), packs: {} };
  let totalSampled = 0;

  for (const [pack, cfg] of Object.entries(REGISTRY)) {
    const outDir = path.join(RAW, pack, '_tiles');
    if (!tilesOnly) await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    const packLog = { tile_size: cfg.size, truth: cfg.truth, sheets: [], pool: 0, sampled: 0 };

    let pool = [];
    if (cfg.loose) {
      const dir = path.join(RAW, pack, '_extracted', cfg.loose);
      const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
      for (const f of files) {
        const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const st = await cellStats(data, info.channels);
        if (st.opaqueShare < 0.02) continue;
        pool.push({ looseFile: path.join(dir, f), name: f });
      }
      packLog.sheets.push({ file: cfg.loose + '/*.png (loose, no cutting)', addressable: files.length });
    } else {
      for (const entry of cfg.sheets) {
        const r = await atomizeSheet(pack, entry, cfg.size);
        packLog.sheets.push({
          file: norm(entry).file, tile: `${r.size}x${r.size}`, dims: `${r.w}x${r.h}`,
          addressable: r.addressable, skipped_empty: r.skippedEmpty, skipped_excluded: r.skippedExcluded,
          pooled: r.cells.length,
        });
        pool.push(...r.cells.map((c) => ({ ...c, sheet: norm(entry).file, size: r.size })));
      }
    }
    packLog.pool = pool.length;

    // seeded shuffle, take 24
    const rnd = mulberry32(SEED + pack.charCodeAt(0));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const sample = pool.slice(0, PER_PACK);
    if (sample.length < PER_PACK) console.log(`  ⚠ pack ${pack}: pool ${pool.length} < ${PER_PACK}, sampling all`);
    packLog.sampled = sample.length;
    packLog.sample = [];

    for (let i = 0; i < sample.length; i++) {
      const c = sample[i];
      const name = `${pack.toLowerCase()}-${String(i + 1).padStart(2, '0')}.png`;
      if (c.looseFile) {
        await sharp(c.looseFile).png().toFile(path.join(outDir, name));
        packLog.sample.push({ file: name, from: c.name });
      } else {
        await sharp(c.buf, { raw: { width: c.size, height: c.size, channels: c.channels } }).png().toFile(path.join(outDir, name));
        const sha = crypto.createHash('sha256').update(c.buf).digest('hex').slice(0, 12);
        packLog.sample.push({ file: name, from: `${c.sheet} @ cell (${c.cx},${c.cy})`, sha });
      }
    }
    totalSampled += sample.length;
    log.packs[pack] = packLog;
    const addr = packLog.sheets.reduce((s, x) => s + (x.addressable || 0), 0);
    console.log(`  ${pack}: ${packLog.sheets.length} sheet(s), ${addr} addressable cells, pool ${packLog.pool} → sampled ${packLog.sampled}`);
  }

  await fs.promises.mkdir('case-studies/01/data', { recursive: true });
  await fs.promises.writeFile('case-studies/01/data/registry.json', JSON.stringify(log, null, 2) + '\n');
  console.log(`\n✔ atomized+sampled ${totalSampled} tiles → case-studies/01/raw/<ID>/_tiles/ (local only)`);
  console.log('  registry record → case-studies/01/data/registry.json (committed, no images)');
}

main().catch((e) => { console.error(e); process.exit(1); });
