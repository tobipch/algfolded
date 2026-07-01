import { describe, it, expect } from 'vitest'
import { partition, threeTwists, DEFAULT_BUFFER_ORDER, type RawTwist } from './three_twists'

const mk = (dir: 'cw' | 'ccw', corners: string[]): RawTwist => ({
  id: `${dir} ${[...corners].sort().join('-')}`,
  corners,
  dir,
  algs: ['x'],
  scrambles: ['y'],
})

// Default Speffz letter scheme, so the test reads displayed letters the way the
// app does (paths store stickers; toLetter renders them).
const SPEFFZ: Record<string, string> = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}
const toLetter = (s: string): string => SPEFFZ[s] ?? s

// The displayed letters for each path segment, via the algset's level display.
const letters = (c: ReturnType<typeof partition>[number]): string[] =>
  threeTwists.levels.map((lvl, i) => lvl.display(c.path[i], { toLetter }).primary)

describe('three-twists partition', () => {
  it('matches the documented example: cw {UFR,UBL,UBR} -> C/CR/CRN', () => {
    const cases = partition([mk('cw', ['UFR', 'UBL', 'UBR'])], DEFAULT_BUFFER_ORDER)
    expect(letters(cases[0])).toEqual(['C', 'CR', 'CRN'])
  })

  it('encodes direction in the letters: ccw of the same triple -> C/CE/CEQ', () => {
    const cases = partition([mk('ccw', ['UFR', 'UBL', 'UBR'])], DEFAULT_BUFFER_ORDER)
    expect(letters(cases[0])).toEqual(['C', 'CE', 'CEQ'])
  })

  it('translates the case label through the letter scheme', () => {
    const cases = partition([mk('cw', ['UFR', 'UBL', 'UBR'])], DEFAULT_BUFFER_ORDER)
    expect(threeTwists.caseLabel(cases[0], toLetter)).toBe('CRN')
    // a custom scheme remaps the displayed letters
    const custom = (s: string): string => (s === 'RUB' ? 'Z' : toLetter(s))
    expect(threeTwists.caseLabel(cases[0], custom)).toBe('CRZ')
  })

  it('assigns the buffer to the highest-priority corner in the triple', () => {
    // no UFR present -> with default order (UFR,UFL,UBR,UBL,...) buffer = UFL (D)
    const cases = partition([mk('cw', ['UFL', 'UBR', 'UBL'])], DEFAULT_BUFFER_ORDER)
    expect(letters(cases[0])[0]).toBe('D') // UFL
  })

  it('re-partitions when the buffer order changes', () => {
    const twist = mk('cw', ['UFR', 'UFL', 'UBR'])
    const withUFR = partition([twist], DEFAULT_BUFFER_ORDER)[0]
    expect(letters(withUFR)[0]).toBe('C') // UFR is highest priority by default
    // move UFR to the end -> buffer becomes UFL (next in this order)
    const reordered = ['UFL', 'UBR', 'UBL', 'RDF', 'FDL', 'UFR']
    const without = partition([twist], reordered)[0]
    expect(letters(without)[0]).toBe('D') // UFL
  })

  it('handles triples containing a non-buffer corner (DBL/DBR)', () => {
    // DBL is never a buffer; buffer must be UBR here
    const cases = partition([mk('cw', ['DBL', 'UBR', 'UBL'])], DEFAULT_BUFFER_ORDER)
    expect(letters(cases[0])[0]).toBe('B') // UBR
  })

  it('produces a unique case per twist (no duplicates)', () => {
    const twists = [
      mk('cw', ['UFR', 'UBL', 'UBR']),
      mk('cw', ['UFR', 'UBR', 'UBL']), // same set, different order -> same id
    ]
    const cases = partition(twists, DEFAULT_BUFFER_ORDER)
    expect(new Set(cases.map((c) => c.id)).size).toBe(1)
  })
})
