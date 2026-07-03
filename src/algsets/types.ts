import type { ToLetter } from '@/helpers/helpers'

// A single trainable case. `path` holds the hierarchy values top -> deepest
// (e.g. ["UU", "UFL", "LUB"]) so the hierarchy lives in data, not in the
// positional format of a key string.
export interface AlgCase {
  id: string
  path: string[]
  algs: string[]
  scrambles: string[]
}

export interface LevelDisplay {
  primary: string
  secondary?: string
}

export interface DisplayCtx {
  toLetter: ToLetter
}

// One level of the hierarchy (e.g. group / subgroup / case).
export interface AlgsetLevel {
  id: string
  display: (value: string, ctx: DisplayCtx) => LevelDisplay
  order?: string[]
}

// Inputs a set may use to derive its cases (e.g. the configurable buffer order
// for 3-twists / corner comms, and the separate edge-comm buffer order). LTCT
// ignores these.
export interface DeriveDeps {
  bufferOrder: string[]
  edgeBufferOrder: string[]
}

// A trainable algset. New algsets = one of these + a data file.
// `load()` returns the raw data; `derive()` turns it into the displayed cases
// (paths/grouping), which may depend on settings (DeriveDeps).
export interface Algset {
  id: string
  name: string                  // i18n key for the display name
  levels: AlgsetLevel[]         // top..deepest; the last level is the case
  usesLetterScheme: boolean
  load: () => Promise<unknown>
  derive: (raw: unknown, deps: DeriveDeps) => AlgCase[]
  // Human-readable label for a case (e.g. "CRN" / "AB"), translated through the
  // active letter scheme.
  caseLabel: (c: AlgCase, toLetter: ToLetter) => string
  // Optional secondary label shown in parentheses next to a result, in piece
  // notation (e.g. "UB-FD-LB"). Return '' to hide it. When omitted, callers
  // fall back to the raw case id.
  caseSecondary?: (c: AlgCase, toLetter: ToLetter) => string
  // Optional display for the per-case stats grid: `primary` is the big label,
  // `secondary` the small line above it (e.g. LTCT: letter pair + set). When
  // omitted, the grid falls back to the deepest level's display.
  statsDisplay?: (c: AlgCase, toLetter: ToLetter) => LevelDisplay
  // Stats grid filter over the first hierarchy level (buffer / LTCT set),
  // always including an "all cases" option. Omitted = no filter, all cases
  // are always shown (2-flips / 2-twists).
  statsGroupFilter?: boolean
}
