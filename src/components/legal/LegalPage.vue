<script setup>
import {isLegalConfigComplete, legalConfig} from '@/legal_config'

defineProps({
  title: {type: String, required: true},
})

const configComplete = isLegalConfigComplete()
</script>

<template>
  <article class="legal-page mt-3 mb-5">
    <h1>{{ title }}</h1>
    <p class="text-body-secondary small">{{ $t('legal.updated', {date: legalConfig.lastUpdated}) }}</p>

    <!-- Placeholders left in legal_config.js would otherwise ship as a page
         that looks finished but names nobody. -->
    <div v-if="!configComplete" class="alert alert-warning" role="alert">
      {{ $t('legal.config_warning') }}
    </div>

    <slot/>

    <p class="text-body-secondary small mt-4 pt-3 border-top">{{ $t('legal.governing') }}</p>
  </article>
</template>

<style scoped>
/* Prose, not app chrome -- cap the measure so lines stay readable on wide
   screens instead of running the full 1500px content width. */
.legal-page {
  max-width: 46rem;
}
.legal-page :deep(h2) {
  font-size: 1.25rem;
  margin-top: 1.75rem;
  margin-bottom: 0.5rem;
}
.legal-page :deep(p) {
  line-height: 1.6;
}
.legal-page :deep(address) {
  font-style: normal;
  margin-bottom: 0;
}
</style>
