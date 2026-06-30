import type { AlgCase, Algset } from '@/algsets/types'

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

// Buffer name (tracked sticker) -> its corner + Speffz identity letter.
const BUFFERS: Record<string, { corner: string; letter: string }> = {
  UFR: { corner: 'UFR', letter: 'C' },
  UFL: { corner: 'UFL', letter: 'D' },
  UBR: { corner: 'UBR', letter: 'B' },
  UBL: { corner: 'UBL', letter: 'A' },
  RDF: { corner: 'DFR', letter: 'P' },
  FDL: { corner: 'DFL', letter: 'L' },
}
const LETTER_TO_BUFFER: Record<string, string> = Object.fromEntries(
  Object.entries(BUFFERS).map(([name, b]) => [b.letter, name]),
)

export const DEFAULT_BUFFER_ORDER = ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL']

// Per-corner twist letter (the sticker the U/D facelet lands on), validated
// against the source CSV.
const CW: Record<string, string> = { UBL: 'R', UBR: 'N', UFL: 'F', UFR: 'M', DFR: 'P', DFL: 'L', DBR: 'T', DBL: 'H' }
const CCW: Record<string, string> = { UBL: 'E', UBR: 'Q', UFL: 'I', UFR: 'J', DFR: 'K', DFL: 'G', DBR: 'O', DBL: 'S' }

// Speffz U/D identity letter of a corner, used only to order the two targets.
const IDENTITY: Record<string, string> = { UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D', DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X' }

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

    const bLetter = Object.values(BUFFERS).find((b) => b.corner === bufferCorner)!.letter
    const targets = t.corners.filter((c) => c !== bufferCorner)
    targets.sort((a, b) => IDENTITY[a].localeCompare(IDENTITY[b]))
    const table = t.dir === 'cw' ? CW : CCW
    const l1 = table[targets[0]]
    const l2 = table[targets[1]]

    out.push({
      id: t.id,
      path: [bLetter, bLetter + l1, bLetter + l1 + l2],
      algs: t.algs,
      scrambles: t.scrambles,
      _sort: [bufferIdx, l1, l2],
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
  usesLetterScheme: false, // twist letters are encoded directly (Speffz)
  levels: [
    { id: 'buffer', display: (v) => ({ primary: v, secondary: LETTER_TO_BUFFER[v] }) },
    { id: 'firstTwist', display: (v) => ({ primary: v }) },
    { id: 'case', display: (v) => ({ primary: v }) },
  ],
  load: () =>
    import('@/assets/three_twists.json').then(
      (m) => Object.values((m.default as unknown) as Record<string, RawTwist>),
    ),
  derive: (raw, deps) => partition(raw as RawTwist[], deps.bufferOrder),
}
