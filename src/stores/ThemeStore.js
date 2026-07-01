/*
* Unified light/dark theme. The app ships one design with two modes:
* - light mode uses the "flatly" Bootstrap base
* - dark mode uses the "darkly" Bootstrap base
* Both are retinted by assets/theme.css (loaded after the base so it wins).
*
* Usage: in App.vue do useThemeStore().applyCurrentTheme();
* Toggle with useThemeStore().toggleDayNight();
*/
import {computed, ref} from 'vue'
import { defineStore } from 'pinia'
import {migrateLocalStorageKey} from '@/helpers/helpers'
// Reference the two bases explicitly (not via a `${name}` glob) so Vite only
// emits these two stylesheets instead of every file in bootstrap_themes/.
import flatlyUrl from '@/assets/bootstrap_themes/flatly.min.css?url'
import darklyUrl from '@/assets/bootstrap_themes/darkly.min.css?url'
import overridesCssUrl from '@/assets/theme.css?url'

const isDarkKey = "ltct_theme.is_dark";
migrateLocalStorageKey("zbll_theme.is_dark", isDarkKey)

const BASE_URL_BY_MODE = { light: flatlyUrl, dark: darklyUrl };

const getInitialIsDark = () => !!localStorage && localStorage.getItem(isDarkKey) === "true";

// create the <link> if missing, set its href, optionally move it to the end of <head>
const ensureLink = (id, href, moveToEnd = false) => {
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (href !== undefined) link.href = href;
  if (moveToEnd) document.head.appendChild(link); // re-append => last in cascade
  return link;
}

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(getInitialIsDark())
  const icon = computed(() => isDark.value ? "bi-moon" : "bi-sun");

  function applyCurrentTheme() {
    const mode = isDark.value ? 'dark' : 'light';
    document.documentElement.dataset.mode = mode;
    ensureLink("bootstrap_stylesheet", BASE_URL_BY_MODE[mode]);
    // overrides must stay after the base theme in the cascade
    ensureLink("theme_overrides", overridesCssUrl, true);
  }

  function toggleDayNight() {
    isDark.value = !isDark.value;
    applyCurrentTheme();
    if (localStorage) {
      localStorage.setItem(isDarkKey, "" + isDark.value);
    }
  }

  return { isDark, icon, toggleDayNight, applyCurrentTheme }
});
