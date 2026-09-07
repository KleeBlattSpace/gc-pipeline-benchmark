# CS-01 — Great Assets ≠ Ready Games (front door)

**The 5-minute version.** Full study: [`docs/CASE_STUDY_01.md`](../../docs/CASE_STUDY_01.md) · Data: [`data/`](./data/) · Release v1.1 (first public version, 2026-09-07) · CC BY 4.0.

> We audited 10 top free tilemap packs from itch.io (682 images, 240 tiles scored) to measure the expectation gap: what expert-made assets *demand from users* before gameplay can happen. The packs are never the villain; the expectation is. Readiness ≠ quality.

## Three numbers

1. **99.3 % of tile content arrives locked inside sheets** — 45 atlas sheets, 14,182 addressable cells; exactly one pack ships pre-cut tiles. Cutting, naming, and autotile combinatorics land on *you*.
2. **Fragments went 0-for-119** — assembly pieces (corners, edges, transitions) cannot pass standalone edge tests by construction. Our own baseline rejected 85 % — including a perfectly seamless brick wall (score 44). The instrument failed good art; we report it stratified, not pooled.
3. **Popularity predicts nothing (ρ = −0.62, p = 0.12, n = 8)** — honest pre-registered null. Every pack fails 92–100 % on standalone scores, so there's no variance left to explain. A null is also a finding.

## Three surprises

- The worst "failure" is a good brick wall (running bond vs. a test that compares the tile to *itself*).
- Fixing made 6 tiles *worse* — pixel touch-ups without degradation penalties break individuals while improving the average.
- The only beginner-ready pack (101 loose isometric tiles) scores 0/24 — orthogonal metrics don't speak isometric.

## Figures

![Stratified gate distribution](./data/figures/gates-stratified.svg)
![Metric means before → after](./data/figures/metrics-delta.svg)

## Read it in 3 sittings (5 minutes each)

- **Sitting 1 — the hurdle:** [TL;DR](../../docs/CASE_STUDY_01.md#1-tldr) → [Gap 0: asset chaos](../../docs/CASE_STUDY_01.md#44-the-delivery-format-audit--gap-0-atomization) → [the time question](../../docs/CASE_STUDY_01.md#46-from-hurdle-to-hours-the-time-question-honestly-scoped)
- **Sitting 2 — the instrument on trial:** [gates](../../docs/CASE_STUDY_01.md#41-gate-distribution--before-vs-after-the-fix-pass) → [taxonomy + confounds](../../docs/CASE_STUDY_01.md#42-the-defect-taxonomy--and-where-the-instrument-misfires) → [three tiles](../../docs/CASE_STUDY_01.md#5-three-tiles-three-journeys)
- **Sitting 3 — the rest:** [per-pack](../../docs/CASE_STUDY_01.md#43-per-pack-view) → [correlation null](../../docs/CASE_STUDY_01.md#45-does-popularity-predict-readiness-demand-pre-registered-h1) → [checklist](../../docs/CASE_STUDY_01.md#6-the-7-point-checklist-before-you-ship-a-free-pack) → [reproduce](../../docs/CASE_STUDY_01.md#7-reproduce-this-study--score-your-own-assets)

## Data & method (one glance)

- `data/registry.json` — 45 sheets, tile sizes human-verified, per-tile provenance (sheet + cell)
- `data/batch-results.json` — 480 scored tiles (240 before + 240 after)
- `data/gap0-steps.json` — per-pack hurdle vs. the 3 TileSmith steps
- `data/correlation.json` + scatter, `data/stratification.json`, `data/fixlog.json`, `data/format-audit.json`
- `SUBSTITUTIONS.md` — 8 exact packs + 2 logged substitutions · `SOURCES.md` — licenses + URLs
- Reproduce: `node scripts/atomize-cs01.mjs` → `npx tsx scripts/case-study-batch.ts --manifest case-studies/01/data/manifest-scoring.json --out case-studies/01/data --scorer pixel` (full chain in §7)
