<script setup>
import {RouterLink, useRoute} from 'vue-router'
import {computed} from 'vue'

const route = useRoute()

// Everywhere except the timer. On a phone the timer is started by tapping the
// screen, and the footer would sit right in that tap zone -- a mistap between
// solves would navigate out of the session. (A tap during a *running* solve is
// already harmless: the timer's document-level touchstart handler calls
// preventDefault, which swallows the click.)
const visible = computed(() => route.name !== 'timer')
</script>

<template>
  <!-- Imprint and privacy have to be reachable from every page, not just from
       the select view's info accordion, so this sits outside the router view. -->
  <footer v-if="visible" class="app-footer text-body-secondary small">
    <RouterLink to="/imprint" class="app-footer-link">{{ $t('legal.imprint') }}</RouterLink>
    <span class="app-footer-sep" aria-hidden="true">·</span>
    <RouterLink to="/privacy" class="app-footer-link">{{ $t('legal.privacy') }}</RouterLink>
  </footer>
</template>

<style scoped>
.app-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem var(--app-gutter) 1rem;
}
.app-footer-link {
  color: inherit;
  text-decoration: none;
}
.app-footer-link:hover, .app-footer-link:focus-visible {
  text-decoration: underline;
}
.app-footer-sep {
  opacity: 0.5;
}
</style>
