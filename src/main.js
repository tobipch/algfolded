import { createApp } from 'vue'
import App from './App.vue'

// router
import router from './router'

// analytics
import {setupAnalytics} from '@/analytics'

// Pinia
import { createPinia } from 'pinia'

// bootstrap, icons and theme
import "bootstrap"
import "bootstrap-icons/font/bootstrap-icons.css"
// the .min.css file for specific Bootstrap theme will be loaded and applied in App.vue

// i18n
import {i18n} from "@/locale"

import {useAlgsetStore} from "@/stores/AlgsetStore"

const app = createApp(App)
const pinia = createPinia()
app.use(router)
app.use(pinia)
app.use(i18n)

// registered before mount so the router's very first navigation is counted too
setupAnalytics(router)

// Mount immediately so the app shell paints right away, then load the active
// algset's cases in the background. The select view shows a loading state and
// fills in reactively when the data (a lazy chunk) arrives.
app.mount('#app')
const algset = useAlgsetStore(pinia)
algset.activate(algset.activeId).catch(err => console.error('algset load failed', err))