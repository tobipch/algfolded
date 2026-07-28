import { describe, it, expect, vi } from 'vitest'
import {
  readNamespaced, writeNamespaced, splitCombinedKey, migrateToNamespaced,
  readJson, writeJson, setItemSafe,
  isFlatArray, isFlatStringMap, isFlatArrayMap,
  isFlatSession, isFlatSrs, isFlatNumber,
} from './namespaced_storage'

// jsdom supplies localStorage; the shared setup clears it before each test.
const raw = (k: string) => localStorage.getItem(k)
const json = (k: string) => JSON.parse(localStorage.getItem(k)!)

describe('per-algset slots', () => {
  it('writes and reads a slot under its own key', () => {
    writeNamespaced('sel', 'ltct', ['a', 'b'])
    expect(readNamespaced('sel', 'ltct', [])).toEqual(['a', 'b'])
    expect(raw('sel:ltct')).toBe('["a","b"]')
  })

  it('keeps algsets in separate keys, so a write never touches another set', () => {
    writeNamespaced('sel', 'ltct', ['a'])
    writeNamespaced('sel', 'comms', ['x'])

    const before = raw('sel:comms')
    writeNamespaced('sel', 'ltct', ['a', 'b', 'c'])

    expect(raw('sel:comms')).toBe(before) // untouched
    expect(readNamespaced('sel', 'ltct', [])).toEqual(['a', 'b', 'c'])
    expect(readNamespaced('sel', 'comms', [])).toEqual(['x'])
    // no combined key is created any more
    expect(raw('sel')).toBe(null)
  })

  it('returns the fallback for a missing slot', () => {
    expect(readNamespaced('sel', 'ltct', ['fallback'])).toEqual(['fallback'])
  })

  it('returns the fallback for a corrupt slot instead of throwing', () => {
    localStorage.setItem('sel:ltct', '{not json')
    expect(() => readNamespaced('sel', 'ltct', ['fallback'])).not.toThrow()
    expect(readNamespaced('sel', 'ltct', ['fallback'])).toEqual(['fallback'])
  })

  it('round-trips falsy values without confusing them for "missing"', () => {
    writeNamespaced('cnt', 'ltct', 0)
    expect(readNamespaced('cnt', 'ltct', 99)).toBe(0)
    writeNamespaced('flag', 'ltct', false)
    expect(readNamespaced('flag', 'ltct', true)).toBe(false)
  })
})

describe('splitCombinedKey (combined key -> one key per algset)', () => {
  it('moves every slot to its own key and drops the combined one', () => {
    localStorage.setItem('store', JSON.stringify({
      ltct: { stats: [1] }, commEdge: { stats: [2] }, t2c: { stats: [3] },
    }))
    splitCombinedKey('store')

    expect(json('store:ltct')).toEqual({ stats: [1] })
    expect(json('store:commEdge')).toEqual({ stats: [2] })
    expect(json('store:t2c')).toEqual({ stats: [3] })
    expect(raw('store')).toBe(null)
  })

  it('never overwrites a per-algset key that already holds newer data', () => {
    localStorage.setItem('store:ltct', JSON.stringify({ stats: ['neu'] }))
    localStorage.setItem('store', JSON.stringify({ ltct: { stats: ['alt'] } }))
    splitCombinedKey('store')
    expect(json('store:ltct')).toEqual({ stats: ['neu'] })
  })

  it('is a no-op when there is nothing to migrate', () => {
    expect(() => splitCombinedKey('nichts')).not.toThrow()
    expect(raw('nichts')).toBe(null)
  })

  it('leaves a corrupt combined key alone rather than destroying it', () => {
    localStorage.setItem('store', 'kaputt{')
    expect(() => splitCombinedKey('store')).not.toThrow()
    expect(raw('store')).toBe('kaputt{')
  })

  it('runs again next start when a write failed mid-migration', () => {
    localStorage.setItem('store', JSON.stringify({ a: 1, b: 2 }))
    const real = Storage.prototype.setItem
    // first slot lands, second is rejected (quota)
    let calls = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (++calls === 2) throw new DOMException('quota', 'QuotaExceededError')
      return real.call(this, k, v)
    })

    splitCombinedKey('store')
    expect(raw('store')).not.toBe(null) // kept, so nothing is lost

    vi.restoreAllMocks()
    splitCombinedKey('store')
    expect(json('store:a')).toBe(1)
    expect(json('store:b')).toBe(2)
    expect(raw('store')).toBe(null)
  })

  it('is idempotent', () => {
    localStorage.setItem('store', JSON.stringify({ ltct: { stats: [1] } }))
    splitCombinedKey('store')
    splitCombinedKey('store')
    expect(json('store:ltct')).toEqual({ stats: [1] })
  })
})

describe('migrateToNamespaced (legacy flat -> per-algset key)', () => {
  it('migrates a legacy flat array', () => {
    localStorage.setItem('sel', JSON.stringify(['a', 'b']))
    migrateToNamespaced('sel', 'ltct', isFlatArray)
    expect(json('sel:ltct')).toEqual(['a', 'b'])
    expect(raw('sel')).toBe(null)
  })

  it('migrates a legacy flat notes map', () => {
    localStorage.setItem('notes', JSON.stringify({ 'UU UFL LUB': 'hi' }))
    migrateToNamespaced('notes', 'ltct', isFlatStringMap)
    expect(json('notes:ltct')).toEqual({ 'UU UFL LUB': 'hi' })
  })

  it('migrates a legacy flat presets map', () => {
    localStorage.setItem('presets', JSON.stringify({ '⭐': ['UU UFL LUB'] }))
    migrateToNamespaced('presets', 'ltct', isFlatArrayMap)
    expect(json('presets:ltct')).toEqual({ '⭐': ['UU UFL LUB'] })
  })

  it('migrates legacy session, srs and counter', () => {
    localStorage.setItem('store', JSON.stringify({ keys: ['a'], stats: [], upcoming: [] }))
    migrateToNamespaced('store', 'ltct', isFlatSession)
    expect(json('store:ltct')).toEqual({ keys: ['a'], stats: [], upcoming: [] })

    localStorage.setItem('srs', JSON.stringify({ 'UU UFL LUB': { a: 1, n: 2, s: 3 } }))
    migrateToNamespaced('srs', 'ltct', isFlatSrs)
    expect(json('srs:ltct')).toEqual({ 'UU UFL LUB': { a: 1, n: 2, s: 3 } })

    localStorage.setItem('cnt', JSON.stringify(42))
    migrateToNamespaced('cnt', 'ltct', isFlatNumber)
    expect(json('cnt:ltct')).toBe(42)
  })

  it('splits a combined key it finds instead of wrapping it again', () => {
    localStorage.setItem('sel', JSON.stringify({ ltct: ['a'], t2c: ['b'] }))
    migrateToNamespaced('sel', 'ltct', isFlatArray)
    expect(json('sel:ltct')).toEqual(['a'])
    expect(json('sel:t2c')).toEqual(['b'])
    expect(raw('sel')).toBe(null)
  })

  it('is a no-op on an already-migrated install', () => {
    writeNamespaced('sel', 'ltct', ['a'])
    migrateToNamespaced('sel', 'ltct', isFlatArray)
    expect(json('sel:ltct')).toEqual(['a'])
  })
})

describe('readJson / writeJson (plain keys)', () => {
  it('round-trips a value', () => {
    writeJson('settings', { a: 1 })
    expect(readJson('settings', {})).toEqual({ a: 1 })
  })

  it('falls back on missing, corrupt and null values instead of throwing', () => {
    expect(readJson('fehlt', { d: 1 })).toEqual({ d: 1 })
    localStorage.setItem('kaputt', '{{{')
    expect(readJson('kaputt', { d: 1 })).toEqual({ d: 1 })
    localStorage.setItem('leer', 'null')
    expect(readJson('leer', { d: 1 })).toEqual({ d: 1 })
  })

  it('reports failure instead of throwing when the quota is exhausted', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(writeJson('x', { a: 1 })).toBe(false)
    expect(writeNamespaced('sel', 'ltct', ['a'])).toBe(false)
    expect(setItemSafe('y', 'z')).toBe(false)
  })
})

describe('flat-shape predicates', () => {
  it('distinguish old vs namespaced shapes', () => {
    expect(isFlatArray(['a'])).toBe(true)
    expect(isFlatArray({ ltct: ['a'] })).toBe(false)
    expect(isFlatStringMap({ 'UU UFL LUB': 'x' })).toBe(true)
    expect(isFlatStringMap({ ltct: { x: 'y' } })).toBe(false)
    expect(isFlatArrayMap({ '⭐': [] })).toBe(true)
    expect(isFlatArrayMap({ ltct: { '⭐': [] } })).toBe(false)
  })

  it('session/srs/counter predicates distinguish old vs namespaced shapes', () => {
    expect(isFlatSession({ keys: ['a'], stats: [] })).toBe(true)
    expect(isFlatSession({ ltct: { keys: ['a'], stats: [] } })).toBe(false)
    expect(isFlatSrs({ 'UU UFL LUB': { a: 1.2, n: 3, s: 5 } })).toBe(true)
    expect(isFlatSrs({ ltct: { 'UU UFL LUB': { a: 1.2, n: 3, s: 5 } } })).toBe(false)
    expect(isFlatSrs({})).toBe(false)
    expect(isFlatNumber(7)).toBe(true)
    expect(isFlatNumber({ ltct: 7 })).toBe(false)
  })
})
