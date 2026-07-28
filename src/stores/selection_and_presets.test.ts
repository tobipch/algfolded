import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { AlgCase } from '@/algsets/types'

// Selection, presets and the "which alg is mine" choice. All three persist per
// algset, and all three used to share one storage key with every other set.

const CASES: AlgCase[] = [
  { id: 'a-ab', path: ['UFR', 'A', 'A·B'], algs: ["R U R'"], scrambles: ['s'] },
  { id: 'a-ba', path: ['UFR', 'B', 'B·A'], algs: ["R U' R'"], scrambles: ['s'] },
  { id: 'a-ac', path: ['UFR', 'A', 'A·C'], algs: ["L U L'"], scrambles: ['s'] },
  { id: 'b-cd', path: ['UFL', 'C', 'C·D'], algs: ["F U F'"], scrambles: ['s'] },
]

vi.mock('@/stores/AlgsetStore', () => ({
  useAlgsetStore: () => ({
    activeId: 'testset',
    cases: CASES,
    byId: Object.fromEntries(CASES.map((c) => [c.id, c])),
    caseLabel: (id: string) => id,
    active: {
      levels: [
        { id: 'buffer', display: (v: string) => ({ primary: v }) },
        { id: 'first', display: (v: string) => ({ primary: v }) },
        { id: 'case', display: (v: string) => ({ primary: v.split('·').join('') }) },
      ],
      inversePath: ([b, , pair]: string[]) => {
        const [t1, t2] = pair.split('·')
        return [b, t2, `${t2}·${t1}`]
      },
    },
  }),
}))
vi.mock('@/stores/LetterSchemeStore', () => ({
  useLetterSchemeStore: () => ({ toLetter: (s: string) => s }),
}))
vi.mock('@/stores/AuthStore', () => ({
  useAuthStore: () => ({ loggedIn: false }),
}))
vi.mock('@/helpers/api', () => ({ apiFetch: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('SelectedStore', () => {
  const load = async () => (await import('@/stores/SelectedStore')).useSelectedStore()

  it('selects and deselects individual cases', async () => {
    const s = await load()
    s.addCase('a-ab')
    expect(s.isCaseSelected('a-ab')).toBe(true)
    expect(s.totalCasesSelected()).toBe(1)
    s.removeCase('a-ab')
    expect(s.isCaseSelected('a-ab')).toBe(false)
  })

  it('selects a whole hierarchy node by path prefix', async () => {
    const s = await load()
    s.addNode(['UFR'])
    expect(s.totalCasesSelected()).toBe(3)
    s.removeNode(['UFR', 'A'])
    expect(s.store.keys.sort()).toEqual(['a-ba'])
  })

  it('select all / none / invert', async () => {
    const s = await load()
    s.selectAll()
    expect(s.totalCasesSelected()).toBe(4)
    s.deselectAll()
    expect(s.totalCasesSelected()).toBe(0)
    s.addCase('a-ab')
    s.invertSelection()
    expect(s.store.keys.sort()).toEqual(['a-ac', 'a-ba', 'b-cd'])
  })

  it('adds the inverse of every selected case', async () => {
    const s = await load()
    s.addCase('a-ab')
    expect(s.canAddInverses()).toBe(true)
    s.addInverses()
    expect(s.store.keys.sort()).toEqual(['a-ab', 'a-ba'])
  })

  it('selects by search pattern, wildcards included', async () => {
    const s = await load()
    // matched against the concatenated level labels ("UFR"+"A"+"AB"), whole
    // string, so patterns need wildcards to match a part of it
    expect(s.countMatching('UFRAAB')).toBe(1)
    expect(s.countMatching('*AB')).toBe(1)
    expect(s.countMatching('UFR*')).toBe(3)
    expect(s.selectByPattern('UFRA*')).toBe(2) // UFR + level "A" -> a-ab, a-ac
    expect(s.store.keys.sort()).toEqual(['a-ab', 'a-ac'])
    s.deselectAll()
    // several space-separated patterns are unioned
    expect(s.selectByPattern('*CD *BA')).toBe(2)
    expect(s.store.keys.sort()).toEqual(['a-ba', 'b-cd'])
  })

  it('persists under its own algset key and reloads', async () => {
    const s = await load()
    s.addCase('a-ab')
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('currentLtctArray:testset')).not.toBeNull()
    expect(localStorage.getItem('currentLtctArray')).toBeNull()

    vi.resetModules(); setActivePinia(createPinia())
    expect((await load()).store.keys).toEqual(['a-ab'])
  })
})

describe('PresetStore', () => {
  const load = async () => {
    const m = await import('@/stores/PresetStore')
    return { store: m.usePresetsStore(), starredName: m.starredName }
  }

  it('starts with an empty starred preset', async () => {
    const { store, starredName } = await load()
    expect([...store.getCases(starredName)]).toEqual([])
  })

  it('saves, reads and deletes a preset', async () => {
    const { store } = await load()
    store.setPreset('lernen', ['a-ab', 'a-ac'])
    expect([...store.getCases('lernen')].sort()).toEqual(['a-ab', 'a-ac'])
    store.deletePreset('lernen')
    expect([...store.getCases('lernen')]).toEqual([])
  })

  it('toggles a single case in and out of a preset', async () => {
    const { store, starredName } = await load()
    store.toggleAddRemove(starredName, 'a-ab')
    expect(store.hasCase(starredName, 'a-ab')).toBe(true)
    store.toggleAddRemove(starredName, 'a-ab')
    expect(store.hasCase(starredName, 'a-ab')).toBe(false)
  })

  it('persists under its own algset key and reloads', async () => {
    const { store } = await load()
    store.setPreset('lernen', ['a-ab'])
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ltct_presets_arrays:testset')).not.toBeNull()
    expect(localStorage.getItem('ltct_presets_arrays')).toBeNull()

    vi.resetModules(); setActivePinia(createPinia())
    const again = await load()
    expect([...again.store.getCases('lernen')]).toEqual(['a-ab'])
  })
})

describe('PreferredAlgStore', () => {
  const load = async () => (await import('@/stores/PreferredAlgStore')).usePreferredAlgStore()

  it('has no preference until one is set', async () => {
    const p = await load()
    expect(p.preferredAlg('a-ab')).toBe(null)
  })

  it('remembers a choice and clears it again', async () => {
    const p = await load()
    p.setPreferred('a-ab', "R U R'")
    expect(p.preferredAlg('a-ab')).toBe("R U R'")
    p.setPreferred('a-ab', null)
    expect(p.preferredAlg('a-ab')).toBe(null)
  })

  it('falls back to the first alg when nothing is chosen', async () => {
    const p = await load()
    expect(p.resolvePreferred('a-ab', ["R U R'", "L U L'"])).toBe("R U R'")
  })

  it('re-anchors a stored choice onto the equivalent listed spelling', async () => {
    const p = await load()
    // stored as plain moves; the list now carries the same alg as a commutator
    p.setPreferred('a-ab', "R U R' U'")
    expect(p.resolvePreferred('a-ab', ['[R, U]', "L U L'"])).toBe('[R, U]')
  })

  it('persists under its own algset key', async () => {
    const p = await load()
    p.setPreferred('a-ab', "R U R'")
    expect(localStorage.getItem('algfoldedPreferredAlgs:testset')).not.toBeNull()
    expect(localStorage.getItem('algfoldedPreferredAlgs')).toBeNull()
  })

  it('migrates an old combined key into the per-algset one', async () => {
    localStorage.setItem('algfoldedPreferredAlgs',
      JSON.stringify({ testset: { 'a-ab': "R U R'" }, anderes: { 'x': 'y' } }))
    const p = await load()
    expect(p.preferredAlg('a-ab')).toBe("R U R'")
    expect(localStorage.getItem('algfoldedPreferredAlgs')).toBeNull()
    expect(JSON.parse(localStorage.getItem('algfoldedPreferredAlgs:anderes')!)).toEqual({ x: 'y' })
  })
})
