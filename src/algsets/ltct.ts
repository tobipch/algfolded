import type { AlgCase, Algset } from '@/algsets/types'
import { parseLtctKey } from '@/helpers/helpers'

// Shape of an entry in the (legacy) ltct_map.json data file.
interface RawEntry {
  key: string
  algs: string[]
  scrambles: string[]
}

const GROUP_ORDER = ['UU', 'UD', 'DU', 'DD']

// Speffz sticker order, used to sort subgroups and cases.
const SPEFFZ_ORDER = [
  'UBL', 'UBR', 'UFR', 'UFL',
  'LUB', 'LUF', 'LDF', 'LDB',
  'FUL', 'FUR', 'FDR', 'FDL',
  'RUF', 'RUB', 'RDB', 'RDF',
  'BUR', 'BUL', 'BDL', 'BDR',
  'DFL', 'DFR', 'DBR', 'DBL',
]

const normalize = (raw: Record<string, RawEntry>): AlgCase[] =>
  Object.keys(raw).map((id) => ({
    id,
    path: id.split(' '),
    algs: raw[id].algs ?? [],
    scrambles: raw[id].scrambles ?? [],
  }))

export const ltct: Algset = {
  id: 'ltct',
  name: 'algset.ltct',
  usesLetterScheme: true,
  levels: [
    { id: 'group', display: (v) => ({ primary: v }), order: GROUP_ORDER },
    { id: 'subgroup', display: (v, ctx) => ({ primary: ctx.toLetter(v), secondary: v }), order: SPEFFZ_ORDER },
    { id: 'case', display: (v, ctx) => ({ primary: ctx.toLetter(v), secondary: v }), order: SPEFFZ_ORDER },
  ],
  // Lazy: the data file is only fetched when this set is activated.
  load: () =>
    import('@/assets/ltct_map.json').then((m) =>
      normalize((m.default as unknown) as Record<string, RawEntry>),
    ),
  // LTCT's cases are static (paths already baked in); nothing to derive.
  derive: (raw) => raw as AlgCase[],
  caseLabel: (c, toLetter) => parseLtctKey(c.id, toLetter).letters,
  // Stats grid: the letter pair as the big label, the set (UU/UD/DU/DD) above
  // it — "P" alone doesn't identify a case, "UD NP" does.
  statsDisplay: (c, toLetter) => {
    const p = parseLtctKey(c.id, toLetter)
    return { primary: p.letters, secondary: p.group }
  },
  statsGroupFilter: true,
}
