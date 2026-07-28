import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { AlgCase } from '@/algsets/types'

// The alg list: choosing an alg, adding your own, and the two ways an added
// alg can collide with one the case already lists — visible (an error) vs
// hidden past the display cutoff (just reveal it, no error).

const COLLECTION = [
  "R U R'",           // 0
  "L U L'",           // 1
  "F U F'",           // 2
  "B U B'",           // 3
  "D R D'",           // 4  <- past a maxAmount of 3
]
const CASES: AlgCase[] = [
  { id: 'c1', path: ['UFR', 'A', 'AB'], algs: COLLECTION, scrambles: ['S'] },
]

vi.mock('@/stores/AlgsetStore', () => ({
  useAlgsetStore: () => ({
    activeId: 'testset',
    cases: CASES,
    byId: Object.fromEntries(CASES.map((c) => [c.id, c])),
  }),
}))
vi.mock('@/stores/AuthStore', () => ({ useAuthStore: () => ({ loggedIn: false }) }))
vi.mock('@/helpers/api', () => ({ apiFetch: vi.fn() }))

const t = (k: string) => k
const mountList = async (maxAmount = 3) => {
  const SetupAndAlgs = (await import('@/components/timer/SetupAndAlgs.vue')).default
  return mount(SetupAndAlgs, {
    props: { caseKey: 'c1', maxAmount, playable: false },
    global: { mocks: { $t: t } },
  })
}

type Wrapper = ReturnType<typeof mount>
type Row = ReturnType<Wrapper['findAll']>[number]

const rows = (w: Wrapper): Row[] => w.findAll('.alg-item')
const texts = (w: Wrapper) => rows(w).map((r: Row) => r.find('.alg-text').text())
const typeAndAdd = async (w: Wrapper, alg: string) => {
  const input = w.find('input')
  await input.setValue(alg)
  await input.trigger('keydown.enter')
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('showing the collection', () => {
  it('caps the list at maxAmount', async () => {
    const w = await mountList(3)
    expect(texts(w)).toEqual(["R U R'", "L U L'", "F U F'"])
  })

  it('shows everything when maxAmount covers the list', async () => {
    const w = await mountList(8)
    expect(texts(w)).toHaveLength(5)
  })
})

describe('adding your own alg', () => {
  it('accepts a genuinely new alg and clears the input', async () => {
    const w = await mountList()
    await typeAndAdd(w, "R U2 R'")
    expect(texts(w)).toContain("R U2 R'")
    expect((w.find('input').element as HTMLInputElement).value).toBe('')
    expect(w.find('.add-alg-error').exists()).toBe(false)
  })

  it('rejects an unparseable alg with a message', async () => {
    const w = await mountList()
    await typeAndAdd(w, 'R U quatsch')
    expect(w.find('.add-alg-error').exists()).toBe(true)
    expect(w.find('input').classes()).toContain('is-invalid')
  })

  it('errors when the duplicate is one the user can already see', async () => {
    const w = await mountList(3)
    // "R U R'" is row 1, on screen
    await typeAndAdd(w, "R U R'")
    expect(w.find('.add-alg-error').exists()).toBe(true)
    expect(w.find('.alg-item.clash').exists()).toBe(true)
    // the text stays so it can be edited
    expect((w.find('input').element as HTMLInputElement).value).toBe("R U R'")
  })

  it('silently reveals a duplicate that was hidden past the cutoff', async () => {
    const w = await mountList(3)
    expect(texts(w)).not.toContain("D R D'")

    await typeAndAdd(w, "D R D'") // exists in the collection, but not on screen

    expect(w.find('.add-alg-error').exists()).toBe(false)      // no complaint
    expect(texts(w)).toContain("D R D'")                        // pulled into view
    expect(w.find('.alg-item.just-revealed').exists()).toBe(true)
    expect((w.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('errors on the second attempt, once the alg is visible', async () => {
    const w = await mountList(3)
    await typeAndAdd(w, "D R D'")
    expect(w.find('.add-alg-error').exists()).toBe(false)
    await typeAndAdd(w, "D R D'")
    expect(w.find('.add-alg-error').exists()).toBe(true)
  })

  it('recognises a differently written duplicate, not just an identical string', async () => {
    const w = await mountList(3)
    await typeAndAdd(w, "R U R' U U'") // cancels to R U R'
    expect(w.find('.add-alg-error').exists()).toBe(true)
  })

  it('lets a richer notation of a listed alg through', async () => {
    const w = await mountList(8)
    await typeAndAdd(w, '[R, U]')
    expect(w.find('.add-alg-error').exists()).toBe(false)
  })

  it('clears the message as soon as the user types again', async () => {
    const w = await mountList()
    await typeAndAdd(w, 'unsinn')
    expect(w.find('.add-alg-error').exists()).toBe(true)
    await w.find('input').setValue('R')
    expect(w.find('.add-alg-error').exists()).toBe(false)
  })
})

describe('choosing an alg', () => {
  it('marks the clicked alg as the preferred one, and unmarks on a second click', async () => {
    const w = await mountList(3)
    const second = rows(w)[1]
    await second.trigger('click')
    expect(rows(w)[1].classes()).toContain('preferred')
    await rows(w)[1].trigger('click')
    expect(rows(w)[1].classes()).not.toContain('preferred')
  })
})

describe('copying an alg', () => {
  it('puts the alg on the clipboard and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const w = await mountList(3)
    await rows(w)[0].find('.action-btn').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()

    expect(writeText).toHaveBeenCalledWith("R U R'")
    expect(rows(w)[0].find('.action-btn').classes()).toContain('copied')
  })

  it('does not select the alg when the copy button is clicked', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const w = await mountList(3)
    await rows(w)[1].find('.action-btn').trigger('click')
    expect(rows(w)[1].classes()).not.toContain('preferred')
  })
})

describe('removing your own alg', () => {
  it('deletes only user-added algs', async () => {
    const w = await mountList(8)
    await typeAndAdd(w, "R U2 R'")
    const own = rows(w).find((r: Row) => r.find('.alg-text').text() === "R U2 R'")!
    const buttons = own.findAll('.action-btn')
    await buttons[buttons.length - 1].trigger('click') // trash is last
    expect(texts(w)).not.toContain("R U2 R'")
  })
})
