import {createRouter, createWebHashHistory} from 'vue-router'
// SelectView is the landing route -> keep it eager. The others (timer pulls
// in the heavy cubing/3D code) are lazy so they stay out of the initial bundle.
import SelectView from "@/views/SelectView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/select',
      name: 'select',
      component: SelectView
    },
    {
      path: '/timer',
      name: 'timer',
      component: () => import("@/views/TimerView.vue")
    },
    {
      path: '/',
      redirect: '/select',
    },
    {
      path: '/about',
      name: 'about',
      component: () => import("@/views/AboutView.vue")
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import("@/views/SettingsView.vue")
    },
  ]
})

export default router
