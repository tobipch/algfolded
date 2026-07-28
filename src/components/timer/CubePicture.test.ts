import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// The cube thumbnail. It renders 3D everywhere: cubing's 2D alternative would
// avoid a ~500 KB chunk, but it draws the cube as an unfolded net, and then the
// picture no longer tells you at a glance which case you are on.

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
  it('renders the cube in 3D, not as a 2D net', async () => {
    await mountCube({ scramble: "R U R'" })
    expect(constructed).toHaveLength(1)
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
