import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// The navbar's "recap again" offer: it shows up next to "select" once a recap
// has walked every selected case, and starts the same recap over.

const session = {
  store: { recapDone: false, mode: 'practice' as string },
  casesWithZeroCount: [] as string[],
  startRecap: vi.fn(),
}
vi.mock('@/stores/SessionStore', () => ({ useSessionStore: () => session }))
vi.mock('@/stores/SelectedStore', () => ({
  useSelectedStore: () => ({ totalCasesSelected: () => 3 }),
}))
vi.mock('@/stores/DisplayStore', () => ({
  useDisplayStore: () => ({ showStatistics: false, showToast: vi.fn() }),
}))
vi.mock('@/stores/BluetoothCubeStore', () => ({
  useBluetoothCubeStore: () => ({ connected: false, connecting: false, paused: false, battery: null }),
}))
vi.mock('@/stores/CommandPaletteStore', () => ({
  useCommandPaletteStore: () => ({ openPalette: vi.fn() }),
}))
vi.mock('@/stores/AuthStore', () => ({
  useAuthStore: () => ({ loggedIn: false, checkAuthError: vi.fn() }),
}))
const route = { fullPath: '/timer', name: 'timer', query: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => route,
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'en' } }),
  // LangDropdown pulls in src/locale.js, which builds the real i18n instance.
  createI18n: () => ({ global: { t: (k: string) => k, locale: { value: 'en' } } }),
}))

const mountNav = async () => {
  const NavBar = (await import('@/components/nav/NavBar.vue')).default
  return mount(NavBar, {
    global: {
      mocks: { $t: (k: string) => k },
      stubs: { LangDropdown: true, ThemeSwitcher: true },
    },
  })
}

const recapBtn = (w: Awaited<ReturnType<typeof mountNav>>) =>
  w.findAll('button').filter((b) => b.text().includes('nav.recap_again'))

beforeEach(() => {
  vi.resetModules()
  session.store.recapDone = false
  session.store.mode = 'practice'
  session.startRecap.mockClear()
  setActivePinia(createPinia())
})

describe('recap again button', () => {
  it('stays hidden while no recap has finished', async () => {
    expect(recapBtn(await mountNav())).toHaveLength(0)
  })

  it('appears on the timer once the recap is through', async () => {
    session.store.recapDone = true
    expect(recapBtn(await mountNav())).toHaveLength(1)
  })

  it('restarts the recap when clicked', async () => {
    session.store.recapDone = true
    const w = await mountNav()
    await recapBtn(w)[0].trigger('click')
    expect(session.startRecap).toHaveBeenCalledTimes(1)
  })

  it('stays off the selection screen', async () => {
    session.store.recapDone = true
    route.fullPath = '/select'
    route.name = 'select'
    const w = await mountNav()
    expect(recapBtn(w)).toHaveLength(0)
    route.fullPath = '/timer'
    route.name = 'timer'
  })
})
