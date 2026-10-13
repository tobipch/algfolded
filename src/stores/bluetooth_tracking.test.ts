import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { invertMove } from '@/helpers/scramble_utils'

// The virtual cube as flow arms it: letter-pair style, the case's scramble
// already applied, success is the user's moves bringing it back to solved.
// Driven move by move through the same entry point the cubes use.

vi.mock('btcube-web', () => ({ connectSmartCube: vi.fn() }))
vi.mock('gan-web-bluetooth', () => ({ connectGanCube: vi.fn() }))

const split = (s: string) => s.split(' ')
const inverse = (s: string) => split(s).reverse().map(invertMove).join(' ')

// Two corner comms: the first ends in D', the second starts with D.
const A = "R U R' D R U' R' D'"
const B = "D R' D' R U2 R' D R D' U2"

let clock = 0
const load = async () => {
  const { useBluetoothCubeStore } = await import('@/stores/BluetoothCubeStore')
  const bt = useBluetoothCubeStore()
  bt.forceLetterPair = true
  const { onMove } = bt._getInternals()
  // each turn 150ms after the last, on the local clock
  const turn = (m: string, gapMs = 150) => { clock += gapMs; onMove(m) }
  return { bt, turn }
}

beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(() => { vi.restoreAllMocks() })

describe('a cancellation into the next case', () => {
  it('finishes both cases with one solve when the junction cancels', async () => {
    const { bt, turn } = await load()
    await bt.startTracking(inverse(A), inverse(B))
    expect(bt.phase).toBe('awaiting_solve')
    const moves = [...split(A).slice(0, -1), ...split(B).slice(1)]
    for (const m of moves) turn(m)
    expect(bt.phase).toBe('idle')
    expect(bt.lastSolveCombined).toBe(true)
    expect(bt.lastSolveMoves).toEqual(moves)
    expect(bt.lastSolveTimes).toHaveLength(moves.length)
    expect(bt.lastSolveStart).not.toBeNull()
  })

  it('without a cancellation the case finishes on its own, as always', async () => {
    const { bt, turn } = await load()
    await bt.startTracking(inverse(A), inverse(B))
    for (const m of split(A)) turn(m)
    expect(bt.phase).toBe('idle')
    expect(bt.lastSolveCombined).toBe(false)
    expect(bt.lastSolveMoves).toEqual(split(A))
  })

  it('does nothing of the sort when no next case is known', async () => {
    const { bt, turn } = await load()
    await bt.startTracking(inverse(A))
    for (const m of [...split(A).slice(0, -1), ...split(B).slice(1)]) turn(m)
    expect(bt.phase).toBe('solving')
  })

  // A case followed by its own inverse: the combined cube starts solved and
  // would fire on any wobble that nets out, so it is not armed at all.
  it('is not armed when the next case undoes this one', async () => {
    const { bt, turn } = await load()
    await bt.startTracking(inverse(A), A)
    turn('R'); turn("R'")
    // back at the case's start, not "both cases done"
    expect(bt.phase).toBe('awaiting_solve')
    expect(bt.lastSolveMoves).toBeNull()
  })
})

describe('the reset gesture', () => {
  // Ezra's loop: an attempt ending in U, then U4 to reset. The stale U used to
  // complete the spin after the third turn, and the fourth became the first
  // move of the re-armed case - every time.
  it('fires at the end of the spin, not one turn early', async () => {
    const { bt, turn } = await load()
    await bt.startTracking(inverse(A), inverse(B))
    turn('R'); turn('U')                  // a wrong attempt, ending in U
    const before = bt.resetSignal
    turn('U', 900)                        // noticing, then spinning
    turn('U'); turn('U')
    expect(bt.resetSignal).toBe(before)   // the old third-turn misfire
    turn('U')
    expect(bt.resetSignal).toBe(before + 1)
    // re-armed, nothing left over: the next case may start with U at once
    await vi.waitFor(() => expect(bt.phase).toBe('awaiting_solve'))
    turn('U', 50)
    expect(bt.phase).toBe('solving')
  })

  it('a slow spin is not a reset', async () => {
    const { bt, turn } = await load()
    await bt.startTracking(inverse(A), inverse(B))
    const before = bt.resetSignal
    for (let i = 0; i < 4; i++) turn('D', 600)
    expect(bt.resetSignal).toBe(before)
  })
})
