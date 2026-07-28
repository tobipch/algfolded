// Per-algset persistence: each algset gets its own storage key, `<key>:<id>`,
// so selection / notes / presets / runs don't collide across algsets.
//
// This used to be one combined key holding `{ [algsetId]: data }`. Writing a
// slot then meant read → parse → replace one slot → stringify → write over
// *every* algset's data: a user with history in all eight sets paid ~12 ms of
// blocking main-thread work per saved solve instead of ~1 ms, and the single
// key grew past a megabyte against a ~5 MB origin quota. Splitting the keys
// makes a write cost only the set being written. `splitCombinedKey` migrates
// existing installs; `migrateToNamespaced` still handles the older, pre-
// multi-algset flat shape.

const parse = (raw: string | null): unknown => {
  if (raw == null) return undefined
  try { return JSON.parse(raw) } catch { return undefined }
}

// Every entry point below goes through these. localStorage can be missing
// entirely (non-browser contexts) or throw on access (privacy modes, blocked
// third-party storage); several of these functions run at module scope, where
// a throw means the app never boots.
const getItemSafe = (key: string): string | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

const removeItemSafe = (key: string): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch { /* nothing we can do, and nothing worth crashing over */ }
}

// Read and parse a plain (non-namespaced) storage key, falling back when it is
// missing OR unreadable. Stores used to call `JSON.parse(localStorage.getItem(…))`
// directly at module scope, so a single corrupt value — a truncated write, a
// quota-killed save, a stray browser extension — threw during module evaluation
// and took the whole app down with a blank page, with no way back for a user
// who can't open devtools.
export const readJson = <T>(storageKey: string, fallback: T): T => {
  const parsed = parse(getItemSafe(storageKey))
  return parsed === undefined || parsed === null ? fallback : (parsed as T)
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// localStorage throws on a full quota and in some privacy modes. Persisting is
// never worth taking the app down for, so writes degrade to a no-op and report
// whether they landed.
export const setItemSafe = (key: string, value: string): boolean => {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

// Serialise and store, never throwing. Same reasoning as setItemSafe.
export const writeJson = <T>(storageKey: string, value: T): boolean =>
  setItemSafe(storageKey, JSON.stringify(value))

// Some keys hold a bare string rather than JSON (the active algset id, the
// locale, the theme flag). They are read/written verbatim so existing installs
// keep working — going through JSON would make the stored value unparseable
// and silently reset the user's choice on upgrade.
export const readString = (storageKey: string): string | null => getItemSafe(storageKey)

export const writeString = (storageKey: string, value: string): boolean =>
  setItemSafe(storageKey, value)

const slotKey = (storageKey: string, algsetId: string): string => `${storageKey}:${algsetId}`

// Read the slot for `algsetId`, or `fallback` if absent.
export const readNamespaced = <T>(storageKey: string, algsetId: string, fallback: T): T => {
  const parsed = parse(getItemSafe(slotKey(storageKey, algsetId)))
  return parsed === undefined ? fallback : (parsed as T)
}

// Write the slot for `algsetId`. Touches only this algset's key.
export const writeNamespaced = <T>(storageKey: string, algsetId: string, value: T): boolean =>
  setItemSafe(slotKey(storageKey, algsetId), JSON.stringify(value))

// One-time migration from the combined `{ [algsetId]: data }` key to one key
// per algset. Runs before the first read of `storageKey`; the combined key is
// removed once every slot has been written across, so a half-finished
// migration (quota, crash) simply runs again next start.
export const splitCombinedKey = (storageKey: string): void => {
  const combined = parse(getItemSafe(storageKey))
  if (!isPlainObject(combined)) return
  let allWritten = true
  for (const [algsetId, value] of Object.entries(combined)) {
    // Never overwrite a slot that already exists — it is the newer data.
    if (getItemSafe(slotKey(storageKey, algsetId)) !== null) continue
    if (!setItemSafe(slotKey(storageKey, algsetId), JSON.stringify(value))) allWritten = false
  }
  if (allWritten) removeItemSafe(storageKey)
}

// One-time migration: lift legacy flat (pre-multi-algset) data into the
// algset's own key. `isFlat` decides whether the stored value is still in the
// old shape (so we never wrap already-namespaced data twice).
export const migrateToNamespaced = (
  storageKey: string,
  algsetId: string,
  isFlat: (parsed: unknown) => boolean,
): void => {
  const parsed = parse(getItemSafe(storageKey))
  if (parsed !== undefined && isFlat(parsed)) {
    // Flat data predates namespacing, so it belongs to the legacy set and no
    // per-algset key can exist yet.
    if (setItemSafe(slotKey(storageKey, algsetId), JSON.stringify(parsed))) {
      removeItemSafe(storageKey)
    }
    return
  }
  // Already-namespaced (combined) data, or nothing at all.
  splitCombinedKey(storageKey)
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
