import { describe, it, expect } from 'vitest'
import {
  partition,
  cornerComms,
  DEFAULT_CORNER_BUFFER_ORDER,
  type RawComm,
} from './commutators'

// Default Speffz for corners + edges, so the test reads displayed letters the
// way the app does (paths store stickers; toLetter renders them).
const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}
const toLetter = (s: string): string => SPEFFZ[s] ?? s

// Displayed letters for each path segment via the algset's level display.
const letters = (c: ReturnType<typeof partition>[number]): string[] =>
  cornerComms.levels.map((lvl, i) => lvl.display(c.path[i], { toLetter }).primary)

describe('commutators partition', () => {
  it('groups buffer / second letter / case and translates through the scheme', () => {
    // UFR buffer, first target UBL (A), second target LUF (F) -> case "AF".
    const raw: Record<string, RawComm> = {
      x: { algs: ['alg'], scrambles: ['scr'], buffers: { UFR: ['UBL', 'LUF'] } },
    }
    const [c] = partition(raw, DEFAULT_CORNER_BUFFER_ORDER)
    // buffer level shows piece notation; then the second letter, then the pair.
    expect(letters(c)).toEqual(['UFR', 'A', 'AF'])
    expect(cornerComms.caseLabel(c, toLetter)).toBe('AF')
    // the buffer level exposes the buffer letter as secondary
    expect(cornerComms.levels[0].display(c.path[0], { toLetter }).secondary).toBe('C')
  })

  it('assigns the highest-priority buffer present among the case pieces', () => {
    // Buffer UFR is absent from this case -> next available in default order is UFL.
    const raw: Record<string, RawComm> = {
      y: {
        algs: ['alg'], scrambles: [],
        buffers: { UFL: ['UBR', 'RUB'], UBR: ['UFL', 'FUL'] },
      },
    }
    const [c] = partition(raw, DEFAULT_CORNER_BUFFER_ORDER)
    expect(letters(c)[0]).toBe('UFL')
  })

  it('re-partitions when the buffer order changes', () => {
    const raw: Record<string, RawComm> = {
      z: {
        algs: ['alg'], scrambles: [],
        buffers: { UFR: ['UBL', 'LUF'], UFL: ['UBL', 'BUL'] },
      },
    }
    expect(letters(partition(raw, DEFAULT_CORNER_BUFFER_ORDER)[0])[0]).toBe('UFR') // UFR wins
    const reordered = ['UFL', 'UBR', 'UBL', 'RDF', 'FDL', 'UFR']
    expect(letters(partition(raw, reordered)[0])[0]).toBe('UFL') // now UFL wins
  })

  it('shows the DFR/DFL buffers in piece notation, not their sticker', () => {
    const raw: Record<string, RawComm> = {
      // Only the RDF (=DFR corner) buffer is present here.
      w: { algs: ['alg'], scrambles: [], buffers: { RDF: ['UBL', 'LUB'] } },
    }
    const [c] = partition(raw, DEFAULT_CORNER_BUFFER_ORDER)
    expect(letters(c)[0]).toBe('DFR')
  })

  it('exposes piece notation as the secondary label (buffer-t1-t2)', () => {
    const raw: Record<string, RawComm> = {
      // edge buffer UB, targets FD and LB -> "UB-FD-LB" (not the raw source key)
      k: { algs: ['a'], scrambles: [], buffers: { UB: ['FD', 'LB'] } },
    }
    const [c] = partition(raw, ['UB', 'UF'])
    expect(cornerComms.caseSecondary!(c, toLetter)).toBe('UB-FD-LB')
    // the DFR buffer shows piece notation, not its RDF sticker
    const raw2: Record<string, RawComm> = {
      m: { algs: ['a'], scrambles: [], buffers: { RDF: ['UBL', 'LUB'] } },
    }
    const [c2] = partition(raw2, ['RDF'])
    expect(cornerComms.caseSecondary!(c2, toLetter)).toBe('DFR-UBL-LUB')
  })

  it('keeps a stable id per case regardless of buffer order', () => {
    const raw: Record<string, RawComm> = {
      'corner-case-1': { algs: ['a'], scrambles: [], buffers: { UFR: ['UBL', 'LUF'] } },
    }
    expect(partition(raw, DEFAULT_CORNER_BUFFER_ORDER)[0].id).toBe('corner-case-1')
  })
})
