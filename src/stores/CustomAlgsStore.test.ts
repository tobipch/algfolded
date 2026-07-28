import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// in-memory localStorage for the node test env
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string): void { this.m.set(k, String(v)) }
  removeItem(k: string): void { this.m.delete(k) }
  clear(): void { this.m.clear() }
}

// Stand-in algset: one case whose collection carries a plain-notation alg.
const COLLECTION_ALG = "R' U' R U R' D R U2 D' R D R' U2 R' D' R2"
vi.mock('@/stores/AlgsetStore', () => ({
  useAlgsetStore: () => ({
    activeId: 't2c',
    byId: { CASE: { id: 'CASE', algs: [COLLECTION_ALG, "U' R' U' R D' R2 U' D r' B' R2 B U2 r"] } },
  }),
}))

const { useCustomAlgsStore } = await import('./CustomAlgsStore')

beforeEach(() => {
  ;(globalThis as any).localStorage = new MemStorage()
  setActivePinia(createPinia())
})

describe('blockingAlg', () => {
  it('is null for a genuinely new alg', () => {
    const custom = useCustomAlgsStore()
    expect(custom.blockingAlg('CASE', "R U R' U'")).toBe(null)
    expect(custom.addAlg('CASE', "R U R' U'")).toBe("R U R' U'")
  })

  it('names the collection alg an entry canonically duplicates', () => {
    const custom = useCustomAlgsStore()
    // same moves, different spelling of the last turn
    expect(custom.blockingAlg('CASE', "R' U' R U R' D R U2 D' R D R' U2 R' D' R R"))
      .toBe(COLLECTION_ALG)
    expect(custom.addAlg('CASE', "R' U' R U R' D R U2 D' R D R' U2 R' D' R R")).toBe(null)
  })

  it('names the user\'s own alg when the input duplicates that', () => {
    const custom = useCustomAlgsStore()
    custom.addAlg('CASE', "F R U R' U' F'")
    expect(custom.blockingAlg('CASE', "F R U R' U' F' U U'")).toBe("F R U R' U' F'")
  })

  it('lets a richer spelling of a collection alg through', () => {
    const custom = useCustomAlgsStore()
    expect(custom.blockingAlg('CASE', '[R U R\', D2]')).toBe(null)
  })

  it('ignores parentheses and extra whitespace when comparing', () => {
    const custom = useCustomAlgsStore()
    expect(custom.blockingAlg('CASE', `(R' U' R) (U R' D R  U2)  D' R D R' U2 R' D' R2`))
      .toBe(COLLECTION_ALG)
  })
})
