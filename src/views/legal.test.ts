import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
// @ts-expect-error -- vue-i18n 9.2 ships types the "bundler" resolution can't
// reach through its package.json "exports"; runtime import is fine.
import { createI18n } from 'vue-i18n'
import { createRouter, createWebHashHistory } from 'vue-router'

// Aliased: a bare `it` import would shadow vitest's `it`.
import deMessages from '@/assets/i18n/de.json'
import enMessages from '@/assets/i18n/en.json'
import frMessages from '@/assets/i18n/fr.json'
import itMessages from '@/assets/i18n/it.json'

import PrivacyView from '@/views/PrivacyView.vue'
import ImprintView from '@/views/ImprintView.vue'
import AppFooter from '@/components/AppFooter.vue'
import { isConfigComplete, isLegalConfigComplete } from '@/legal_config'

// The legal pages have to say something in every language the app offers: a
// missing key renders the key path itself ("privacy.rights.body"), which on an
// imprint is worse than useless. Only one locale's messages are loaded at
// runtime (see locale.js), so vue-i18n's fallbackLocale can't paper over a gap.

const LOCALES = {
  de: deMessages,
  en: enMessages,
  fr: frMessages,
  it: itMessages,
} as Record<string, Record<string, any>>

function leafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  return Object.entries(obj).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  )
}

function legalPaths(locale: string): string[] {
  const root = LOCALES[locale][locale]
  return ['legal', 'privacy', 'imprint']
    .flatMap((section) => leafPaths(root[section], section))
    .sort()
}

function makeI18n(locale: string) {
  return createI18n({
    legacy: false,
    locale,
    messages: { [locale]: LOCALES[locale][locale] },
  })
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/privacy', name: 'privacy', component: PrivacyView },
    { path: '/imprint', name: 'imprint', component: ImprintView },
    // stand-ins for the real app's routes, so mounting doesn't warn about an
    // unmatched "/" and the footer can be checked against the timer
    { path: '/', name: 'select', component: { template: '<div/>' } },
    { path: '/timer', name: 'timer', component: { template: '<div/>' } },
  ],
})

function mountLegal(component: unknown, locale: string) {
  return mount(component as never, { global: { plugins: [makeI18n(locale), router] } })
}

describe('legal translations', () => {
  it('defines the same keys in every locale', () => {
    const reference = legalPaths('de')
    expect(reference.length).toBeGreaterThan(30)
    for (const locale of ['en', 'fr', 'it']) {
      expect(legalPaths(locale), `locale ${locale}`).toEqual(reference)
    }
  })

  it('leaves no value empty', () => {
    for (const locale of Object.keys(LOCALES)) {
      const root = LOCALES[locale][locale]
      for (const section of ['legal', 'privacy', 'imprint']) {
        const flat = JSON.stringify(root[section])
        expect(flat, `locale ${locale}`).not.toContain('""')
      }
    }
  })
})

describe.each(['de', 'en', 'fr', 'it'])('legal pages (%s)', (locale) => {
  it('renders the privacy policy without leaking key paths', () => {
    const text = mountLegal(PrivacyView, locale).text()
    expect(text).not.toMatch(/privacy\.[a-z_]+/)
    expect(text.length).toBeGreaterThan(500)
  })

  it('renders the imprint without leaking key paths', () => {
    const text = mountLegal(ImprintView, locale).text()
    expect(text).not.toMatch(/imprint\.[a-z_]+/)
  })

  it('names every processor the app actually sends data to', () => {
    const text = mountLegal(PrivacyView, locale).text()
    expect(text).toContain('Vercel')
    expect(text).toContain('Hostpoint')
    expect(text).toContain('World Cube Association')
  })
})

describe('operator details', () => {
  // A postal address is only required for commercial sites; the duties that do
  // apply here ask for identity and contact details. Name plus email has to
  // count as complete, or the warning banner would never go away.
  const named = { operatorName: 'A. Muster', email: 'kontakt@example.com' }

  it('counts as complete without any address', () => {
    expect(isConfigComplete({ ...named, addressLines: [] })).toBe(true)
    expect(isConfigComplete(named)).toBe(true)
  })

  it('still requires a name and a way to get in touch', () => {
    expect(isConfigComplete({ ...named, operatorName: '' })).toBe(false)
    expect(isConfigComplete({ ...named, email: '' })).toBe(false)
    expect(isConfigComplete({ ...named, operatorName: 'TODO: Name' })).toBe(false)
  })

  it('rejects a half-edited address rather than shipping a stray placeholder', () => {
    const half = { ...named, addressLines: ['Musterstrasse 1', 'TODO: PLZ und Ort'] }
    expect(isConfigComplete(half)).toBe(false)
  })
})

describe('unfilled operator details', () => {
  it('are reported as incomplete while the placeholders are in place', () => {
    // Flips to true once the operator fills in legal_config.js; the warning
    // below then stops rendering.
    expect(isLegalConfigComplete()).toBe(false)
  })

  it('raise a visible warning on both pages instead of shipping silently', () => {
    for (const view of [PrivacyView, ImprintView]) {
      const wrapper = mountLegal(view, 'de')
      expect(wrapper.find('.alert-warning').exists()).toBe(true)
    }
  })
})

describe('footer', () => {
  const mountFooter = async (path: string) => {
    await router.push(path)
    await router.isReady()
    return mount(AppFooter, { global: { plugins: [makeI18n('de'), router] } })
  }

  it('links to both legal pages', async () => {
    const wrapper = await mountFooter('/')
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['#/imprint', '#/privacy'])
  })

  it('stays out of the timer, where it would sit in the tap-to-start zone', async () => {
    const wrapper = await mountFooter('/timer')
    expect(wrapper.find('footer').exists()).toBe(false)
  })
})
