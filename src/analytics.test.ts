import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createWebHashHistory } from 'vue-router'
import { setupAnalytics } from '@/analytics'

// The app runs on hash history, so `location.pathname` is "/" no matter which
// view is open. Auto-tracking keys off pushState and would report every view as
// the same page, so the route has to come from the router itself.

vi.mock('@vercel/analytics', () => ({
  inject: vi.fn(),
  pageview: vi.fn(),
}))

const { inject, pageview } = await import('@vercel/analytics')

function makeRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/select', name: 'select', component: { template: '<div/>' } },
      { path: '/timer', name: 'timer', component: { template: '<div/>' } },
      { path: '/', redirect: '/select' },
    ],
  })
}

beforeEach(() => {
  vi.mocked(inject).mockClear()
  vi.mocked(pageview).mockClear()
})

describe('setupAnalytics', () => {
  it("turns the script's own auto-tracking off", () => {
    setupAnalytics(makeRouter())
    expect(inject).toHaveBeenCalledWith(
      expect.objectContaining({ disableAutoTrack: true }),
    )
  })

  it('reports the hash route rather than the browser path', async () => {
    const router = makeRouter()
    setupAnalytics(router)

    await router.push('/timer')

    expect(pageview).toHaveBeenCalledWith({ route: '/timer', path: '/timer' })
    // the real pathname the script would have seen instead
    expect(window.location.pathname).toBe('/')
  })

  it('counts the first navigation, not just later ones', async () => {
    const router = makeRouter()
    setupAnalytics(router)

    await router.push('/')
    await router.isReady()

    expect(pageview).toHaveBeenCalledWith({ route: '/select', path: '/select' })
  })

  it('reports each view separately as the user navigates', async () => {
    const router = makeRouter()
    setupAnalytics(router)

    await router.push('/select')
    await router.push('/timer')

    const routes = vi.mocked(pageview).mock.calls.map(([arg]) => arg.route)
    expect(routes).toEqual(['/select', '/timer'])
  })
})
