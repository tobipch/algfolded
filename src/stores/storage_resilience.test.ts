import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Corrupt localStorage used to take the whole app down: several stores called
// `JSON.parse(localStorage.getItem(…))` directly, some of it at *module* scope,
// so one bad value threw during module evaluation and the user got a blank page
// with no way to recover without devtools. These tests pin that down — every
// store must come up on garbage, on a hostile storage, and on a full quota.
//
// Modules are imported fresh per test (resetModules) because the module-scope
// migrations only run once per module instance.

const CORRUPT = ['{not json', '', '[1,2', 'undefined', '{"a":]'] as const

const freshPinia = () => setActivePinia(createPinia())

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  freshPinia()
})

describe('stores survive corrupt localStorage', () => {
  it('SettingsStore falls back to defaults', async () => {
    for (const bad of CORRUPT) {
      vi.resetModules(); localStorage.clear(); freshPinia()
      localStorage.setItem('ltctTrainerSettings', bad)
      const { useSettingsStore } = await import('@/stores/SettingsStore')
      const s = useSettingsStore()
      expect(s.store.bufferOrder).toEqual(['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL'])
      expect(s.store.smartSelection).toBe(true)
    }
  })

  it('SettingsStore keeps readable settings and fills in new keys', async () => {
    localStorage.setItem('ltctTrainerSettings', JSON.stringify({ smartSelection: false }))
    const { useSettingsStore } = await import('@/stores/SettingsStore')
    const s = useSettingsStore()
    expect(s.store.smartSelection).toBe(false)
    expect(s.store.bufferOrder).toBeDefined() // default merged in
  })

  it('LetterSchemeStore falls back to the default scheme', async () => {
    localStorage.setItem('ltctLetterScheme', '{kaputt')
    localStorage.setItem('ltctEdgeLetterScheme', 'auch kaputt')
    const { useLetterSchemeStore } = await import('@/stores/LetterSchemeStore')
    const ls = useLetterSchemeStore()
    expect(ls.toLetter('UBL')).toBe('A')
    expect(ls.toLetter('UB')).toBe('A')
  })

  it('SessionStore module evaluates with a corrupt legacy stats key', async () => {
    localStorage.setItem('ltct_stats_array', '{abgeschnitten')
    localStorage.setItem('ltct_store', 'ebenfalls kaputt')
    localStorage.setItem('ltct_srs', '[[[')
    await expect(import('@/stores/SessionStore')).resolves.toBeDefined()
  })

  it('SessionStore comes up with an empty run on corrupt data', async () => {
    localStorage.setItem('ltct_store:commCorner', '{kaputt')
    const { useSessionStore } = await import('@/stores/SessionStore')
    const s = useSessionStore()
    expect(s.store.stats).toEqual([])
    expect(s.store.keys).toEqual([])
  })

  it('SelectedStore comes up with an empty selection', async () => {
    localStorage.setItem('currentLtctArray:commCorner', 'nope')
    const { useSelectedStore } = await import('@/stores/SelectedStore')
    expect(useSelectedStore().store.keys).toEqual([])
  })

  it('PresetStore comes up with just the starred preset', async () => {
    localStorage.setItem('ltct_presets_arrays:commCorner', '}{')
    const { usePresetsStore, starredName } = await import('@/stores/PresetStore')
    expect(Object.keys(usePresetsStore().map)).toEqual([starredName])
  })

  it('CustomAlgsStore and PreferredAlgStore come up empty', async () => {
    localStorage.setItem('algfoldedCustomAlgs:commCorner', 'x')
    localStorage.setItem('algfoldedPreferredAlgs:commCorner', 'y')
    const { useCustomAlgsStore } = await import('@/stores/CustomAlgsStore')
    const { usePreferredAlgStore } = await import('@/stores/PreferredAlgStore')
    expect(useCustomAlgsStore().store).toEqual({})
    expect(usePreferredAlgStore().store).toEqual({})
  })

  it('SolveSyncStore comes up with an empty queue', async () => {
    localStorage.setItem('algfolded_solve_queue', '{"nicht":"ein array"}')
    const { useSolveSyncStore } = await import('@/stores/SolveSyncStore')
    expect(useSolveSyncStore().queue).toEqual([])
  })
})

describe('stores survive a storage that refuses to cooperate', () => {
  it('reading throws (blocked storage) -> stores still start', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { useSettingsStore } = await import('@/stores/SettingsStore')
    const { useSelectedStore } = await import('@/stores/SelectedStore')
    expect(useSettingsStore().store.smartSelection).toBe(true)
    expect(useSelectedStore().store.keys).toEqual([])
  })

  it('writing throws (quota full) -> the app keeps working, just unsaved', async () => {
    const { nextTick } = await import('vue')
    const { useSettingsStore } = await import('@/stores/SettingsStore')
    const { useSelectedStore } = await import('@/stores/SelectedStore')
    const settings = useSettingsStore()
    const selected = useSelectedStore()

    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => errors.push(e.error)
    window.addEventListener('error', onError)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    settings.store.smartSelection = false
    selected.store.keys = ['UFR UBL LUF']
    await nextTick()
    await nextTick()

    // the change is live in memory even though it could not be persisted
    expect(settings.store.smartSelection).toBe(false)
    expect(selected.store.keys).toEqual(['UFR UBL LUF'])
    expect(errors).toEqual([])
    window.removeEventListener('error', onError)
  })
})
