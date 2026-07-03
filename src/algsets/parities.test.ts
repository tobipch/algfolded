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
  'UBL LUF UF UR': { algs: ['a4'] }, // other corner buffer
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
})
