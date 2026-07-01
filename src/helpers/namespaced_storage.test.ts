import { describe, it, expect, beforeEach } from 'vitest'
import {
  readNamespaced, writeNamespaced, migrateToNamespaced,
  isFlatArray, isFlatStringMap, isFlatArrayMap,
  isFlatSession, isFlatSrs, isFlatNumber,
} from './namespaced_storage'

// in-memory localStorage for the node test env
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string): void { this.m.set(k, String(v)) }
  removeItem(k: string): void { this.m.delete(k) }
  clear(): void { this.m.clear() }
}

beforeEach(() => {
  ;(globalThis as any).localStorage = new MemStorage()
})

describe('namespaced storage', () => {
  it('writes and reads a per-algset slot, preserving other slots', () => {
    writeNamespaced('sel', 'ltct', ['a', 'b'])
    writeNamespaced('sel', 'comms', ['x'])
    expect(readNamespaced('sel', 'ltct', [])).toEqual(['a', 'b'])
    expect(readNamespaced('sel', 'comms', [])).toEqual(['x'])
  })

  it('returns the fallback for a missing slot', () => {
    expect(readNamespaced('sel', 'ltct', ['fallback'])).toEqual(['fallback'])
  })

  it('migrates a legacy flat array into the namespace', () => {
    localStorage.setItem('sel', JSON.stringify(['a', 'b']))
    migrateToNamespaced('sel', 'ltct', isFlatArray)
    expect(JSON.parse(localStorage.getItem('sel')!)).toEqual({ ltct: ['a', 'b'] })
  })

  it('does not double-wrap already-namespaced data', () => {
    localStorage.setItem('sel', JSON.stringify({ ltct: ['a'] }))
    migrateToNamespaced('sel', 'ltct', isFlatArray)
    expect(JSON.parse(localStorage.getItem('sel')!)).toEqual({ ltct: ['a'] })
  })

  it('migrates a legacy flat notes map', () => {
    localStorage.setItem('notes', JSON.stringify({ 'UU UFL LUB': 'hi' }))
    migrateToNamespaced('notes', 'ltct', isFlatStringMap)
    expect(JSON.parse(localStorage.getItem('notes')!)).toEqual({ ltct: { 'UU UFL LUB': 'hi' } })
  })

  it('migrates a legacy flat presets map', () => {
    localStorage.setItem('presets', JSON.stringify({ '⭐': ['UU UFL LUB'] }))
    migrateToNamespaced('presets', 'ltct', isFlatArrayMap)
    expect(JSON.parse(localStorage.getItem('presets')!)).toEqual({ ltct: { '⭐': ['UU UFL LUB'] } })
  })

  it('predicates distinguish old vs namespaced shapes', () => {
    expect(isFlatArray(['a'])).toBe(true)
    expect(isFlatArray({ ltct: ['a'] })).toBe(false)
    expect(isFlatStringMap({ 'UU UFL LUB': 'x' })).toBe(true)
    expect(isFlatStringMap({ ltct: { x: 'y' } })).toBe(false)
    expect(isFlatArrayMap({ '⭐': [] })).toBe(true)
    expect(isFlatArrayMap({ ltct: { '⭐': [] } })).toBe(false)
  })

  it('session/srs/counter predicates distinguish old vs namespaced shapes', () => {
    // session: flat run carries a `keys` array; namespaced is keyed by algsetId
    expect(isFlatSession({ keys: ['a'], stats: [] })).toBe(true)
    expect(isFlatSession({ ltct: { keys: ['a'], stats: [] } })).toBe(false)
    // srs: flat values carry a/n/s; namespaced wraps a level deeper
    expect(isFlatSrs({ 'UU UFL LUB': { a: 1.2, n: 3, s: 5 } })).toBe(true)
    expect(isFlatSrs({ ltct: { 'UU UFL LUB': { a: 1.2, n: 3, s: 5 } } })).toBe(false)
    expect(isFlatSrs({})).toBe(false)
    // counter: flat is a bare number; namespaced is an object
    expect(isFlatNumber(7)).toBe(true)
    expect(isFlatNumber({ ltct: 7 })).toBe(false)
  })

  it('migrates legacy session, srs and counter into the namespace', () => {
    localStorage.setItem('store', JSON.stringify({ keys: ['a'], stats: [], upcoming: [] }))
    migrateToNamespaced('store', 'ltct', isFlatSession)
    expect(JSON.parse(localStorage.getItem('store')!)).toEqual({ ltct: { keys: ['a'], stats: [], upcoming: [] } })

    localStorage.setItem('srs', JSON.stringify({ 'UU UFL LUB': { a: 1, n: 2, s: 3 } }))
    migrateToNamespaced('srs', 'ltct', isFlatSrs)
    expect(JSON.parse(localStorage.getItem('srs')!)).toEqual({ ltct: { 'UU UFL LUB': { a: 1, n: 2, s: 3 } } })

    localStorage.setItem('cnt', JSON.stringify(42))
    migrateToNamespaced('cnt', 'ltct', isFlatNumber)
    expect(JSON.parse(localStorage.getItem('cnt')!)).toEqual({ ltct: 42 })
  })
})
