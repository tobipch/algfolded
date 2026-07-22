import { describe, it, expect } from 'vitest'
import { partition, parities, type RawParity } from './parities'

const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
  UB: 'A', UR: 'B', UF: 'C', UL: 'D',
  FU: 'I', RU: 'M', BU: 'Q', DF: 'U',
}
const toLetter = (s: string): string => SPEFFZ[s] ?? s

const DEFAULT_ORDER = ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL']

const raw: Record<string, RawParity> = {
  'UFR UBL UF UR': { algs: ['a1'] }, // the reference case, memoed "A"
  'UFR RDF UF UB': { algs: ['a2'] }, // alternative edge swap, target P
  'UFR UBL UF BU': { algs: ['a3'] }, // flipped swap of UF and UB
  'UBL LDF UF UR': { algs: ['a4'] }, // other corner buffer (UBL beats FDL)
}

describe('parities partition', () => {
  it('groups buffer / edge swap / corner target', () => {
    const cases = partition(raw, DEFAULT_ORDER)
    const ref = cases.find((c) => c.id === 'UFR UBL UF UR')!
    expect(ref.path).toEqual(['UFR', 'UF·UR', 'UBL'])
    expect(parities.caseLabel(ref, toLetter)).toBe('A')
    expect(parities.caseSecondary!(ref, toLetter)).toBe('UF-UR')
  })

  it('renders the edge swap level as pieces with letters as secondary', () => {
    const [c] = partition({ 'UFR UBL UF UR': raw['UFR UBL UF UR'] }, DEFAULT_ORDER)
    const d = parities.levels[1].display(c.path[1], { toLetter })
    expect(d.primary).toBe('UF-UR')
    expect(d.secondary).toBe('CB')
  })

  it('orders corner buffers by the settings buffer order', () => {
    const cases = partition(raw, DEFAULT_ORDER)
    // UFR buffer group first, UBL after (4th in the default order)
    expect(cases[0].path[0]).toBe('UFR')
    expect(cases[cases.length - 1].path[0]).toBe('UBL')
  })

  it('puts the UF-UR swap first within a buffer', () => {
    const cases = partition(raw, DEFAULT_ORDER).filter((c) => c.path[0] === 'UFR')
    expect(cases[0].path[1]).toBe('UF·UR')
    // the other UF swaps follow Speffz-ordered (UB before the flipped BU)
    expect(cases.map((c) => c.path[1])).toEqual(['UF·UR', 'UF·UB', 'UF·BU'])
  })

  it('shows just the corner target letter in the stats grid', () => {
    const [c] = partition({ 'UFR RDF UF UB': raw['UFR RDF UF UB'] }, DEFAULT_ORDER)
    const d = parities.statsDisplay!(c, toLetter)
    expect(d.primary).toBe('P')
    expect(d.secondary).toBe('UFR UF-UB')
  })

  it('re-anchors D-layer cases to the tracked buffer sticker', () => {
    const dRaw: Record<string, RawParity> = {
      // data names the corner swap canonically; the trainer's buffer is the
      // RDF sticker, so the target is where RDF goes (DBR, not RDB).
      'DFR RDB UF UR': { algs: ['a5'] },
      // both corners carry a buffer: RDF beats FDL in the default order
      'DFR DFL UF UR': { algs: ['a6'] },
      // the DBL corner is tracked from LDB (never configurable, lowest priority)
      'DBR LDB UF UR': { algs: ['a7'] },
      'DBR DBL UF UR': { algs: ['a8'] },
    }
    const cases = partition(dRaw, DEFAULT_ORDER)
    const byId = (id: string) => cases.find((c) => c.id === id)!

    expect(byId('DFR RDB UF UR').path).toEqual(['RDF', 'UF·UR', 'DBR'])
    expect(byId('DFR DFL UF UR').path).toEqual(['RDF', 'UF·UR', 'FDL'])
    expect(byId('DBR LDB UF UR').path).toEqual(['LDB', 'UF·UR', 'DBR'])
    expect(byId('DBR DBL UF UR').path).toEqual(['LDB', 'UF·UR', 'BDR'])

    // buffer level shows the sticker with its letter; LDB groups sort last
    const d = parities.levels[0].display('RDF', { toLetter })
    expect(d).toEqual({ primary: 'RDF', secondary: 'P' })
    expect(cases[cases.length - 1].path[0]).toBe('LDB')
    // stats grid: re-anchored target letter, buffer sticker in the secondary
    const s = parities.statsDisplay!(byId('DFR RDB UF UR'), toLetter)
    expect(s).toEqual({ primary: 'W', secondary: 'RDF UF-UR' })
  })
})
