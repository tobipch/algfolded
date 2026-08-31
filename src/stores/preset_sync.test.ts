import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Presets belong to the account: while logged in they are mirrored to the
// backend, so the same presets show up after signing in on another device.

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  // The raw target of the reactive auth object below — set it before the store
  // is created, and flip it through `mocks.auth` once the store is watching.
  state: { loggedIn: true },
  auth: null as { loggedIn: boolean } | null,
  algsetState: { activeId: 'testset' },
  algset: null as { activeId: string } | null,
}))

vi.mock('@/stores/AlgsetStore', async () => {
  const { reactive } = await import('vue')
  mocks.algset = reactive(mocks.algsetState)
  return { useAlgsetStore: () => mocks.algset }
})
vi.mock('@/stores/AuthStore', async () => {
  const { reactive } = await import('vue')
  mocks.auth = reactive(mocks.state) // same target -> Vue hands back one shared proxy
  return { useAuthStore: () => mocks.auth }
})
vi.mock('@/helpers/api', () => ({ apiFetch: mocks.apiFetch }))

const storageKey = 'ltct_presets_arrays:testset'
const load = async () => (await import('@/stores/PresetStore')).usePresetsStore()
const flush = () => new Promise((r) => setTimeout(r, 0))

// Server presets for the GET, `{ok: true}` for the PUT/DELETE writes.
const serve = (presets: Record<string, string[]>) =>
  mocks.apiFetch.mockImplementation(async (path: string) =>
    path.startsWith('/api/presets?') ? { presets } : { ok: true })

const callsTo = (method: string) =>
  mocks.apiFetch.mock.calls.filter(([, opts]) => opts?.method === method).map(([, opts]) => opts.body)

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  setActivePinia(createPinia())
  mocks.apiFetch.mockReset()
  mocks.state.loggedIn = true
  mocks.algsetState.activeId = 'testset'
})

describe('presets sync with the account', () => {
  it('loads the account presets and lets them win over same-named local ones', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ '⭐': ['a-ab'], lokal: ['a-ac'] }))
    serve({ '⭐': ['b-cd'], konto: ['a-ba'] })

    const store = await load()
    await flush()

    expect([...store.getCases('⭐')]).toEqual(['b-cd'])  // account copy replaced the local one
    expect([...store.getCases('konto')]).toEqual(['a-ba']) // preset from another device
    expect([...store.getCases('lokal')]).toEqual(['a-ac']) // local-only preset survives
  })

  it('uploads local presets the account does not know yet', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ '⭐': [], lokal: ['a-ac'] }))
    serve({ konto: ['a-ba'] })

    await load()
    await flush()

    // the empty default starred preset is not worth a row
    expect(callsTo('PUT')).toEqual([{ algset: 'testset', name: 'lokal', cases: ['a-ac'] }])
  })

  it('saves, edits and deletes a preset on the server', async () => {
    serve({})
    const store = await load()
    await flush()

    store.setPreset('lernen', ['a-ab', 'a-ac'])
    store.addToPreset('lernen', 'b-cd')
    store.removeFromPreset('lernen', 'a-ab')
    expect(callsTo('PUT')).toEqual([
      { algset: 'testset', name: 'lernen', cases: ['a-ab', 'a-ac'] },
      { algset: 'testset', name: 'lernen', cases: ['a-ab', 'a-ac', 'b-cd'] },
      { algset: 'testset', name: 'lernen', cases: ['a-ac', 'b-cd'] },
    ])

    store.deletePreset('lernen')
    expect(callsTo('DELETE')).toEqual([{ algset: 'testset', name: 'lernen' }])
  })

  it('pulls the account presets right after signing in', async () => {
    mocks.state.loggedIn = false
    localStorage.setItem(storageKey, JSON.stringify({ '⭐': ['a-ab'] }))
    serve({ konto: ['a-ba'] })

    const store = await load()
    await flush()
    expect(mocks.apiFetch).not.toHaveBeenCalled() // logged out -> purely local

    mocks.auth!.loggedIn = true
    await flush()
    expect([...store.getCases('konto')]).toEqual(['a-ba'])
  })

  it('keeps the local presets when the API is unreachable', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ lokal: ['a-ac'] }))
    mocks.apiFetch.mockRejectedValue(new Error('offline'))

    const store = await load()
    await flush()

    expect([...store.getCases('lokal')]).toEqual(['a-ac'])
  })

  it('ignores an account response that arrives after the algset was switched', async () => {
    // a slow GET for the set the user just left must not overwrite the new one
    let answerFirstGet: (v: unknown) => void = () => {}
    let gets = 0
    mocks.apiFetch.mockImplementation((path: string) => {
      if (!path.startsWith('/api/presets?')) return Promise.resolve({ ok: true })
      return ++gets === 1
        ? new Promise((resolve) => { answerFirstGet = resolve })
        : Promise.resolve({ presets: { anderesSet: ['b-cd'] } })
    })

    const store = await load()
    mocks.algset!.activeId = 'anderes'
    await flush()
    answerFirstGet({ presets: { konto: ['a-ba'] } })
    await flush()

    expect(store.map).not.toHaveProperty('konto')       // stale answer dropped
    expect([...store.getCases('anderesSet')]).toEqual(['b-cd'])
  })
})
