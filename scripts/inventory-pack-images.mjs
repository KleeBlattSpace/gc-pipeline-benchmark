#!/usr/bin/env node
/**
 * inventory-pack-images.mjs — CS-01 helper: list every image per pack with dimensions.
 * Read-only analysis over case-studies/01/raw/_work/<ID>/ (gitignored extraction dir).
 * Usage: node scripts/inventory-pack-images.mjs [PACK...]  (default: all A-J)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = 'case-studies/01/raw/_work';
const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (exts.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out.sort();
}

const packs = process.argv.slice(2).length ? process.argv.slice(2) : ['A','B','C','D','E','F','G','H','I','J'];
for (const pack of packs) {
  const dir = path.join(root, pack);
  if (!fs.existsSync(dir)) { console.log(`\n######## PACK ${pack} — MISSING ${dir}`); continue; }
  const files = walk(dir);
  console.log(`\n######## PACK ${pack} — ${files.length} images`);
  for (const f of files) {
    try {
      const m = await sharp(f).metadata();
      const rel = path.relative(dir, f);
      console.log(`  ${String(m.width).padStart(5)}x${String(m.height).padEnd(5)} ${(m.channels ?? '?') + 'ch'} ${rel}`);
    } catch {
      console.log(`  ERR ${path.relative(dir, f)}`);
    }
  }
}
