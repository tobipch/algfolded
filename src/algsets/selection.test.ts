import { describe, it, expect } from 'vitest'
import { casesUnder, inverseCaseIds } from './selection'
import type { AlgCase } from './types'

const mk = (id: string): AlgCase => ({ id, path: id.split(' '), algs: [], scrambles: [] })

describe('casesUnder', () => {
  const cases = [mk('UU UBL A'), mk('UU UBL B'), mk('UU UFL C'), mk('UD UBL D')]

  it('filters by group prefix', () => {
    expect(casesUnder(cases, ['UU'])).toEqual(['UU UBL A', 'UU UBL B', 'UU UFL C'])
  })

  it('filters by group + subgroup prefix', () => {
    expect(casesUnder(cases, ['UU', 'UBL'])).toEqual(['UU UBL A', 'UU UBL B'])
  })

  it('an empty prefix matches every case', () => {
    expect(casesUnder(cases, [])).toHaveLength(4)
  })
})

describe('inverseCaseIds', () => {
  // Toy inverse: swap the last two path segments (commutators swap targets).
  const swap = (p: string[]): string[] => [p[0], p[2], p[1]]
  const cases = [mk('UFL A B'), mk('UFL B A'), mk('UFL C D'), mk('UFR A B')]

  it('maps each id to the id of its inverse case', () => {
    expect(inverseCaseIds(cases, ['UFL A B'], swap)).toEqual(['UFL B A'])
  })

  it('handles several ids and skips inverses missing from the data', () => {
    // 'UFL C D' has no 'UFL D C' counterpart; 'UFR A B' has no 'UFR B A'.
    expect(inverseCaseIds(cases, ['UFL A B', 'UFL B A', 'UFL C D', 'UFR A B'], swap))
      .toEqual(['UFL B A', 'UFL A B'])
  })

  it('ignores unknown ids', () => {
    expect(inverseCaseIds(cases, ['nope'], swap)).toEqual([])
  })
})
