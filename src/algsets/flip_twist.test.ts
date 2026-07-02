import { describe, it, expect } from 'vitest'
import { edgeFlips, cornerTwists2, type RawFlipTwist } from './flip_twist'

const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}
const toLetter = (s: string): string => SPEFFZ[s] ?? s

const deps = {
  bufferOrder: ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL'],
  edgeBufferOrder: ['UF', 'UB', 'UR', 'UL', 'FR', 'FL', 'DF', 'DB', 'DR', 'DL'],
}

const levels = (set: typeof edgeFlips, c: { path: string[] }): string[] =>
  set.levels.map((lvl, i) => lvl.display(c.path[i], { toLetter }).primary)

describe('edge 2-flips', () => {
  it('shows buffer and the pair in piece notation (two levels)', () => {
    const raw: Record<string, RawFlipTwist> = {
      // UF and UB flipped -> buffer UF (higher priority), case "UF-UB".
      x: { algs: ['a'], scrambles: [], buffers: { UF: 'UB', UB: 'UF' } },
    }
    const [c] = edgeFlips.derive(raw, deps)
    expect(c.path.length).toBe(2)
    expect(levels(edgeFlips, c)).toEqual(['UF', 'UF-UB'])
    expect(edgeFlips.caseLabel(c, toLetter)).toBe('UF-UB')
  })

  it('assigns the highest-priority edge as the buffer', () => {
    const raw: Record<string, RawFlipTwist> = {
      y: { algs: ['a'], scrambles: [], buffers: { DR: 'UB', UB: 'DR' } },
    }
    expect(edgeFlips.derive(raw, deps)[0].path[0]).toBe('UB') // UB before DR
  })

  it('falls back to BR/BL for a pair of the two never-configured edges', () => {
    const raw: Record<string, RawFlipTwist> = {
      z: { algs: ['a'], scrambles: [], buffers: { BR: 'BL', BL: 'BR' } },
    }
    expect(edgeFlips.derive(raw, deps)[0].path[0]).toBe('BR')
  })
})

describe('corner 2-twists', () => {
  it('matches the documented example UFR/N', () => {
    // Buffer UFR; the other corner (UBR) landed on RUB (N).
    const raw: Record<string, RawFlipTwist> = {
      x: { algs: ['a'], scrambles: [], buffers: { UFR: 'RUB', UBR: 'FUR' } },
    }
    const [c] = cornerTwists2.derive(raw, deps)
    expect(c.path.length).toBe(2)
    expect(levels(cornerTwists2, c)).toEqual(['UFR', 'UFR/N'])
    expect(cornerTwists2.caseLabel(c, toLetter)).toBe('UFR/N')
  })

  it('shows the DFR buffer in piece notation, not its RDF sticker', () => {
    const raw: Record<string, RawFlipTwist> = {
      y: { algs: ['a'], scrambles: [], buffers: { RDF: 'RUB', DBR: 'FDR' } },
    }
    const [c] = cornerTwists2.derive(raw, deps)
    expect(c.path[0]).toBe('RDF')
    expect(levels(cornerTwists2, c)[0]).toBe('DFR')
  })
})
