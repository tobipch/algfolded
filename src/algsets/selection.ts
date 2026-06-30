import type { AlgCase } from '@/algsets/types'

// Ids of all cases whose hierarchy path starts with `prefix`. An empty prefix
// matches every case. Level-agnostic: works for a group, a subgroup, etc.
export const casesUnder = (cases: AlgCase[], prefix: string[]): string[] =>
  cases
    .filter((c) => prefix.every((v, i) => c.path[i] === v))
    .map((c) => c.id)
