import { describe, it, expect } from 'vitest'
import { casesMatchingPattern, caseSearchString } from './selection'
import { ltct } from './ltct'
import type { AlgCase } from './types'

const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}
const toLetter = (s: string): string => SPEFFZ[s] ?? s

// A few hand-built LTCT cases: path = [group, subgroupSticker, caseSticker].
// Search string is group + subgroupLetter + caseLetter, e.g. "UUAE".
const mk = (group: string, sub: string, cs: string): AlgCase => ({
  id: `${group} ${sub} ${cs}`, path: [group, sub, cs], algs: [], scrambles: [],
})
const cases: AlgCase[] = [
  mk('UU', 'UBL', 'LUB'), // UU A E
  mk('UU', 'UBR', 'LUB'), // UU B E
  mk('UU', 'UFL', 'LUB'), // UU D E
  mk('UU', 'UBL', 'FUL'), // UU A I
  mk('UD', 'UBL', 'LUB'), // UD A E
  mk('DD', 'UFR', 'LUB'), // DD C E
]
const match = (pattern: string): string[] =>
  casesMatchingPattern(cases, ltct.levels, toLetter, pattern).sort()

describe('wildcard case selection', () => {
  it('builds the search string from the displayed letters', () => {
    expect(caseSearchString(cases[0], ltct.levels, toLetter)).toBe('UUAE')
  })

  it('"UU*E": UU group, any subgroup, case letter E', () => {
    expect(match('UU*E')).toEqual(['UU UBL LUB', 'UU UBR LUB', 'UU UFL LUB'])
  })

  it('"**E": any group / subgroup, case letter E', () => {
    expect(match('**E')).toEqual(['DD UFR LUB', 'UD UBL LUB', 'UU UBL LUB', 'UU UBR LUB', 'UU UFL LUB'])
  })

  it('is case-insensitive and ignores spaces', () => {
    expect(match('uu * e')).toEqual(['UU UBL LUB', 'UU UBR LUB', 'UU UFL LUB'])
  })

  it('matches a fully-specified case (no wildcard) exactly', () => {
    expect(match('UUAI')).toEqual(['UU UBL FUL'])
  })

  it('returns nothing for an empty pattern or no match', () => {
    expect(match('')).toEqual([])
    expect(match('ZZ*')).toEqual([])
  })
})
