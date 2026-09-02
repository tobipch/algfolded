# Algfolded

A trainer for blindfolded (BLD) speedcubing algorithms: Vue 3 + Pinia, Vite,
Bootstrap 5, vue-i18n (en/de/fr/it), vitest. `npm run dev`, `npm test`,
`npm run typecheck`, `npm run build`.

## What makes it different

Most trainers time you. Algfolded **watches the cube**: with a Bluetooth smart
cube connected it tracks a virtual cube move by move, so it knows what you
actually did — not just how long you took. That is where the interesting
features live, and where new ones should come from:

- the case is armed by putting the *virtual* cube into the case's scrambled
  state, so success is "your moves brought it back to solved". Detection is
  relative, so the physical cube can be in any state and nothing has to be
  re-scrambled between cases;
- the executed move sequence is matched against the case's algorithm
  collection, so the app records *which* alg you used and learns your
  preferred one — an unlisted solution is saved as your own alg;
- gestures that are net-identity and therefore can never appear inside a real
  algorithm double as controls: D4/U4 re-arms the current case, L4 reveals its
  algorithm;
- a wrong execution is detectable (the cube standing still in a state the case
  cannot reach), so a mistake can be surfaced without asking the user.

Prefer features that are only possible because the cube is connected.

## Architecture map

### Algsets: the data

`src/algsets/` — one module per set (`commutators.ts`, `ltct.ts`, `parities.ts`,
…), all listed in `registry.ts` (`ALGSETS`). Adding a set is a data file plus a
descriptor; the `Algset` interface lives in `types.ts`.

A set's `load()` returns raw JSON (`src/assets/*.json`); `derive(raw, deps)`
turns it into `AlgCase[]` (`{id, path, algs, scrambles}`). Derivation depends on
settings — notably the buffer order — so cases are a **computed**, not a
one-time transform. `caseLabel()` / `caseSecondary()` render a case through the
user's letter scheme.

`AlgsetStore` (`src/stores/AlgsetStore.ts`) owns the active set, its loaded
cases, `byId`, the hierarchy `tree`, and case labels. It is the only place the
rest of the app reads case data from.

### Stores: who owns what

| Store | Owns |
| --- | --- |
| `AlgsetStore` | the active set, its cases, the hierarchy, case labels |
| `SelectedStore` | which cases the user selected |
| `SessionStore` | the run: case picking, the timer state machine, stats, SRS |
| `FlowStore` | a flow run: pages of five cases, its own timing, and the history of finished runs |
| `BluetoothCubeStore` | **the** smart cube connection, the virtual cube, gestures |
| `SolveSyncStore` | the cloud queue for solves |
| `SettingsStore` | all user settings, one flat persisted object |
| `LetterSchemeStore`, `PresetStore`, `NotesStore`, `CustomAlgsStore`, `PreferredAlgStore`, `AuthStore`, `ThemeStore`, `DisplayStore` | as named |

Everything persisted goes through `src/helpers/namespaced_storage.ts`, which
never throws: a corrupt or blocked `localStorage` must not stop the app from
booting. Most run data is namespaced per algset (`<key>:<algsetId>`), so sets
keep separate sessions and histories. `storage_resilience.test.ts` pins this
down — extend it whenever a persisted shape changes.

Flow keeps its own run history under `algfolded_flow_runs:<algsetId>` (capped,
oldest first) so runs can be compared with each other. It is not a second
statistics store: it holds whole runs, which the solve-level stores have no
concept of, and it belongs to the store that produces them. Per-solve history
still goes through `recordSolve` and nowhere else.

### Picking the next case

`SessionStore.chooseKey()` / `commitCase()` are the single case picker: SRS
weighting (`src/helpers/srs.js`: per-case EMA, `caseWeight`,
`weightedRandomPick`), a recency cooldown, the zero-count-first rule, and the
recap mode. Anything that needs a case asks them; do not write a second picker.

### Recording a solve

`SessionStore.recordSolve()` is the single place a completed case is booked: the
local `store.stats` entry, the recap count, `SolveSyncStore.enqueue()`, clearing
the "didn't know" flag, and the EMA update. `stopTimer()` calls it and then
drives the timer state machine; flow calls it and does its own advancing.

`api/solves.ts` persists to the account database. It **normalises `source` to
exactly `"smartcube"` or `"timer"`** — anything else is silently coerced, so do
not invent new values. If a mode needs to be distinguishable, mark it in the
local `store.stats` entry instead.

## Conventions a change has to respect

- **New modes become visible through the mode selector**, not through a hidden
  settings toggle. The selector lives in `SelectSideCard.vue`; the chosen mode
  is `SessionStore.store.mode` (`'practice' | 'recap' | 'flow'`), persisted with
  the run.
- **Do not render a control that has no effect** in the current mode or without
  a connected cube. The "timed" checkbox is hidden in flow because flow does not
  use the timer; the summary omits TPS and the per-case tables when there was no
  cube to measure them.
- **The smart cube connection has exactly one owner**, `BluetoothCubeStore`.
  Views subscribe to its `phase`, `resetSignal`, `hintSignal` and
  `tooFarFromSolved`; they never open a connection or restructure its lifecycle.
- **Keep detection and timing logic pure.** `src/helpers/` holds the modules
  with no store or DOM dependency (`srs.js`, `alg_match.js`, `scramble_utils.js`,
  `flow_timing.ts`), and they are tested directly.
- **Four languages.** Every user-visible string needs a key in
  `src/assets/i18n/{en,de,fr,it}.json`. There is no fallback worth shipping.
- **Existing users see no change until they ask for one.** New behaviour goes
  behind a mode or a setting with a conservative default, and persisted data
  from an older version has to keep loading (see the `recapMode` → `mode`
  migration in `SessionStore.loadStore`).
- Run `npm run typecheck` and `npm test` before calling a change done. JS files
  are not type-checked yet (`checkJs: false`); new files should be `.ts` or
  carry JSDoc types where other `.ts` code consumes them.
