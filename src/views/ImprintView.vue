<script setup>
import LegalPage from '@/components/legal/LegalPage.vue'
import OperatorAddress from '@/components/legal/OperatorAddress.vue'
import {legalConfig} from '@/legal_config'
import {useI18n} from 'vue-i18n'

const {t} = useI18n()
</script>

<template>
  <LegalPage :title="t('imprint.title')">
    <h2>{{ t('imprint.operator.title') }}</h2>
    <OperatorAddress/>

    <h2>{{ t('imprint.nature.title') }}</h2>
    <p>{{ t('imprint.nature.body') }}</p>

    <h2>{{ t('imprint.liability.title') }}</h2>
    <p>{{ t('imprint.liability.body') }}</p>

    <h2>{{ t('imprint.source.title') }}</h2>
    <p>
      <i class="bi bi-github"></i>
      <a :href="legalConfig.sourceCodeUrl" class="px-2" target="_blank" rel="noopener">
        {{ legalConfig.sourceCodeUrl.replace('https://', '') }}
      </a>
    </p>
  </LegalPage>
</template>
