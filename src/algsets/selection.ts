import type { AlgCase, AlgsetLevel } from '@/algsets/types'
import type { ToLetter } from '@/helpers/helpers'

// Ids of all cases whose hierarchy path starts with `prefix`. An empty prefix
// matches every case. Level-agnostic: works for a group, a subgroup, etc.
export const casesUnder = (cases: AlgCase[], prefix: string[]): string[] =>
  cases
    .filter((c) => prefix.every((v, i) => c.path[i] === v))
    .map((c) => c.id)

// The string a wildcard pattern is matched against: each level's displayed
// primary (through the active letter scheme) concatenated, e.g. LTCT "UU AE"
// -> "UUAE". This mirrors what the user sees, so patterns read naturally.
export const caseSearchString = (
  c: AlgCase, levels: AlgsetLevel[], toLetter: ToLetter,
): string =>
  levels.map((lvl, i) => lvl.display(c.path[i] ?? '', { toLetter }).primary).join('')

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Ids of cases matching a wildcard pattern where "*" matches any run of
// characters (glob-style), matched case-insensitively against caseSearchString.
// e.g. "UU*E" -> UU-group cases ending in E; "**E" -> any case ending in E.
export const casesMatchingPattern = (
  cases: AlgCase[], levels: AlgsetLevel[], toLetter: ToLetter, pattern: string,
): string[] => {
  const cleaned = pattern.replace(/\s+/g, '')
  if (!cleaned) return []
  const rx = new RegExp('^' + cleaned.split('*').map(escapeRegex).join('.*') + '$', 'i')
  return cases
    .filter((c) => rx.test(caseSearchString(c, levels, toLetter)))
    .map((c) => c.id)
}
