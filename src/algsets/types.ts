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
// for 3-twists). LTCT ignores these.
export interface DeriveDeps {
  bufferOrder: string[]
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
}
