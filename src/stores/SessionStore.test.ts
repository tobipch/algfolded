import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { AlgCase } from '@/algsets/types'

// The run: picking cases, timing them, recording stats and SRS, deleting
// results, and persisting all of it. This is where a bug costs a user their
// session history, so it is exercised through the store's public API rather
// than by poking at internals.

const CASES: AlgCase[] = [
  { id: 'c1', path: ['UFR', 'A', 'AB'], algs: ["R U R'"], scrambles: ['S1a', 'S1b'] },
  { id: 'c2', path: ['UFR', 'A', 'AC'], algs: ["R U' R'"], scrambles: ['S2a'] },
  { id: 'c3', path: ['UFR', 'B', 'BD'], algs: ["L U L'"], scrambles: ['S3a'] },
]

vi.mock('@/stores/AlgsetStore', () => ({
  useAlgsetStore: () => ({
    activeId: 'testset',
    cases: CASES,
    byId: Object.fromEntries(CASES.map((c) => [c.id, c])),
    caseLabel: (id: string) => id,
  }),
}))

// The sync store talks to the network; the bluetooth store touches Web
// Bluetooth. Neither is what these tests are about.
const enqueued: { clientId: string }[] = []
const removedFromQueue: string[] = []
vi.mock('@/stores/SolveSyncStore', () => ({
  useSolveSyncStore: () => ({
    enqueue: (s: { clientId: string }) => { enqueued.push(s) },
    remove: (id: string) => { removedFromQueue.push(id) },
  }),
}))
vi.mock('@/stores/BluetoothCubeStore', () => ({
  useBluetoothCubeStore: () => ({ connected: false, lastSolveMoves: null }),
}))
vi.mock('@/stores/DisplayStore', () => ({
  useDisplayStore: () => ({ showToast: vi.fn() }),
}))

// The store is plain JS, so its persisted shapes are inferred from empty
// defaults. These describe what the run actually holds.
interface Stat { i: number; key: string; scramble: string; ms: number; clientId: string }
interface SrsEntry { a: number; n: number; s: number }

const load = async () => {
  const { useSessionStore } = await import('@/stores/SessionStore')
  return useSessionStore()
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  enqueued.length = 0
  removedFromQueue.length = 0
  setActivePinia(createPinia())
})

describe('selecting cases', () => {
  it('starts a run and picks a case with a scramble', async () => {
    const s = await load()
    s.setSelectedKeys(['c1', 'c2'])
    expect(s.store.keys).toEqual(['c1', 'c2'])
    expect(['c1', 'c2']).toContain(s.store.currentKey)
    expect(s.currentScramble).toBeTruthy()
  })

  it('only ever picks from the selected cases', async () => {
    const s = await load()
    s.setSelectedKeys(['c3'])
    for (let i = 0; i < 20; i++) {
      expect(s.store.currentKey).toBe('c3')
      s.startTimer()
      s.stopTimer()
    }
  })

  it('clears the run back to empty', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    expect(s.store.stats.length).toBe(1)
    s.clearSession()
    expect(s.store.stats).toEqual([])
  })
})

describe('recording a solve', () => {
  it('appends a stat with the case, scramble and a time', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    const key = s.store.currentKey
    const scramble = s.currentScramble
    s.startTimer()
    s.stopTimer()

    expect(s.store.stats).toHaveLength(1)
    const stat = (s.store.stats as unknown as Stat[])[0]
    expect(stat.key).toBe(key)
    expect(stat.scramble).toBe(scramble)
    expect(typeof stat.ms).toBe('number')
    expect(stat.ms).toBeGreaterThanOrEqual(0)
    expect(stat.clientId).toBeTruthy()
  })

  it('queues the solve for the account database exactly once', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({ algset: 'testset', source: 'timer' })
  })

  it('counts how often each case came up', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    s.startTimer(); s.stopTimer()
    expect((s.store.keysCount as Record<string, number>).c1).toBe(2)
  })

  it('moves on to the next case after stopping', async () => {
    const s = await load()
    s.setSelectedKeys(['c1', 'c2', 'c3'])
    s.startTimer(); s.stopTimer()
    expect(s.store.currentKey).not.toBeNull()
    expect(s.currentScramble).toBeTruthy()
  })
})

describe('deleting a result', () => {
  it('removes it and renumbers the ones after it', async () => {
    const s = await load()
    s.setSelectedKeys(['c1', 'c2'])
    for (let i = 0; i < 3; i++) { s.startTimer(); s.stopTimer() }
    expect(s.store.stats.map((x: { i: number }) => x.i)).toEqual([0, 1, 2])

    const deleted = (s.store.stats as unknown as Stat[])[1].clientId
    s.deleteResult(1)

    expect(s.store.stats).toHaveLength(2)
    expect(s.store.stats.map((x: { i: number }) => x.i)).toEqual([0, 1])
    // and it is withdrawn from the pending server sync, not just the UI
    expect(removedFromQueue).toContain(deleted)
  })
})

describe('SRS bookkeeping', () => {
  it('records an average, a count and a recency stamp per case', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()

    const entry = (s.srsData as Record<string, SrsEntry>).c1
    expect(entry).toBeDefined()
    expect(entry.n).toBe(1)
    expect(typeof entry.a).toBe('number')
    expect(entry.s).toBeGreaterThan(0)
  })

  it('counts repeats and moves the recency stamp forward', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    const srs = s.srsData as Record<string, SrsEntry>
    const first = { ...srs.c1 }
    s.startTimer(); s.stopTimer()

    expect(srs.c1.n).toBe(2)
    expect(srs.c1.s).toBeGreaterThan(first.s)
  })

  it('"repeat soon" can be set and cleared, and clears itself once practised', async () => {
    const s = await load()
    s.setSelectedKeys(['c1', 'c2'])
    s.flagDidntKnow('c2')
    expect('c2' in s.didntKnowMap).toBe(true)
    s.unflagDidntKnow('c2')
    expect('c2' in s.didntKnowMap).toBe(false)

    s.flagDidntKnow('c1')
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    expect('c1' in s.didntKnowMap).toBe(false)
  })
})

describe('persistence', () => {
  it('writes only the active algset key, not a combined one', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    await new Promise((r) => setTimeout(r, 0))

    expect(localStorage.getItem('ltct_store:testset')).not.toBeNull()
    expect(localStorage.getItem('ltct_store')).toBeNull()
    expect(localStorage.getItem('ltct_srs:testset')).not.toBeNull()
  })

  it('restores a run from storage on the next start', async () => {
    const s = await load()
    s.setSelectedKeys(['c1'])
    s.startTimer(); s.stopTimer()
    await new Promise((r) => setTimeout(r, 0))
    const before = s.store.stats.length

    vi.resetModules()
    setActivePinia(createPinia())
    const again = await load()
    expect(again.store.stats).toHaveLength(before)
    expect((again.srsData as Record<string, SrsEntry>).c1.n).toBe(1)
  })

  it('does not carry another algset\'s history into this one', async () => {
    localStorage.setItem('ltct_store:anderesSet',
      JSON.stringify({ keys: ['x'], stats: [{ i: 0, key: 'x', ms: 1 }], keysCount: {}, upcoming: [] }))
    const s = await load()
    expect(s.store.stats).toEqual([])
  })
})
