import {createI18n} from 'vue-i18n'
import {migrateLocalStorageKey} from '@/helpers/helpers'

import de from '@/assets/i18n/de.json'
import en from '@/assets/i18n/en.json'
import fr from '@/assets/i18n/fr.json'
import it from '@/assets/i18n/it.json'

import flagDe from '@/assets/flags/de.svg'
import flagGb from '@/assets/flags/gb.svg'
import flagFr from '@/assets/flags/fr.svg'
import flagIt from '@/assets/flags/it.svg'
import {readString, writeString} from '@/helpers/namespaced_storage'

export const supportedLocales = [
    {code: "de", messages: de, name: "Deutsch", flag: flagDe},
    {code: "en", messages: en, name: "English", flag: flagGb},
    {code: "fr", messages: fr, name: "Français", flag: flagFr},
    {code: "it", messages: it, name: "Italiano", flag: flagIt},
]
const localStorageKey = "ltct_locale"
migrateLocalStorageKey("zbll_locale", localStorageKey)
const defaultLocale = 'en';

const supportedLocalesSet = new Set(supportedLocales.map(locale => locale.code));

const getUserLocale = () => {
    const localeFromStorage = readString(localStorageKey);
    if (supportedLocalesSet.has(localeFromStorage)) {
        return localeFromStorage;
    }
    const secondGuess = (window.navigator.language || window.navigator.userLanguage || defaultLocale)
        .split('-')[0].toLowerCase();
    return supportedLocalesSet.has(secondGuess) ? secondGuess : defaultLocale;
}

const userLocale = getUserLocale();
document.querySelector("html").setAttribute("lang", userLocale);

export const i18n = createI18n({
    legacy: false,
    locale: userLocale,
    fallbackLocale: defaultLocale,
    messages: supportedLocales.find(o => o.code === userLocale).messages
});

// Switch the interface language in place. Deliberately NOT a page reload: a
// reload drops the Web Bluetooth GATT connection, and losing the smart cube
// mid-session because you changed the language is not a trade worth making.
// Nothing caches translated text, so swapping the locale is enough — every
// string goes through `t()` at render time.
// code: 2-letter locale code
export const setLocale = (code) => {
    const locale = supportedLocales.find(o => o.code === code)
    if (!locale) {
        console.error("setLocale(", code, "). Supported: ", supportedLocales);
        return;
    }
    writeString(localStorageKey, code);
    // createI18n is handed only the active locale's messages, so each further
    // locale is registered the first time it is switched to.
    if (!i18n.global.availableLocales.includes(code)) {
        i18n.global.setLocaleMessage(code, locale.messages[code])
    }
    i18n.global.locale.value = code;
    document.querySelector("html").setAttribute("lang", code);
}
