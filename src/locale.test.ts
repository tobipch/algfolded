import { describe, it, expect, beforeEach, vi } from 'vitest'

// Switching the interface language used to call location.reload(), which tears
// down the Web Bluetooth GATT connection: change the language mid-session and
// your smart cube was gone. These tests pin the in-place switch down — every
// assertion below is one a reload-based implementation could not satisfy,
// because after a reload nothing in this process would have changed at all.

const load = async () => await import('@/locale')

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('ltct_locale', 'en')
})

describe('switching language', () => {
  it('changes the locale in place, without reloading the page', async () => {
    const { i18n, setLocale } = await load()
    expect(i18n.global.locale.value).toBe('en')
    setLocale('de')
    expect(i18n.global.locale.value).toBe('de')
    expect(i18n.global.t('nav.language')).toBe('Sprache')
  })

  it('registers the messages of a locale that was not loaded at boot', async () => {
    const { i18n, setLocale } = await load()
    expect(i18n.global.availableLocales).toEqual(['en'])
    setLocale('fr')
    expect(i18n.global.availableLocales).toContain('fr')
    expect(i18n.global.t('select.mode_practice')).toBe('Pratique')
  })

  it('keeps every locale it has already loaded, so switching back is free', async () => {
    const { i18n, setLocale } = await load()
    setLocale('it')
    setLocale('de')
    setLocale('it')
    expect(i18n.global.t('select.mode_practice')).toBe('Pratica')
    expect(i18n.global.availableLocales.sort()).toEqual(['de', 'en', 'it'])
  })

  it('persists the choice and updates the document language', async () => {
    const { setLocale } = await load()
    setLocale('it')
    expect(localStorage.getItem('ltct_locale')).toBe('it')
    expect(document.documentElement.getAttribute('lang')).toBe('it')
  })

  it('comes back up in the locale it stored last time', async () => {
    localStorage.setItem('ltct_locale', 'de')
    const { i18n } = await load()
    expect(i18n.global.locale.value).toBe('de')
    expect(i18n.global.t('select.mode_practice')).toBe('Üben')
  })

  it('ignores an unsupported code instead of half-applying it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { i18n, setLocale } = await load()
    setLocale('klingon')
    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem('ltct_locale')).toBe('en')
  })
})

// Sections nest (cmd.section.*), so collect the leaves rather than assuming
// a fixed depth.
const allStrings = (node: unknown): string[] =>
  typeof node === 'string' ? [node]
    : (node && typeof node === 'object') ? Object.values(node).flatMap(allStrings)
    : []

describe('the German translation', () => {
  it('uses umlauts, and double-s in place of the sharp s', async () => {
    const de = (await import('@/assets/i18n/de.json')).default.de
    const strings = allStrings(de)
    expect(strings.length).toBeGreaterThan(100)
    expect(strings.filter((v) => /[ßẞ]/.test(v))).toEqual([])
    // ...and no ASCII stand-ins where an umlaut belongs
    expect(strings.filter((v) => /\b(Faelle|Ausfuehrung|fuer|Ueben|zurueck)\b/i.test(v))).toEqual([])
  })
})
