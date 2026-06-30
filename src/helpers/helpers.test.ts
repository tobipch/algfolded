import { describe, it, expect } from 'vitest'
import { parseLtctKey, formatCaseKey, areSetsEqual } from './helpers'

const toLetter = (s: string): string => ({ UFL: 'A', LUB: 'B' } as Record<string, string>)[s] ?? '?'

describe('helpers', () => {
  it('parseLtctKey splits the key and applies the letter scheme', () => {
    const p = parseLtctKey('UU UFL LUB', toLetter)
    expect(p.group).toBe('UU')
    expect(p.target).toBe('UFL')
    expect(p.twist).toBe('LUB')
    expect(p.targetLetter).toBe('A')
    expect(p.twistLetter).toBe('B')
    expect(p.letters).toBe('AB')
  })

  it('formatCaseKey renders the compact label', () => {
    expect(formatCaseKey('UU UFL LUB')).toBe('UU-UFL LUB')
  })

  it('areSetsEqual compares membership regardless of order', () => {
    expect(areSetsEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(areSetsEqual(new Set([1]), new Set([1, 2]))).toBe(false)
  })
})
