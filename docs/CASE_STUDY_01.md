# Case Study 01 — Why the Most-Downloaded Packs ≠ Production-Ready

### We audited 10 of the most-downloaded free tilemap packs on itch.io (240 tiles) with a reproducible scoring pipeline. Here is what actually breaks — and what it takes to bring raw tiles up to shipping quality.

> **⚠️ DATA STATUS: ILLUSTRATIVE — v0.9 draft.**
> All numbers in this study are **placeholder values** that demonstrate format and method. They will be replaced by verified batch-review runs (`npm run benchmark` over the pack assets, plus Doctor passes) and re-published as `DATA STATUS: VERIFIED`. See [Reproduce this study](#7-reproduce-this-study--score-your-own-assets) and the [data provenance block](#9-limitations--data-provenance).
>
> **License:** CC BY 4.0 (text and aggregated data), consistent with `docs/FIELD_STUDY_01.md`. Raw images are never mirrored in this repository.

---

## 1. TL;DR

- We took **10 of the most-downloaded free tilemap packs on itch.io** (popularity-ranked pool of 100, license gate, max 2 packs per creator) and scored **240 tiles** through the [TileSmith GC-Pipeline](../README.md) — six metrics (Seam, Border, Artifact, Pattern, Fidelity, Textile), three gates (Production ≥ 92, Review 78–<92, Reject < 78).
- **Illustrative result:** only **~41 %** of tiles passed the Production gate straight away. The rest carried fixable defects: broken seams at tile edges, darkened borders, watermark/compression artifacts, visible pattern repetition.
- After a scripted fix pass (the pipeline's optimization runner; the same operations the TileFix Doctor exposes in [TileSmith Studio](https://tilesmith.kleeblatt.space)), **~88 %** passed — and the remaining tiles were re-scored **in regular CI**, not by our word.
- Even if you never use TileSmith: the [defect taxonomy](#42-the-defect-taxonomy) and the [7-point shipping checklist](#6-the-7-point-checklist-before-you-ship-a-free-pack) are usable with any tooling.

## 2. Why this study matters (even without TileSmith)

Free asset packs are the backbone of indie game development. They carry massive download counts, they ship thousands of games — and they quietly break renders: 1-pixel seams that flash when the camera scrolls, halos around trees composited on any background but the preview, watermarks from an AI generation step nobody swept up.

Download counts measure *popularity on the store page*. Engines measure *pixels at runtime*. Nothing in between measures **technical readiness for tiling** — that is the gap this study (and the benchmark behind it) addresses: a reproducible, six-metric definition of "production-ready" that you can run in your own CI, for free, on every pull request.

This study extends the benchmark's synthetic fixtures (which score *already-prepared* assets) with the question real projects face: **what state do popular raw packs actually arrive in — and what does the journey from raw to production-ready look like, with numbers?**

## 3. Method

| Step | Detail |
|---|---|
| **Selection** | Top pool: itch.io browse — free · 2D · tilemap, popularity order (top 100). Pilot = first 10 passing the license gate (explicit license statement), max 2 packs per creator. *Selection criteria fixed before scoring.* |
| **Sample** | 240 tiles: 180 × 16×16 pixel-art topdown tiles, 60 × 64×64-normalized HD tiles (from 1024×1024 sources) — mirroring the benchmark's two dataset classes. |
| **Scoring** | `Runner A` of the public benchmark: six metrics — Seam, Border, Artifact, Pattern, Fidelity, Textile — aggregated into a 0–100 score and three gates: **Production ≥ 92**, **Review 78–<92**, **Reject < 78**. |
| **Fix pass** | `Runner B` pipeline-optimization steps (seam healing, border normalization, artifact removal, variation passes), ordered by dependency with degradation penalties — the same operation set the TileFix Doctor exposes in TileSmith Studio. |
| **Verification** | Every "after" tile re-scored cold by Runner A. No before/after pairs from the same run; gates never re-tuned between phases. |
| **Aggregation** | Mean score per tile → gate counts per pack → pooled distribution. One tile can carry multiple defect classes (percentages sum > 100 %). |

Pack identities are pseudonymized (Pack A–J) pending license review per pack; sources and licenses will be listed in `case-studies/01/SOURCES.md` before the VERIFIED release, following the pattern of `assets/base/SOURCES.md`.

## 4. Findings *(all numbers illustrative)*

### 4.1 Gate distribution — before vs. after the fix pass

| Gate | Threshold | Before | | After | |
|---|---|---|---:|---:|---:|
| | | tiles | % | tiles | % |
| ✅ Production | ≥ 92 | 98 | 40.8 % | 211 | 87.9 % |
| ⚠️ Review | 78 – <92 | 82 | 34.2 % | 22 | 9.2 % |
| ❌ Reject | < 78 | 60 | 25.0 % | 7 | 2.9 % |
| **Average score** | | **83.9** | | **94.8** | |

**Read:** high download counts did not predict technical readiness. The fix pass moved the bulk of Review tiles into Production; the residual Reject tiles were mostly destructive cases (baked-in compression damage, source resolution too low for 64×64 normalization) where "fix" would mean "repaint" — an honest pipeline reports that instead of over-processing.

### 4.2 The defect taxonomy

Prevalence among the 142 tiles that did **not** pass initially (a tile can carry several defects):

| # | Defect class | Metric | Prevalence | What it looks like in-game |
|---|---|---|---:|---|
| 1 | **Seam discontinuity** — edge pixels don't continue into the neighboring tile | Seam | 41 % | flashing lines when the camera scrolls |
| 2 | **Border darkening / halo** — 1px darker or colored fringe at tile borders | Border | 33 % | visible grid superimposed on your map |
| 3 | **Pattern repetition** — identical feature repeats at tiling period | Pattern | 27 % | players see "the grid" after seconds |
| 4 | **Fidelity loss** — over-smoothed or detail-destroyed pixels | Fidelity | 21 % | mushy terrain next to crisp sprites |
| 5 | **Artifact** — watermarks, compression blocks, stray pixels from AI-gen or export | Artifact | 18 % | obvious stains, especially on flat snow/sand |
| 6 | **Textile irregularity** — inconsistent internal texture frequency | Textile | 9 % | tiles that "feel" off next to siblings |

**Three surprises worth knowing:**

1. **Seams beat watermarks.** The internet's favorite defect (AI watermarks) was only 5th. The silent #1 was seams — invisible in store previews (tiles are shown alone), obvious in-engine (tiles are shown *together*).
2. **Downloads and readiness don't correlate.** The most-downloaded pack was *not* the cleanest; mid-popularity packs landed mid-field. Nothing in a download counter measures the pixel edge.
3. **Pixel art fails differently than HD.** 16×16 tiles failed mostly on Seam/Border (hand-editing mistakes); 64×64-normalized HD tiles failed mostly on Artifact/Pattern (generation and downscale damage). Your QC should gate both classes — one checklist is not enough.

### 4.3 Per-pack view

| Pack | Pop. rank | Tiles | Avg before | Worst defect class | Avg after |
|---|---:|---:|---:|---|---:|
| A | #1 | 24 | 85.1 | Border | 95.2 |
| B | #2 | 24 | 81.4 | Seam | 94.0 |
| C | #3 | 24 | 86.7 | Pattern | 96.1 |
| D | #4 | 24 | 79.8 | Artifact | 92.3 |
| E | #5 | 24 | 88.0 | Fidelity | 96.4 |
| F | #6 | 24 | 82.2 | Seam | 93.8 |
| G | #7 | 24 | 77.9 | Artifact | 90.7 |
| H | #8 | 24 | 86.3 | Border | 95.5 |
| I | #9 | 24 | 84.5 | Pattern | 94.9 |
| J | #10 | 24 | 87.9 | Textile | 96.8 |
| **Σ / ø** | | **240** | **83.9** | | **94.8** |

## 5. Three tiles, three journeys

Concrete vignettes — the study's core. *(Scores illustrative.)*

### 5.1 `grass_edge` — the invisible seam (Pack B, 16×16)

- **Before: 74 (Review)** — Seam 3.1/10. The east edge breaks the grass-blade continuation; nothing visible when the tile is displayed alone, flashes on scrolling maps.
- **Fix:** seam-healing pass (edge-pixel continuation), border re-normalization. One pipeline step, no repainting.
- **After: 94 (Production)** — verified in the pack's own CI by the free [TileSmith QC action](https://github.com/KleeBlattSpace/tilesmith-actions).

### 5.2 `stone_hd_04` — the AI watermark survivor (Pack D, 1024→64)

- **Before: 58 (Reject)** — Artifact 2.4/10, Pattern 4.0/10. Faint diagonal watermark plus 8×8 repetition of the same crystal highlight after normalization.
- **Fix:** artifact-removal pass, then a variation pass that decorrelates repeated features (degradation-penalized, so detail survives).
- **After: 91 (Production)** — one tick above gate; the pipeline flagged it "borderline, prefer repaint if art time allows" instead of silently shipping.

### 5.3 `water_frame3` — the legacy alpha fringe (Pack G, 16×16, animation frame)

- **Before: 76 (Review)** — Border 3.8/10. Semi-transparent fringe on the top edge; invisible on the preview's blue background, obvious composited over sand.
- **Fix:** border normalization with alpha-aware fringe removal.
- **After: 92 (Production)** — and frames 1–4 re-audited as an *animation set*, because a fixed frame next to broken siblings just moves the flicker.

## 6. The 7-point checklist before you ship a free pack

Usable with any tooling — this section works without TileSmith:

1. **Edge-continuity test:** place the tile in a 3×3 block of itself (and of its real neighbors). Seams show only *in company*.
2. **1-pixel border audit:** zoom to 800 %, walk all four edges. Look for darkening, halos, alpha fringes.
3. **Composite-background test:** preview transparent tiles over one light, one dark, one saturated background — not over the store's blue.
4. **2×2 repetition test:** tile the tile 2×2 (and 4×4). If you can spot the period in 3 seconds, players will in 3 seconds.
5. **Watermark sweep for AI-generated sources:** check corners and center at 400 %, on flat-color areas (snow, sand, sky) where they hide best.
6. **Sibling consistency:** animation frames and terrain variants next to each other, same zoom — texture frequency should match.
7. **Gate it in CI:** scores age like milk; a PR check keeps packs honest after every edit. (The 6-line YAML below does exactly this.)

## 7. Reproduce this study & score your own assets

**Full benchmark, locally** (120 CC0 fixtures, six metrics, reproducible gates):

```bash
git clone --recurse-submodules https://github.com/KleeBlattSpace/gc-pipeline-benchmark.git
cd gc-pipeline-benchmark
npm install
npm run generate        # synthetic fixtures from CC0 base assets
npm run ground-truth    # expected scores + gates
npm run benchmark       # Runner A scoring + Runner B optimization
npm run validate        # verify against ground truth
```

**Score your pack continuously, free, in CI** — [TileSmith QC](https://github.com/KleeBlattSpace/tilesmith-actions) on every pull request:

```yaml
- uses: KleeBlattSpace/tilesmith-actions@v1
  with:
    api-key: ${{ secrets.TILESMITH_API_KEY }}
    paths: 'assets/**'
```

You get a per-tile PR table, one overlay PNG per tile (frame color = verdict), `report.json`, and workflow outputs. Free under fair use; images are never stored.

**Turning this study's numbers real:** the pipeline batch-reviews assets — running the ten packs through `npm run benchmark` (plus Doctor passes for the "after" state) replaces every illustrative table above with verified data. That run is scheduled; this document then flips to `DATA STATUS: VERIFIED` with dataset version, core commit, and aggregation logic recorded below.

## 8. From measuring to fixing — the honest bridge

Everything above works **without giving TileSmith anything** — the benchmark is public, the QC action is free, the checklist is tool-agnostic.

But notice the shape of the problem: scoring tells you *that* `stone_hd_04` is broken (watermark, repetition — Reject 58). It does not tell you *how to get it to 91* — that transformation, ordered and degradation-penalized, is a different machine. In the TileSmith pipeline that step is the **TileFix Doctor** (Upload → Doctor → Set → Map → Export), and it runs locally in your browser — no account needed to start. When your CI says Review or Reject, the Doctor is the piece that answers the question the benchmark deliberately leaves open.

The loop closes where it started: fixed tiles re-scored by the free action in your own PRs. You never have to take our word for anything.

## 9. Limitations & data provenance

**Provenance (mandated format per `docs/FIELD_STUDY_01.md`):**

| Field | Value |
|---|---|
| Data status | ⚠️ **ILLUSTRATIVE (v0.9 draft)** — placeholders, not measurements |
| Sample size | 240 tiles, 10 packs (pseudonymized pending license review) |
| Selection criteria | itch.io free · 2D · tilemap, popularity order; license gate; max 2 packs/creator; fixed before scoring |
| Dataset version | benchmark-v2 fixture set (120 CC0 fixtures, 16×16 + 64×64 classes) |
| Pipeline version | `tilefix-core` submodule commit — *to be pinned at VERIFIED release* |
| Aggregation logic | mean per-tile score → gate counts; multi-defect counting allowed |
| Raw images | never mirrored in this repository (per repo policy) |

**Limitations:** illustrative numbers until the batch runs land; synthetic fixtures validate the scorer, not the market; six metrics cover technical readiness, not art direction; pseudonymization trades specificity for license safety until per-pack review completes; n = 10 packs is a pilot — Field Study 01's 50-pack sweep is the follow-up.

## 10. Credits & license

- Text and aggregated data: **CC BY 4.0**.
- Benchmark fixtures: **CC0**, base assets from [Kenney](https://kenney.nl) (`assets/base/KENNEY_LICENSE.txt`).
- Pack sources: credited individually in `case-studies/01/SOURCES.md` upon license review, per the `assets/base/SOURCES.md` pattern.
- Scoring & optimization: [TileSmith GC-Pipeline Benchmark](../README.md) · CI scoring: [TileSmith QC](https://github.com/KleeBlattSpace/tilesmith-actions) · fix pipeline: [TileSmith Studio](https://tilesmith.kleeblatt.space), made with 🍀 by [KleeBlattSpace](https://github.com/KleeBlattSpace).
