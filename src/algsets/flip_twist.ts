import type { AlgCase, Algset } from '@/algsets/types'
import type { ToLetter } from '@/helpers/helpers'
import { SPEFFZ } from '@/algsets/commutators'

// A raw 2-flip / 2-twist case as stored in the data files. Buffer-order-
// independent: `buffers` maps every piece in the case (by its tracked buffer
// key) to the value the other piece contributes to the label — the other edge's
// name for flips, the other corner's U/D landing sticker for twists.
export interface RawFlipTwist {
  algs: string[]
  scrambles: string[]
  buffers: Record<string, string>
}

// Corner buffer stickers that aren't already a piece name (for piece-notation
// display on the first level).
const CORNER_BUFFER_PIECE: Record<string, string> = { RDF: 'DFR', FDL: 'DFL' }
const bufferPiece = (v: string): string => CORNER_BUFFER_PIECE[v] ?? v

// The two back corners / back-down edges are never configurable buffers, but a
// 2-piece case can consist of exactly those two — so they're appended to the
// effective order (lowest priority) to guarantee every case is assignable.
const EXTRA_CORNERS = ['DBR', 'DBL']
const EXTRA_EDGES = ['BR', 'BL']
const withExtras = (order: string[], extras: string[]): string[] =>
  [...order, ...extras.filter((e) => !order.includes(e))]

// Partition raw cases into buffer -> case, assigning each to the highest-
// priority buffer among its two pieces. `makeCasePath` builds the two path
// segments (buffer, case) from the chosen buffer and the other piece's value.
const partition = (
  raw: Record<string, RawFlipTwist>,
  order: string[],
  caseSegment: (buffer: string, other: string) => string,
): AlgCase[] => {
  const priority = new Map(order.map((b, i) => [b, i]))
  type Sortable = AlgCase & { _sort: [number, string] }
  const out: Sortable[] = []

  for (const [id, c] of Object.entries(raw)) {
    let buffer: string | null = null
    let bufIdx = Infinity
    for (const b of Object.keys(c.buffers)) {
      const p = priority.get(b)
      if (p !== undefined && p < bufIdx) { bufIdx = p; buffer = b }
    }
    if (buffer === null) continue

    const other = c.buffers[buffer]
    out.push({
      id,
      path: [buffer, caseSegment(buffer, other)],
      algs: c.algs,
      scrambles: c.scrambles,
      _sort: [bufIdx, SPEFFZ[other] ?? other],
    })
  }

  out.sort((a, b) => a._sort[0] - b._sort[0] || a._sort[1].localeCompare(b._sort[1]))
  return out.map(({ _sort, ...rest }) => rest)
}

export const edgeFlips: Algset = {
  id: 'flips2',
  name: 'algset.flips2',
  usesLetterScheme: false, // flips are shown purely in piece notation
  levels: [
    // Stufe 1: buffer edge (piece notation). Stufe 2: the pair "UF-UB".
    { id: 'buffer', display: (v) => ({ primary: v }) },
    { id: 'case', display: (v) => ({ primary: v }) },
  ],
  load: () =>
    import('@/assets/edge_flips.json').then((m) => (m.default as unknown) as Record<string, RawFlipTwist>),
  derive: (raw, deps) =>
    partition(raw as Record<string, RawFlipTwist>, withExtras(deps.edgeBufferOrder, EXTRA_EDGES),
      (buffer, other) => `${buffer}-${other}`),
  caseLabel: (c) => c.path[c.path.length - 1],
}

// Stufe 2 for twists is "<buffer piece>/<letter>"; the sticker after "/" is
// translated through the letter scheme, the buffer part is left as piece notation.
const twistCaseDisplay = (value: string, toLetter: ToLetter): string => {
  const [pre, sticker] = value.split('/')
  return `${pre}/${toLetter(sticker)}`
}

export const cornerTwists2: Algset = {
  id: 'twists2',
  name: 'algset.twists2',
  usesLetterScheme: true,
  levels: [
    // Stufe 1: buffer corner (piece notation).
    { id: 'buffer', display: (v) => ({ primary: bufferPiece(v) }) },
    // Stufe 2: buffer piece + "/" + the other corner's U/D landing letter.
    { id: 'case', display: (v, ctx) => ({ primary: twistCaseDisplay(v, ctx.toLetter) }) },
  ],
  load: () =>
    import('@/assets/corner_twists2.json').then((m) => (m.default as unknown) as Record<string, RawFlipTwist>),
  derive: (raw, deps) =>
    partition(raw as Record<string, RawFlipTwist>, withExtras(deps.bufferOrder, EXTRA_CORNERS),
      (buffer, other) => `${bufferPiece(buffer)}/${other}`),
  caseLabel: (c, toLetter) => twistCaseDisplay(c.path[c.path.length - 1], toLetter),
}
