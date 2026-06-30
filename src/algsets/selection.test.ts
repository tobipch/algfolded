import { describe, it, expect } from 'vitest'
import { casesUnder } from './selection'
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
