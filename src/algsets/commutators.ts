import type { AlgCase, Algset } from '@/algsets/types'
import type { ToLetter } from '@/helpers/helpers'

// A raw commutator (3-style) case as stored in the data files. Buffer-order-
// independent: `buffers` maps every trainer buffer whose piece is part of the
// 3-cycle to the two targets (Speffz sticker positions) named from that buffer.
// The grouping (buffer / second letter / case) is derived at runtime from the
// configurable buffer order, exactly like the 3-twists set.
export interface RawComm {
  algs: string[]
  scrambles: string[]
  buffers: Record<string, [string, string]>
}

// Default buffer orders. Corners reuse the 3-twists buffer order (shared
// setting); edges have their own.
export const DEFAULT_CORNER_BUFFER_ORDER = ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL']
export const DEFAULT_EDGE_BUFFER_ORDER = ['UF', 'UB', 'UR', 'UL', 'FR', 'FL', 'DF', 'DB', 'DR', 'DL']

// Default (Speffz) letter of every sticker, used only for scheme-independent
// stable ordering of the displayed cases (like SPEFFZ in three_twists.ts).
export const SPEFFZ: Record<string, string> = {
  // corners
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
  // edges
  UB: 'A', UR: 'B', UF: 'C', UL: 'D',
  LU: 'E', LF: 'F', LD: 'G', LB: 'H',
  FU: 'I', FR: 'J', FD: 'K', FL: 'L',
  RU: 'M', RB: 'N', RD: 'O', RF: 'P',
  BU: 'Q', BL: 'R', BD: 'S', BR: 'T',
  DF: 'U', DR: 'V', DB: 'W', DL: 'X',
}

// Buffer stickers whose name isn't already the canonical piece name. The first
// level shows the buffer in piece notation (e.g. UFR, UBL / UF, UB), so these
// two corner buffers map from their tracked sticker to their corner.
const BUFFER_PIECE: Record<string, string> = { RDF: 'DFR', FDL: 'DFL' }
const bufferPiece = (v: string): string => BUFFER_PIECE[v] ?? v

// Path segments join stickers with this separator so each piece translates
// independently (e.g. "UFR·LUB" -> two letters).
const SEP = '·'

const lettersOf = (segment: string, toLetter: ToLetter): string =>
  segment.split(SEP).map(toLetter).join('')

// Partition raw commutators into displayed cases (buffer -> second letter ->
// case), assigning each case to the highest-priority buffer whose piece is part
// of its 3-cycle.
export const partition = (raw: Record<string, RawComm>, bufferOrder: string[]): AlgCase[] => {
  const priority = new Map(bufferOrder.map((b, i) => [b, i]))

  type Sortable = AlgCase & { _sort: [number, string, string] }
  const out: Sortable[] = []

  for (const [id, c] of Object.entries(raw)) {
    // buffer = the configured buffer with the smallest priority index that
    // actually appears among this case's pieces.
    let buffer: string | null = null
    let bufIdx = Infinity
    for (const b of Object.keys(c.buffers)) {
      const p = priority.get(b)
      if (p !== undefined && p < bufIdx) { bufIdx = p; buffer = b }
    }
    if (buffer === null) continue // every 3-cycle contains >= 1 buffer piece

    const [t1, t2] = c.buffers[buffer]
    out.push({
      id,
      path: [buffer, t1, t1 + SEP + t2],
      algs: c.algs,
      scrambles: c.scrambles,
      _sort: [bufIdx, SPEFFZ[t1] ?? t1, SPEFFZ[t2] ?? t2],
    })
  }

  out.sort((a, b) =>
    a._sort[0] - b._sort[0] ||
    a._sort[1].localeCompare(b._sort[1]) ||
    a._sort[2].localeCompare(b._sort[2]),
  )
  return out.map(({ _sort, ...rest }) => rest)
}

// Shared shape for the two commutator sets; they differ only by data file and
// which buffer order they read.
const makeCommAlgset = (opts: {
  id: string
  name: string
  load: () => Promise<Record<string, RawComm>>
  order: (deps: { bufferOrder: string[]; edgeBufferOrder: string[] }) => string[]
}): Algset => ({
  id: opts.id,
  name: opts.name,
  usesLetterScheme: true,
  levels: [
    // Stufe 1: buffer, shown in piece notation (UFR / UF, not its letter).
    // Stufe 2: the second (first-target) letter. Stufe 3: the case letter pair.
    { id: 'buffer', display: (v, ctx) => ({ primary: bufferPiece(v), secondary: ctx.toLetter(v) }) },
    { id: 'secondLetter', display: (v, ctx) => ({ primary: ctx.toLetter(v) }) },
    { id: 'case', display: (v, ctx) => ({ primary: lettersOf(v, ctx.toLetter) }) },
  ],
  load: opts.load,
  derive: (rawData, deps) => partition(rawData as Record<string, RawComm>, opts.order(deps)),
  caseLabel: (c, toLetter) => lettersOf(c.path[c.path.length - 1], toLetter),
  // Piece notation of the three pieces: buffer + the two target stickers,
  // e.g. "UB-FD-LB" — clearer than the raw source key.
  caseSecondary: (c) => [bufferPiece(c.path[0]), ...c.path[2].split(SEP)].join('-'),
  // The inverse cycle swaps the two targets; it contains the same pieces, so
  // partition() files it under the same buffer -> only the targets flip.
  inversePath: ([buffer, , pair]) => {
    const [t1, t2] = pair.split(SEP)
    return [buffer, t2, t2 + SEP + t1]
  },
  // Hundreds of cases per buffer: the stats grid filters by buffer.
  statsGroupFilter: true,
})

export const cornerComms: Algset = makeCommAlgset({
  id: 'commCorner',
  name: 'algset.commCorner',
  load: () =>
    import('@/assets/corner_comms.json').then((m) => (m.default as unknown) as Record<string, RawComm>),
  order: (deps) => deps.bufferOrder,
})

export const edgeComms: Algset = makeCommAlgset({
  id: 'commEdge',
  name: 'algset.commEdge',
  load: () =>
    import('@/assets/edge_comms.json').then((m) => (m.default as unknown) as Record<string, RawComm>),
  order: (deps) => deps.edgeBufferOrder,
})
