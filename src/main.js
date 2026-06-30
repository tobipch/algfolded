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

// Mount immediately so the app shell paints right away, then load the active
// algset's cases in the background. The select view shows a loading state and
// fills in reactively when the data (a lazy chunk) arrives.
app.mount('#app')
const algset = useAlgsetStore(pinia)
algset.activate(algset.activeId).catch(err => console.error('algset load failed', err))