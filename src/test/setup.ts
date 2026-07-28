import { beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// This file runs for every suite, including the pure-logic ones that opt into
// the node environment (`@vitest-environment node`), so everything here has to
// tolerate a missing DOM.
const hasDom = typeof window !== 'undefined'

// A fresh Pinia and a clean localStorage for every test. Stores read
// localStorage at creation time, so leaking state between tests would make
// them order-dependent — the failure mode that makes store suites untrustworthy.
beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
  setActivePinia(createPinia())
})

// jsdom has no matchMedia; some Bootstrap/theme code paths probe it.
if (hasDom && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}
