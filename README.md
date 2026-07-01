# Algfolded

A timer-based trainer for **blindfolded (BLD) speedcubing algorithms**.

Algfolded started as an [LTCT](https://www.speedsolving.com/wiki/index.php/LTCT) trainer and has grown into a general BLD **algset** trainer: it hosts several algorithm sets side by side, each with its own cases, scrambles and independent progress. Pick a set, select the cases you want, and drill them with a timer, spaced-repetition-style case selection, per-case notes and optional smart-cube tracking.

Fork of [Roman Strakhov's ZBLL Trainer](https://github.com/Roman-/zbll), originally adapted for LTCT with permission from the original author. Algorithm data sourced from [blddb](https://github.com/nbwzx/blddb).

## Algsets

Switch between sets from the picker on the selection page. Each set keeps its **own** selection, session, statistics, spaced-repetition history, notes and presets — nothing bleeds across sets.

| Set | Cases | Description |
| --- | ----- | ----------- |
| **LTCT** (Last Target Corner Twist) | 252 | The final corner-twist case at the end of a corners BLD solve |
| **3-Twists** | 112 | Three corners twisted in the same direction, grouped by buffer |
| *Commutators (edges & corners)* | — | Planned |

Because the app is set-agnostic, adding a new set is essentially "a data file + a small descriptor" (see `src/algsets/`).

## Core features

- **Case selection UI** — expand groups/subgroups, select individual cases or whole branches, and see each case's letters at a glance.
- **Timer with stats** — per-solve history, inline notes, delete/inspect individual results, and a session summary (solve count, unique cases, total/mean time, sparkline, slowest cases with one-click re-practice).
- **Custom letter scheme** — edit your sticker→letter mapping (Speffz by default) in settings. The scheme drives the letters shown everywhere, including the 3-twists letters, so the whole app speaks your lettering.
- **Presets** — save named case selections (plus a starred quick-list) to jump between practice sets.
- **Notes** — attach a personal note to any case.
- **Interactive 3D cube** — touch/drag to rotate; configurable solving orientation.
- **Unified light/dark theme** and **four languages** (EN, DE, FR, IT).

### 3-Twists buffer order

The 3-twists set is grouped by **buffer**. In settings you can reorder the buffer priority — by **drag-and-drop** or the up/down buttons — and the set **re-partitions live**: each twist is assigned to its highest-priority buffer, so the grouping and the case letters follow your preferred buffer order.

### Smart case selection

When enabled (default), cases are picked with a weighted-random algorithm inspired by spaced repetition:

- **Slowness weight** — slower cases come up more often.
- **Recency weight** — cases you haven't seen in a while are prioritized.

Turn it off in settings for plain uniform-random practice.

### "Didn't know" button

After a solve, mark a case as forgotten — this temporarily boosts its priority (×5) so it returns sooner. The penalty clears automatically after the next successful solve.

### Recap mode

Go through every selected case exactly once (Alt+R) — a counter shows how many remain. Normal weighted selection resumes once all cases are covered.

### Smart cube (Bluetooth)

Connect a Bluetooth smart cube for hands-free scramble tracking. Supported brands: **GAN** (Gen2/Gen3/Gen4, via `gan-web-bluetooth`) and **MoYu / QiYi** (via `btcube-web`). Click the Bluetooth button and pick your cube's brand.

- **Real-time tracking** — completed moves turn green; wrong moves show in red as corrections to undo.
- **Automatic solved detection** — recognizes when the cube returns to solved after scrambling + solving.
- **State-based reconciliation** — handles slice moves (M/S/E), out-of-order commuting moves and other noise by comparing the physical cube state against the expected state.
- **Pause / resume tracking** (Alt+Y) — temporarily ignore moves, e.g. while adjusting grip.
- **Reset virtual cube** (Alt+M) — re-sync when the physical cube is back to solved.
- **Letterpair mode** — practice straight from the letter pair: the bar shows the case's letters instead of a scramble, the virtual cube starts already scrambled, and the timer stops the moment you solve it. Only relative moves are tracked, so the physical cube can stay scrambled between cases — no re-scrambling, no doubt about whether your alg was correct. Enable it in settings.
- **Keyboard simulator** for testing without a physical cube (`window.btSim.connect()` in the browser console).

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # production build to dist/
npm run preview    # preview the production build
npm run test       # unit tests (Vitest)
npm run typecheck  # vue-tsc
```

**Stack:** Vue 3 (`<script setup>`) · Pinia · vue-router · vue-i18n · Bootstrap 5 · Vite. State is persisted to `localStorage`, namespaced per algset.

### Regenerating algorithm data

Algorithm and scramble data live in `src/assets/` and are produced by the scripts in `scripts/`:

```bash
# LTCT
node scripts/generate_scrambles.mjs
node scripts/verify_scrambles.mjs

# 3-Twists
node scripts/generate_twists.mjs
node scripts/generate_twist_scrambles.mjs
```

A GitHub Action (`.github/workflows/update-algs.yml`) refreshes the LTCT algorithms from blddb weekly and opens a PR when they change.
