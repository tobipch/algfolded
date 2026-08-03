<script setup>
import {legalConfig} from '@/legal_config'

// Empty optional fields are dropped rather than rendered as blank lines.
const lines = legalConfig.addressLines.filter(line => line.trim() !== '')
</script>

<template>
  <address>
    <strong>{{ legalConfig.operatorName }}</strong><br>
    <template v-for="line in lines" :key="line">{{ line }}<br></template>
    <a :href="`mailto:${legalConfig.email}`">{{ legalConfig.email }}</a>
    <template v-if="legalConfig.phone"><br>{{ legalConfig.phone }}</template>
  </address>
</template>
