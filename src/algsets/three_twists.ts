import type { AlgCase, Algset } from '@/algsets/types'
import type { ToLetter } from '@/helpers/helpers'

// A raw 3-twist from three_twists.json: 3 corners all twisted the same
// direction. The grouping (buffer / first / second twist) is derived at
// runtime from the configurable buffer order, so the file stores no paths.
export interface RawTwist {
  id: string
  corners: string[]   // 3 canonical corner names, e.g. ["UBL","UBR","UFR"]
  dir: 'cw' | 'ccw'
  algs: string[]
  scrambles: string[]
}

// Buffer name (its tracked sticker position) -> the corner it lives on.
const BUFFERS: Record<string, { corner: string; sticker: string }> = {
  UFR: { corner: 'UFR', sticker: 'UFR' },
  UFL: { corner: 'UFL', sticker: 'UFL' },
  UBR: { corner: 'UBR', sticker: 'UBR' },
  UBL: { corner: 'UBL', sticker: 'UBL' },
  RDF: { corner: 'DFR', sticker: 'RDF' },
  FDL: { corner: 'DFL', sticker: 'FDL' },
}

export const DEFAULT_BUFFER_ORDER = ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL']

// The sticker a twisted corner's U/D facelet lands on. We store stickers (not
// letters) in the path so the displayed letters follow the user's letter
// scheme; `toLetter` is applied at render time. Validated against the source CSV.
const CW: Record<string, string> = { UBL: 'BUL', UBR: 'RUB', UFL: 'LUF', UFR: 'RUF', DFR: 'RDF', DFL: 'FDL', DBR: 'BDR', DBL: 'LDB' }
const CCW: Record<string, string> = { UBL: 'LUB', UBR: 'BUR', UFL: 'FUL', UFR: 'FUR', DFR: 'FDR', DFL: 'LDF', DBR: 'RDB', DBL: 'BDL' }

// Corner U/D identity letter, used only to order the two targets canonically.
const IDENTITY: Record<string, string> = { UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D', DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X' }

// Default (Speffz) letter of a sticker, used only for scheme-independent
// stable sorting of the displayed cases.
const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}

// Path segments are sticker positions joined by this separator (e.g.
// "UFR·RUF·RUB"), so each piece can be translated independently.
const SEP = '·'

// Translate a "sticker·sticker·…" path segment to its letters (e.g. "CRN").
const lettersOf = (segment: string, toLetter: ToLetter): string =>
  segment.split(SEP).map(toLetter).join('')

// Partition raw twists into displayed cases (buffer -> first twist -> case),
// assigning each twist to the highest-priority buffer in its triple.
export const partition = (twists: RawTwist[], bufferOrder: string[]): AlgCase[] => {
  const priorityByCorner: Record<string, number> = {}
  bufferOrder.forEach((name, i) => {
    const b = BUFFERS[name]
    if (b) priorityByCorner[b.corner] = i
  })

  type Sortable = AlgCase & { _sort: [number, string, string] }
  const out: Sortable[] = []

  for (const t of twists) {
    // buffer = the triple's corner with the smallest buffer priority
    let bufferCorner: string | null = null
    let bufferIdx = Infinity
    for (const c of t.corners) {
      const p = priorityByCorner[c]
      if (p !== undefined && p < bufferIdx) { bufferIdx = p; bufferCorner = c }
    }
    if (bufferCorner === null) continue // every triple has >=1 buffer corner

    const bSticker = Object.values(BUFFERS).find((b) => b.corner === bufferCorner)!.sticker
    const targets = t.corners.filter((c) => c !== bufferCorner)
    targets.sort((a, b) => IDENTITY[a].localeCompare(IDENTITY[b]))
    const table = t.dir === 'cw' ? CW : CCW
    const s1 = table[targets[0]]
    const s2 = table[targets[1]]

    out.push({
      id: t.id,
      path: [bSticker, bSticker + SEP + s1, bSticker + SEP + s1 + SEP + s2],
      algs: t.algs,
      scrambles: t.scrambles,
      _sort: [bufferIdx, SPEFFZ[s1], SPEFFZ[s2]],
    })
  }

  out.sort((a, b) =>
    a._sort[0] - b._sort[0] ||
    a._sort[1].localeCompare(b._sort[1]) ||
    a._sort[2].localeCompare(b._sort[2]),
  )
  return out.map(({ _sort, ...c }) => c)
}

export const threeTwists: Algset = {
  id: 'twists3',
  name: 'algset.twists3',
  usesLetterScheme: true, // twist letters follow the configured letter scheme
  levels: [
    { id: 'buffer', display: (v, ctx) => ({ primary: ctx.toLetter(v), secondary: v }) },
    { id: 'firstTwist', display: (v, ctx) => ({ primary: lettersOf(v, ctx.toLetter) }) },
    { id: 'case', display: (v, ctx) => ({ primary: lettersOf(v, ctx.toLetter) }) },
  ],
  load: () =>
    import('@/assets/three_twists.json').then(
      (m) => Object.values((m.default as unknown) as Record<string, RawTwist>),
    ),
  derive: (raw, deps) => partition(raw as RawTwist[], deps.bufferOrder),
  caseLabel: (c, toLetter) => lettersOf(c.path[c.path.length - 1], toLetter),
  // Many cases per buffer group: the stats grid filters by buffer.
  statsGroupFilter: true,
}

