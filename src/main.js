import { createApp } from 'vue'
import App from './App.vue'

// router
import router from './router'

// Pinia
import { createPinia } from 'pinia'

// bootstrap, icons and theme
import "bootstrap"
import "bootstrap-icons/font/bootstrap-icons.css"
// import 'bootstrap-select/dist/js/bootstrap-select.min';
// the .min.css file for specific Bootstrap theme will be loaded and applied in App.vue

// i18n
import {i18n} from "@/locale"

import {useAlgsetStore} from "@/stores/AlgsetStore"

const app = createApp(App)
const pinia = createPinia()
app.use(router)
app.use(pinia)
app.use(i18n)

// Load the active algset's cases before the first render so the select view
// has its data up front. (Per-set lazy loading on switch + a reactive UI come
// with the later phases; for now exactly one set is loaded at startup.)
const algset = useAlgsetStore(pinia)
algset.activate(algset.activeId).finally(() => app.mount('#app'))