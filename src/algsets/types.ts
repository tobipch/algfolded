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

// A trainable algset. New algsets = one of these + a data file.
export interface Algset {
  id: string
  name: string                  // i18n key for the display name
  levels: AlgsetLevel[]         // top..deepest; the last level is the case
  usesLetterScheme: boolean
  load: () => Promise<AlgCase[]>
}
