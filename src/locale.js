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
    const localeFromStorage = localStorage.getItem(localStorageKey);
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

// code: 2-letter locale code
export const setLocaleAndReload = (code) => {
    if (!supportedLocales.find(o => o.code === code)) {
        console.error("setLocaleAndReload(", code, "). Supported: ", supportedLocales);
        return;
    }
    localStorage.setItem(localStorageKey, code);
    location.reload();
}
