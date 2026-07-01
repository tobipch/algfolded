// Per-algset persistence: each storage key holds `{ [algsetId]: data }` so
// selection / notes / presets don't collide across algsets.

const parse = (raw: string | null): unknown => {
  if (raw == null) return undefined
  try { return JSON.parse(raw) } catch { return undefined }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Read the slot for `algsetId`, or `fallback` if absent.
export const readNamespaced = <T>(storageKey: string, algsetId: string, fallback: T): T => {
  const all = parse(localStorage.getItem(storageKey))
  if (isPlainObject(all) && algsetId in all) return all[algsetId] as T
  return fallback
}

// Write the slot for `algsetId`, preserving the other algsets' slots.
export const writeNamespaced = <T>(storageKey: string, algsetId: string, value: T): void => {
  const existing = parse(localStorage.getItem(storageKey))
  const all: Record<string, unknown> = isPlainObject(existing) ? existing : {}
  all[algsetId] = value
  localStorage.setItem(storageKey, JSON.stringify(all))
}

// One-time migration: lift legacy flat (pre-multi-algset) data into the
// `algsetId` namespace. `isFlat` decides whether the stored value is still in
// the old shape (so we never wrap already-namespaced data twice).
export const migrateToNamespaced = (
  storageKey: string,
  algsetId: string,
  isFlat: (parsed: unknown) => boolean,
): void => {
  const parsed = parse(localStorage.getItem(storageKey))
  if (parsed === undefined) return
  if (isFlat(parsed)) {
    localStorage.setItem(storageKey, JSON.stringify({ [algsetId]: parsed }))
  }
}

// --- "is this the old flat shape?" predicates, one per data form ---

// selection: old = a bare array of case ids
export const isFlatArray = (parsed: unknown): boolean => Array.isArray(parsed)

// notes: old = a flat map caseId -> string
export const isFlatStringMap = (parsed: unknown): boolean =>
  isPlainObject(parsed) && Object.values(parsed).some((v) => typeof v === 'string')

// presets: old = a flat map presetName -> array of case ids
export const isFlatArrayMap = (parsed: unknown): boolean =>
  isPlainObject(parsed) && Object.values(parsed).some((v) => Array.isArray(v))

// session: old = the run object itself (carries a `keys` array); namespaced
// data is keyed by algsetId, so its top level has no `keys` field.
export const isFlatSession = (parsed: unknown): boolean =>
  isPlainObject(parsed) && Array.isArray((parsed as Record<string, unknown>).keys)

// srs: old = a flat map caseId -> { a, n, s }; namespacing wraps that one level
// deeper, so only a flat map's values carry the a/n/s fields directly.
export const isFlatSrs = (parsed: unknown): boolean =>
  isPlainObject(parsed) &&
  Object.values(parsed).some(
    (v) => isPlainObject(v) && ('a' in v || 'n' in v || 's' in v),
  )

// srs counter: old = a bare number
export const isFlatNumber = (parsed: unknown): boolean => typeof parsed === 'number'
