import { describe, it, expect } from 'vitest'
import { partition, chooseStart, t2c, type RawT2c } from './t2c'

const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}
const toLetter = (s: string): string => SPEFFZ[s] ?? s

const DEFAULT_ORDER = ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL']

// The user's reference case (blddb "AWL"): corners UFL+DFL, UFR twisted so
// that its U sticker shows on F (FUR). Variants as generated into t2c_map.
const dufCase: RawT2c = {
  corners: ['UFL', 'DFL'],
  twist: 'FUR',
  variants: {
    UFL: ['UFL', 'DFL', 'LUF'],
    FUL: ['FUL', 'LDF', 'UFL'],
    LUF: ['LUF', 'FDL', 'FUL'],
    DFL: ['DFL', 'LUF', 'FDL'],
    LDF: ['LDF', 'UFL', 'DFL'],
    FDL: ['FDL', 'FUL', 'LDF'],
  },
  algs: ['alg1'],
}

// A case whose corners carry no configured buffer (DBR + DBL).
const backCase: RawT2c = {
  corners: ['DBR', 'DBL'],
  twist: 'RUF',
  variants: {
    DBR: ['DBR', 'DBL', 'RDB'],
    RDB: ['RDB', 'BDL', 'BDR'],
    BDR: ['BDR', 'LDB', 'DBR'],
    DBL: ['DBL', 'RDB', 'BDL'],
    BDL: ['BDL', 'BDR', 'LDB'],
    LDB: ['LDB', 'DBR', 'DBL'],
  },
  algs: ['alg2'],
}

describe('t2c representation choice', () => {
  it('starts at the first buffer sticker lying on one of the case corners', () => {
    // Default order: UFL (2nd buffer) lies on corner UFL -> memo D U F.
    expect(chooseStart(dufCase, DEFAULT_ORDER)).toBe('UFL')
    const [c] = partition({ 'UFL DFL FUR': dufCase }, DEFAULT_ORDER)
    expect(c.path[0]).toBe('UFL')
    expect(t2c.caseLabel(c, toLetter)).toBe('DUF')
    expect(t2c.caseSecondary!(c, toLetter)).toBe('UFL-DFL-LUF')
  })

  it('re-keys the same case when the buffer order prefers the other corner', () => {
    // FDL (on corner DFL) before UFL -> corner X = DFL, memo starts at FDL.
    const order = ['UFR', 'FDL', 'UFL', 'UBR', 'UBL', 'RDF']
    expect(chooseStart(dufCase, order)).toBe('FDL')
    const [c] = partition({ 'UFL DFL FUR': dufCase }, order)
    expect(c.path[0]).toBe('DFL')
    expect(t2c.caseLabel(c, toLetter)).toBe('LIG')
  })

  it('falls back to the canonical representation when no buffer is on the case', () => {
    expect(chooseStart(backCase, DEFAULT_ORDER)).toBe('DBR')
    const [c] = partition({ 'DBR DBL RUF': backCase }, DEFAULT_ORDER)
    expect(c.path[0]).toBe('DBR')
    expect(t2c.caseLabel(c, toLetter)).toBe('WXO')
  })

  it('keeps a stable id regardless of buffer order', () => {
    const a = partition({ 'UFL DFL FUR': dufCase }, DEFAULT_ORDER)[0]
    const b = partition({ 'UFL DFL FUR': dufCase }, ['UFR', 'FDL', 'UFL', 'UBR', 'UBL', 'RDF'])[0]
    expect(a.id).toBe(b.id)
  })

  it('sorts groups by buffer-order rank of corner X', () => {
    const cases = partition(
      { 'UFL DFL FUR': dufCase, 'DBR DBL RUF': backCase },
      DEFAULT_ORDER,
    )
    // UFL group (rank 1) before the unranked DBR fallback group
    expect(cases.map((c) => c.path[0])).toEqual(['UFL', 'DBR'])
  })
})
