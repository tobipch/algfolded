import {inject, pageview} from '@vercel/analytics'

// Vercel Web Analytics. Cookieless: the script stores nothing on the device,
// so no consent banner is needed for it.
//
// The router runs on hash history (`/#/timer`), which means `location.pathname`
// stays "/" for every view. The script's built-in pushState tracking would
// therefore report a single page for the whole app, so auto-tracking is off and
// the hash route is reported from the router instead.
export function setupAnalytics(router) {
  inject({framework: 'vue', disableAutoTrack: true})

  router.afterEach((to) => {
    // No route has dynamic segments, so the pattern and the concrete path are
    // the same string -- nothing to anonymise into a `[param]` placeholder.
    pageview({route: to.path, path: to.path})
  })
}
