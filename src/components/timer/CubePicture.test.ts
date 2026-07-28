import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// The cube thumbnail. What matters here is which renderer it asks for: the 3D
// one pulls cubing's largest chunk (~500 KB) and is only worth it where the
// user actually plays algs on the cube. Everywhere else it must stay 2D.

const constructed: Record<string, unknown>[] = []

// The real TwistyPlayer is a custom element that gets appended to the DOM, so
// the stand-in has to be a real node too. A constructor returning an object
// makes `new TwistyPlayer(...)` hand back that node.
vi.mock('cubing/twisty', () => ({
  TwistyPlayer: function (opts: Record<string, unknown>) {
    constructed.push(opts)
    const el = document.createElement('div')
    el.className = 'fake-twisty'
    Object.assign(el, { jumpToStart: vi.fn(), play: vi.fn(), experimentalSetupAlg: '' })
    return el
  },
}))

const mountCube = async (props: Record<string, unknown>) => {
  const CubePicture = (await import('@/components/timer/CubePicture.vue')).default
  const w = mount(CubePicture, { props })
  await new Promise((r) => setTimeout(r, 0)) // the dynamic import resolves
  await w.vm.$nextTick()
  return w
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  constructed.length = 0
  setActivePinia(createPinia())
})

describe('renderer choice', () => {
  it('renders a still 2D picture by default', async () => {
    await mountCube({ scramble: "R U R'" })
    expect(constructed).toHaveLength(1)
    expect(constructed[0].visualization).toBe('2D')
    expect(constructed[0].experimentalDragInput).toBe('none')
  })

  it('renders 3D only when explicitly interactive', async () => {
    await mountCube({ scramble: "R U R'", interactive: true })
    expect(constructed[0].visualization).toBe('3D')
    expect(constructed[0].experimentalDragInput).toBe('auto')
  })

  it('builds nothing at all without a scramble', async () => {
    await mountCube({ scramble: '' })
    expect(constructed).toHaveLength(0)
  })
})

describe('what is shown', () => {
  it('passes the scramble through as the alg', async () => {
    await mountCube({ scramble: "R U R' U'" })
    expect(constructed[0].alg).toBe("R U R' U'")
    expect(constructed[0].puzzle).toBe('3x3x3')
  })

  it('prefixes the configured cube orientation', async () => {
    const { useSettingsStore } = await import('@/stores/SettingsStore')
    useSettingsStore().store.cubeOrientation = 'y2'
    await mountCube({ scramble: "R U R'" })
    expect(constructed[0].alg).toBe("y2 R U R'")
  })

  it('rebuilds the picture when the scramble changes', async () => {
    const w = await mountCube({ scramble: "R U R'" })
    await w.setProps({ scramble: "L U L'" })
    await new Promise((r) => setTimeout(r, 0))
    expect(constructed).toHaveLength(2)
    expect(constructed[1].alg).toBe("L U L'")
  })
})
