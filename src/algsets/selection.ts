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

const toRegex = (pattern: string): RegExp =>
  new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$', 'i')

// Ids of cases matching a wildcard query, case-insensitively against
// caseSearchString. "*" matches any run of characters (glob-style), and the
// query may hold several whitespace-separated patterns whose matches are unioned.
// e.g. "UU*E" -> UU-group cases ending in E; "**E" -> any case ending in E;
// "UB*E UB*F" -> UB-group cases ending in E or F.
export const casesMatchingPattern = (
  cases: AlgCase[], levels: AlgsetLevel[], toLetter: ToLetter, query: string,
): string[] => {
  const patterns = query.trim().split(/\s+/).filter(Boolean)
  if (!patterns.length) return []
  const regexes = patterns.map(toRegex)
  return cases
    .filter((c) => {
      const s = caseSearchString(c, levels, toLetter)
      return regexes.some((rx) => rx.test(s))
    })
    .map((c) => c.id)
}
