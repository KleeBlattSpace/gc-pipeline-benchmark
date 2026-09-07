# CS-01 Pack Substitutions & Download Log

How the 10 analyzed packs relate to the pre-registered pool
(`candidates.json`, itch.io browse — free · 2D · tilemap, popularity order).
Recorded 2026-09-07 during extraction; nothing here changes the pre-registered
documents — deviations are logged, never edited away.

## Verdict: 8 exact, 2 substituted (same creators)

| ID | Pre-registered (candidates.json) | Actually downloaded & analyzed | Status |
|---|---|---|---|
| A | #1 Sprout Lands - Asset Pack (Cup Nooble) | Sprites Basic + UI Basic (Cup Nooble) | ✅ exact |
| B | #2 Ninja Adventure (pixel-boy) | **Sprout Sorry pack (Cup Nooble)** | ⚠️ substituted — different pack AND creator |
| C | #3 2D Pixel Dungeon Asset Pack (Pixel_Poem) | 2D Pixel Dungeon v2.0 + Enemy_Animations_Set | ✅ exact (+companion anim set, same family) |
| D | #4 Pixel Art Top Down - Basic (Cainos) | v1.2.3 (Cainos) | ✅ exact |
| E | #5 Sidescroller Fantasy Forest (Anokolisa) | **Legacy Fantasy - High Forest 2.0/2.3 + Debug Map (Anokolisa)** | ⚠️ substituted — different pack, same creator |
| F | #7 Pixel Fantasy Caves (Szadi art.) | v1.0 (Szadi art.) | ✅ exact |
| G | #10 Gentle Forest (Seliel the Shaper) | 3.0a free palettes + Tiled files (Seliel) | ✅ exact |
| H | #14 Kings and Pigs (Pixel Frog) | as published (Pixel Frog) | ✅ exact |
| I | #23 16x16 Industrial Tileset (0x72) | industrial.v1.png + industrial.v2.png (bare PNGs) | ✅ exact |
| J | #35 Isometric Tiles (Devil's Workshop) | v01_2 (Devil's Workshop) | ✅ exact |

## Consequences (applied throughout the study)

- **Correlation (H1):** B and E carry **no popularity rank** (their ranks are
  unknown — B may be nested under A's page; E was never in the pool), so the
  pre-registered rank correlation runs on **n = 8**, not n = 10. The script
  (`scripts/analyze-correlation.ts`) refuses packs without rank/downloads, so
  this is enforced, not chosen. Manifest: `case-studies/01/manifest-correlation.json`.
- **Creator cap:** the "max 2 packs per creator" rule still holds (Cup Nooble: A+B; Anokolisa: E).
- **B cleanup:** `raw/B/` also contained a byte-identical duplicate of A's
  Sprites zip (sha256 `72b607a2…`) — verified identical, excluded from B's
  analysis (B := Sprout Sorry only). The duplicate is left in place on disk;
  see the license note below.
- **Stray file removed:** `raw/I/Isometric_Tiles_…zip(` (byte-identical to J's
  archive, typo'd name) was deleted from the working tree to avoid double
  counting. J is unaffected.
- **Placeholders restored:** `raw/D/` and `raw/G/` main archives were 2-byte
  CRLF placeholders in git; the real archives were restored from
  `case-studies/01/raw_itch.zip` (same bundle the packs arrived in).
- **G sampling:** free tier ships 3 palette variants (v01–v03, identical
  layouts per the shipped readme) — sampling uses v01 only to avoid
  triple-counting the same art; all three count as shipped sheets in the audit.

## ⚠️ License / repo-policy note (needs owner action)

Several analyzed packs forbid redistribution (Cup Nooble A/B: non-commercial +
no-redistribute; Pixel_Poem C, Cainos D: no redistribution/resale; Anokolisa E:
no sale as final product). The raw archives are currently committed in
`case-studies/01/raw/` despite `.gitignore` (`case-studies/*/raw/`) and the
repo policy *"raw images are never mirrored"*. Recommended: `git rm --cached`
the archives (keep local working copies for analysis), keep only aggregates +
hashes in git. This study itself publishes aggregates only and reproduces no
pack artwork (figures are abstract SVGs).
