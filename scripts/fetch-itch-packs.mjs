#!/usr/bin/env node
/**
 * fetch-itch-packs.mjs — CS-01 asset acquisition (criteria v2: popularity/downloads)
 * ============================================================================
 * Discovers free 2D tilemap packs on itch.io (popularity order), captures
 * license + download metadata, downloads packs (free / $0 name-your-price),
 * extracts tile images and emits the batch-harness manifest + SOURCES.md draft.
 *
 * Subcommands:
 *   discover   scrape browse pages → candidates.json (rank, name, creator, url)
 *              --deep  additionally visit each pack page: downloads, license hint
 *   shortlist  apply selection rules → packs-manifest.json + SOURCES.md draft
 *              --n 10 --max-per-creator 2 --require-license-note
 *   fetch      download + extract packs from a manifest/shortlist into raw/<ID>/
 *              (itch free-claim flow; needs `unzip` or bsdtar on PATH)
 *   self-test  offline: parser fixtures + zip extraction pipeline
 *
 * Politeness: custom UA, 1.5s delay between requests, resume-safe (existing
 * raw/<ID>/ dirs are skipped). Sandbox/datacenter IPs are blocked by itch —
 * run this on a normal machine; or download packs manually into raw/<ID>/ and
 * use `shortlist --from-dirs` to build the manifest without network access.
 *
 * Drop-in: gc-pipeline-benchmark/scripts/fetch-itch-packs.mjs (zero deps, Node >= 18)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const CS_DIR = path.join(ROOT, 'case-studies/01');
const UA = 'TileSmithFieldStudy/1.0 (research; contact: admin@kleeblatt.space)';
const DELAY_MS = 1500;
const TILE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ scraping

/** Parse one browse page's HTML into candidate entries (popularity order). */
export function parseBrowsePage(html) {
  const out = [];
  const cellRe = /<div class="game_cell[^"]*">([\s\S]*?)(?=<div class="game_cell|<\/div>\s*<div class="browse_pagination|Loading more games|$)/g;
  let m;
  while ((m = cellRe.exec(html))) {
    const cell = m[1];
    const link = cell.match(/<a[^>]+class="title[^"]*"[^>]*href="(https:\/\/[^"]+\.itch\.io\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      ?? cell.match(/<a[^>]+href="(https:\/\/[^"]+\.itch\.io\/[^"]+)"[^>]*class="title[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const creator = cell.match(/href="(https:\/\/[^"]+\.itch\.io\/)"[^>]*>/);
    const price = cell.match(/class="price[^"]*"[^>]*>([^<]+)</);
    const paid = cell.match(/class="(price|dollar)[^"]*"[^>]*>\s*\$/);
    out.push({
      url: link[1],
      name: decodeEntities(link[2].replace(/<[^>]+>/g, '').trim()),
      creator: creator ? creator[1].replace('https://', '').replace('.itch.io/', '') : null,
      price: price ? decodeEntities(price[1].trim()) : null,
      free: !paid,
    });
  }
  return out;
}

/** Parse a pack page for downloads + license hint (best effort, null-safe). */
export function parsePackPage(html) {
  const dl = html.match(/([\d.,]+)\s+downloads?/i);
    const license =
      html.match(/info_label[^>]*>\s*License\s*<\/[\s\S]{0,200}?info_value[^>]*>(?:\s*<[^>]+>)*([^<]+)/i)?.[1]?.trim()
      ?? html.match(/\b(CC0|CC-BY(?:-\d(?:\.\d)?)?|CC BY(?:-\d(?:\.\d)?)?|MIT|public domain|publicdomain|OFL|Apache)[\s.-]/i)?.[1]
      ?? null;
  return {
    downloads: dl ? Number(dl[1].replace(/[.,]/g, '')) : null,
    license_hint: license ? decodeEntities(license) : null,
  };
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
}

async function get(url, jar, opts = {}) {
  const headers = { 'User-Agent': UA, ...(jar?.size ? { cookie: [...jar].join('; ') } : {}), ...opts.headers };
  const res = await fetch(url, { headers, redirect: 'follow' });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0];
    if (pair) jar?.add(pair);
  }
  return { status: res.status, text: await res.text(), url: res.url };
}

// ------------------------------------------------------------------ commands

async function discover({ pages = 3, deep = false }) {
  const jar = new Set();
  const found = [];
  for (let p = 1; p <= pages; p++) {
    const url = `https://itch.io/game-assets/free/tag-2d/tag-tilemap${p > 1 ? `?page=${p}` : ''}`;
    process.stdout.write(`• browse page ${p} … `);
    const res = await get(url, jar);
    if (res.status !== 200) { console.log(`HTTP ${res.status} — stopping.`); break; }
    const entries = parseBrowsePage(res.text);
    console.log(`${entries.length} cells`);
    found.push(...entries);
    if (!entries.length) break;
    await sleep(DELAY_MS);
  }
  if (deep) {
    console.log('• deep pass (downloads + license per pack) …');
    for (const e of found) {
      try {
        const page = await get(e.url, jar);
        Object.assign(e, parsePackPage(page.text));
      } catch { /* keep browse-level data */ }
      await sleep(DELAY_MS);
    }
  }
  const payload = {
    source: 'itch.io browse — free · 2D · tilemap, popularity order',
    captured_at: new Date().toISOString().slice(0, 10),
    selection_rules: 'CS-01 pilot: first N=10 passing license gate, max 2 packs per creator, tile images present',
    candidates: found.map((e, i) => ({ rank: i + 1, id: indexToId(i), ...e })),
  };
  await fs.mkdir(CS_DIR, { recursive: true });
  await fs.writeFile(path.join(CS_DIR, 'candidates.json'), JSON.stringify(payload, null, 2) + '\n');
  console.log(`✔ ${found.length} candidates → ${path.relative(ROOT, CS_DIR)}/candidates.json`);
  if (!found.length) console.log('  ⚠ zero parsed — itch markup may have changed, or your IP is blocked (datacenter IPs get 403).');
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function indexToId(i) {
  let s = String(ID_CHARS[i % 26]);
  let n = Math.floor(i / 26);
  while (n > 0) { s = ID_CHARS[(n - 1) % 26] + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function shortlist({ n = 10, maxPerCreator = 2, requireLicenseNote = true, fromDirs = false }) {
  const candPath = path.join(CS_DIR, 'candidates.json');
  const cand = JSON.parse(await fs.readFile(candPath, 'utf8'));
  const perCreator = new Map();
  const chosen = [];
  for (const c of cand.candidates) {
    if (chosen.length >= n) break;
    if (requireLicenseNote && !c.license_hint) continue;         // license gate: only explicit hints
    const k = (c.creator ?? '').toLowerCase();
    if ((perCreator.get(k) ?? 0) >= maxPerCreator) continue;      // diversity cap
    perCreator.set(k, (perCreator.get(k) ?? 0) + 1);
    chosen.push(c);
  }
  console.log(`• ${chosen.length}/${n} packs pass license gate + creator cap${requireLicenseNote ? '' : ' (license note not required)'}`);
  if (chosen.length < n) console.log('  ⚠ short of target — run `discover --deep` to fill license hints, or relax --require-license-note and review manually.');

  const rawRoot = path.join(CS_DIR, 'raw');
  const packs = [];
  for (const c of chosen) {
    const dir = path.join(rawRoot, c.id);
    await fs.mkdir(dir, { recursive: true });
    packs.push({
      id: c.id, name: c.name, creator: c.creator, rank: c.rank,
      downloads: c.downloads ?? null, source_url: c.url,
      license: `VERIFY: ${c.license_hint ?? 'no explicit license found — manual review required'}`,
      before_dir: path.relative(ROOT, dir),
      notes: c.blurb ?? '',
    });
  }
  const manifest = {
    study: 'CS-01', expected_tiles: 240, pixel_class: 16, hd_class: 64,
    selection: 'itch.io free · 2D · tilemap, popularity order; license gate (explicit hint); max 2 packs/creator',
    packs,
  };
  await fs.writeFile(path.join(CS_DIR, 'packs-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const sources = [
    '# SOURCES — Case Study 01', '',
    '| ID | Pack | Creator | Rank | Downloads | License (verified) | URL | Fetched |', '|---|---|---|---|---|---|---|---|',
    ...packs.map((p) => `| ${p.id} | ${p.name} | ${p.creator} | ${p.rank} | ${p.downloads ?? '—'} | ${p.license.replace('VERIFY: ', '')} (pending review) | ${p.source_url} | |`),
    '', 'Raw archives and extracted images are gitignored and never committed.', '',
  ].join('\n');
  await fs.writeFile(path.join(CS_DIR, 'SOURCES.md'), sources);
  console.log(`✔ manifest (${packs.length} packs) + SOURCES.md draft → ${path.relative(ROOT, CS_DIR)}/`);
  if (fromDirs) console.log('  (--from-dirs: populate raw/<ID>/ manually, then re-run `fetch --skip-download` to index)');
}

async function fetchPacks({ manifest: manifestPath, skipDownload = false, maxTiles = 24 }) {
  const manifest = JSON.parse(await fs.readFile(manifestPath ?? path.join(CS_DIR, 'packs-manifest.json'), 'utf8'));
  const jar = new Set();
  for (const pack of manifest.packs) {
    const outDir = path.resolve(ROOT, pack.before_dir);
    const existing = await fs.readdir(outDir).catch(() => []);
    if (existing.filter((f) => TILE_EXT.has(path.extname(f).toLowerCase())).length) {
      console.log(`  ${pack.id}: tiles already present — skipping (resume-safe)`); continue;
    }
    if (skipDownload) { console.log(`  ${pack.id}: no tiles in ${pack.before_dir} and --skip-download set`); continue; }
    console.log(`  ${pack.id}: ${pack.source_url}`);
    const page = await get(pack.source_url, jar);
    if (page.status !== 200) { console.log(`    ✖ HTTP ${page.status}`); continue; }
    const csrf = page.text.match(/name="csrf_token"[^>]*value="([^"]+)"/)?.[1];
    const gameId = page.text.match(/\/buy\/(\d+)/)?.[1] ?? page.url.match(/\/(\d+)$/)?.[1];
    const urls = [...page.text.matchAll(/href="(https:\/\/[^"]+\/download\/[^"]+)"/g)].map((m) => m[1]);
    if (!urls.length && csrf && gameId) {
      try { // free-claim flow for $0 name-your-price packs
        const res = await fetch(`https://itch.io/buy/${gameId}`, {
          method: 'POST',
          headers: { 'User-Agent': UA, cookie: [...jar].join('; '), 'content-type': 'application/x-www-form-urlencoded', referer: pack.source_url },
          body: new URLSearchParams({ csrf_token: csrf, price: '0', action: 'buy' }).toString(),
          redirect: 'follow',
        });
        const claimHtml = await res.text();
        for (const c of res.headers.getSetCookie?.() ?? []) { const pair = c.split(';')[0]; if (pair) jar.add(pair); }
        urls.push(...[...claimHtml.matchAll(/href="(https:\/\/[^"]+\/download\/[^"]+)"/g)].map((m) => m[1]));
      } catch (e) { console.log(`    ⚠ claim flow failed: ${e.message}`); }
    }
    if (!urls.length) { console.log('    ✖ no download links found — download manually into ' + path.relative(ROOT, outDir)); continue; }
    await fs.mkdir(outDir, { recursive: true });
    let saved = 0;
    for (const u of urls.slice(0, 4)) {
      const res = await fetch(u, { headers: { 'User-Agent': UA, cookie: [...jar].join('; ') } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const isZip = buf.slice(0, 2).toString('hex') === '504b';
      const tmp = path.join('/tmp', `cs01-${pack.id}-${saved}.zip`);
      if (isZip) {
        await fs.writeFile(tmp, buf);
        saved += await extractTiles(tmp, outDir, maxTiles);
      } else if (TILE_EXT.has(path.extname(new URL(u).pathname).toLowerCase())) {
        await fs.writeFile(path.join(outDir, path.basename(new URL(u).pathname)), buf); saved++;
      }
      await sleep(DELAY_MS);
      if (saved >= maxTiles) break;
    }
    console.log(`    ✔ ${saved} tiles extracted`);
  }
  console.log('✔ fetch pass done — run `npm run case-study -- --manifest case-studies/01/packs-manifest.json` next');
}

async function extractTiles(zipPath, outDir, maxTiles) {
  const list = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const tiles = list.filter((f) => TILE_EXT.has(path.extname(f).toLowerCase()) && !/(^|\/)(source|psd|preview|readme)/i.test(f));
  let n = 0;
  for (const t of tiles) {
    if (n >= maxTiles) break;
    const safe = t.replace(/[\/\\]/g, '__');
    try {
      const buf = execFileSync('unzip', ['-p', zipPath, t], { maxBuffer: 64 * 1024 * 1024 });
      await fs.writeFile(path.join(outDir, safe), buf); n++;
    } catch { /* skip broken entries */ }
  }
  return n;
}

// ------------------------------------------------------------------ self-test

async function selfTest() {
  let failures = 0;
  const expect = (c, msg) => { if (!c) { failures++; console.log('  ✖ ' + msg); } else console.log('  ✔ ' + msg); };

  const fixture = `
    <div class="game_cell"><a class="title game_link" href="https://example.itch.io/pack-one">Pack &amp; One</a>
      <a href="https://creator-a.itch.io/">Creator A</a><div class="price"><span>Free</span></div></div>
    <div class="game_cell"><a class="title game_link" href="https://example.itch.io/pack-two">Pack Two</a>
      <a href="https://creator-b.itch.io/">Creator B</a><div class="price dollar">$2.99</div></div>`;
  const parsed = parseBrowsePage(fixture);
  expect(parsed.length === 2, `browse parser: 2 cells (got ${parsed.length})`);
  expect(parsed[0].name === 'Pack & One' && parsed[0].free, 'browse parser: entity decode + free detection');
  expect(parsed[1].free === false, 'browse parser: paid detection');

  const packHtml = '<div class="info_row"><div class="info_label">License</div><div class="info_value"><a>CC-BY 4.0</a></div></div><abbr>12,345 downloads</abbr>';
  const pp = parsePackPage(packHtml);
  expect(pp.downloads === 12345, `pack parser: downloads (got ${pp.downloads})`);
  expect(/CC-BY/i.test(pp.license_hint ?? ''), 'pack parser: license hint');

  expect(indexToId(0) === 'A' && indexToId(25) === 'Z' && indexToId(26) === 'AA', 'id generator A..Z, AA');

  // zip extraction pipeline with a synthetic archive
  const zipDir = await fs.mkdtemp(path.join('/tmp', 'cs01-zip-'));
  const zipPath = path.join(zipDir, 'pack.zip');
  const srcDir = path.join(zipDir, 'src'); await fs.mkdir(srcDir);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000010000000100806000000', 'hex'); // minimal PNG header
  await fs.writeFile(path.join(srcDir, 'grass.png'), png);
  await fs.writeFile(path.join(srcDir, 'readme.txt'), Buffer.from('skip me'));
  execFileSync('zip', ['-q', '-j', zipPath, path.join(srcDir, 'grass.png'), path.join(srcDir, 'readme.txt')]);
  const outDir = path.join(zipDir, 'out'); await fs.mkdir(outDir);
  const n = await extractTiles(zipPath, outDir, 24);
  expect(n === 1, `zip extraction: only the tile extracted (got ${n})`);
  const hash = crypto.createHash('sha256').update(await fs.readFile(path.join(outDir, 'grass.png'))).digest('hex').slice(0, 16);
  expect(hash.length === 16, 'extracted tile hashable');

  await fs.rm(zipDir, { recursive: true, force: true });
  console.log(failures ? `✖ ${failures} failures` : '✔ self-test passed (parsers + extraction pipeline)');
  process.exit(failures ? 1 : 0);
}

// ------------------------------------------------------------------ main

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, def) => { const i = rest.indexOf(`--${name}`); return i === -1 ? def : (rest[i + 1]?.startsWith('--') ? true : rest[i + 1] ?? true); };
const dir = () => path.dirname(fileURLToPath(import.meta.url));

switch (cmd) {
  case 'discover': await discover({ pages: Number(flag('pages', 3)), deep: rest.includes('--deep') }); break;
  case 'shortlist': await shortlist({ n: Number(flag('n', 10)), maxPerCreator: Number(flag('max-per-creator', 2)), requireLicenseNote: !rest.includes('--allow-unknown-license'), fromDirs: rest.includes('--from-dirs') }); break;
  case 'fetch': await fetchPacks({ manifest: typeof flag('manifest', undefined) === 'string' ? flag('manifest') : undefined, skipDownload: rest.includes('--skip-download'), maxTiles: Number(flag('max-tiles', 24)) }); break;
  case 'self-test': await selfTest(); break;
  default:
    console.log('usage: fetch-itch-packs.mjs <discover|shortlist|fetch|self-test> [options]');
    console.log('  discover  [--pages N] [--deep]        browse → candidates.json');
    console.log('  shortlist [--n N] [--max-per-creator N] [--allow-unknown-license]');
    console.log('  fetch     [--manifest path] [--skip-download] [--max-tiles N]');
    console.log(`(script dir: ${dir()})`);
}
