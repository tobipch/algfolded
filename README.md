# Algfolded

A timer-based trainer for **blindfolded (BLD) speedcubing algorithms**.

Algfolded is a general BLD **algset** trainer: it hosts several algorithm sets side by side, each with its own cases, scrambles and independent progress. Pick a set, select the cases you want, and drill them with a timer, spaced-repetition-style case selection, per-case notes and optional smart-cube tracking.

Fork of [Roman Strakhov's ZBLL Trainer](https://github.com/Roman-/zbll), originally adapted with permission from the original author. Algorithm data sourced from [blddb](https://github.com/nbwzx/blddb).

## Algsets

Switch between sets from the picker on the selection page. Each set keeps its **own** selection, session, statistics, spaced-repetition history, notes and presets — nothing bleeds across sets.

| Set | Cases | Description |
| --- | ----- | ----------- |
| **Corner Commutators** | 1008 | Every corner 3-cycle (3-style), grouped by buffer → second letter → case |
| **Edge Commutators** | 1760 | Every edge 3-cycle (3-style), grouped by buffer → second letter → case |
| **Corner 2-Twists** | 56 | Two twisted corners, grouped by buffer → case (`UFR/N`) |
| **Edge 2-Flips** | 66 | Two flipped edges, grouped by buffer → case (`UF-UB`) |
| **3-Twists** | 112 | Three corners twisted in the same direction, grouped by buffer |
| **LTCT** (Last Target Corner Twist) | 252 | The final corner-twist case at the end of a corners BLD solve |

Because the app is set-agnostic, adding a new set is essentially "a data file + a small descriptor" (see `src/algsets/`).

## Core features

- **Case selection UI** — expand groups/subgroups, select individual cases or whole branches, and see each case's letters at a glance.
- **Command palette** (`Alt+K` or the ⌘ navbar button) — a PowerToys-style quick-action box: navigate, switch algset, toggle settings/theme/language, load presets, connect the smart cube, and run **wildcard selections**. Type a pattern with `*` (e.g. `UU*E`, several space-separated), `+`/`-` to add/remove from the selection, or `#`/`@`/`>` to filter to algsets/presets/commands.
- **Timer with stats** — per-solve history, inline notes, delete/inspect individual results, and a session summary (solve count, unique cases, total/mean time, sparkline, slowest cases with one-click re-practice).
- **Custom letter scheme** — edit your sticker→letter mapping (Speffz by default) in settings, for **both corners and edges**. The scheme drives the letters shown everywhere, including the 3-twists and commutator letters, so the whole app speaks your lettering.
- **WCA account & cloud sync** — sign in with your WCA account; solves are stored in a database so your history follows you across devices.
- **Statistics overview** — a mobile-friendly grid of all cases with average time and repetition count, searchable with `*`/`?` wildcards.
- **Your alg per case** — pick the algorithm you actually use for each case (click it in any case detail); with a smart cube the executed alg is recognized automatically.
- **Custom letter scheme** — edit your sticker→letter mapping (Speffz by default) in settings. The scheme drives the letters shown everywhere, including the 3-twists letters, so the whole app speaks your lettering.
- **Presets** — save named case selections (plus a starred quick-list) to jump between practice sets.
- **Notes** — attach a personal note to any case.
- **Interactive 3D cube** — touch/drag to rotate; configurable solving orientation.
- **Unified light/dark theme** and **four languages** (EN, DE, FR, IT).

### Buffer order (3-twists, commutators, 2-flips & 2-twists)

The 3-twists, commutator, 2-twist and 2-flip sets are grouped by **buffer**. In settings you can reorder the buffer priority — by **drag-and-drop** or the up/down buttons — and the sets **re-partition live**: each case is assigned to its highest-priority buffer, so the grouping and the case letters follow your preferred buffer order.

There are two buffer lists: a **corner** order (3-twists, corner commutators, corner 2-twists) and a separate **edge** order (edge commutators, edge 2-flips). A case only shows up under its highest-priority buffer — later buffers list only the cases their earlier buffers don't already cover, so the corner commutator set counts down 378 → 270 → 180 → 108 → 54 → 18 across the default order and the edge set 440 → 360 → … → 8.

The 2-piece sets can also consist of exactly the two never-configured back pieces (`DBR`+`DBL`, or `BR`+`BL`); those get an implicit lowest-priority fallback buffer so every case is still reachable.

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
- **Fresh measurement after mistakes** — if you turn wrong, undo your moves: as soon as the cube is back at the case's start position (or you reset with a full D/U-layer spin, D4/U4), the timing restarts from zero on your next move.
- **Alg recognition** — when a smart-cube solve finishes, the executed move sequence is matched against the case's algorithm collection (rotations, slice and wide moves are translated to what the cube physically reports). A recognized alg is recorded with the solve and saved as *your* alg for that case.
- **Keyboard simulator** for testing without a physical cube (`window.btSim.connect()` in the browser console).

## WCA login, cloud sync & statistics

Sign in via the account button in the navbar (WCA OAuth). While signed in:

- every solve is stored in the database (an offline queue in `localStorage` buffers solves when you're offline or logged out and drains after the next login),
- deleting a result also deletes it from the database,
- your per-case alg choices sync across devices,
- the **statistics page** (bar-chart icon) aggregates over your whole account history.

Logged out, the statistics page falls back to the locally stored per-case data, so it works without an account too.

### Backend & deployment

The frontend stays a static Vite SPA; the API lives in **Vercel serverless functions** (`api/`) that talk to a **MariaDB**:

1. Create a MySQL database and allow remote access for its user
2. Create a WCA OAuth application (redirect URI `https://<domain>/api/auth/wca/callback`; the scope field can stay blank — the default scope is `public`).
3. Configure the environment variables from `.env.example` in Vercel.
4. Create the tables once — either run the **"Setup database"** GitHub Action (needs the `MYSQL_*` repository secrets, see `.github/workflows/setup-db.yml`) or locally `npm run setup-db` with the `MYSQL_*` variables set.

For local development run `vercel dev` (serves the functions on port 3000) next to `npm run dev` — the Vite dev server proxies `/api` there. Without a backend the app simply behaves as logged out.

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

# Commutators (edges & corners)
node scripts/fetch_blddb_comm_algs.mjs      # builds/refreshes corner_comms.json + edge_comms.json from blddb
node scripts/generate_comm_scrambles.mjs    # adds scrambles (idempotent/resumable)

# 2-Flips (edges) & 2-Twists (corners)
node scripts/fetch_blddb_flip_twist_algs.mjs   # builds/refreshes edge_flips.json + corner_twists2.json from blddb
node scripts/generate_flip_twist_scrambles.mjs # adds scrambles (idempotent/resumable)
```

The sets are fully data-driven from [blddb](https://github.com/nbwzx/blddb): every case is decoded by cube geometry and re-expressed from each configurable buffer, so the `fetch_blddb_*.mjs` scripts double as importers (they only update `algs`/`buffers`, leaving scrambles intact).

A GitHub Action (`.github/workflows/update-algs.yml`) refreshes **all** sets' algorithms from blddb weekly and opens a PR when they change.
