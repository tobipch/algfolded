<script setup>
import LegalPage from '@/components/legal/LegalPage.vue'
import OperatorAddress from '@/components/legal/OperatorAddress.vue'
import {legalConfig} from '@/legal_config'
import {useI18n} from 'vue-i18n'

const {t} = useI18n()
</script>

<template>
  <LegalPage :title="t('privacy.title')">
    <p>{{ t('privacy.intro') }}</p>

    <h2>{{ t('privacy.controller.title') }}</h2>
    <p>{{ t('privacy.controller.body') }}</p>
    <OperatorAddress/>

    <h2>{{ t('privacy.logs.title') }}</h2>
    <p>{{ t('privacy.logs.body') }}</p>

    <h2>{{ t('privacy.analytics.title') }}</h2>
    <p>{{ t('privacy.analytics.body') }}</p>

    <h2>{{ t('privacy.localstorage.title') }}</h2>
    <p>{{ t('privacy.localstorage.body') }}</p>
    <p>{{ t('privacy.localstorage.note') }}</p>

    <h2>{{ t('privacy.account.title') }}</h2>
    <p>{{ t('privacy.account.body') }}</p>
    <ul>
      <li>{{ t('privacy.account.item_account_id') }}</li>
      <li>{{ t('privacy.account.item_wca_id') }}</li>
      <li>{{ t('privacy.account.item_name') }}</li>
      <li>{{ t('privacy.account.item_avatar') }}</li>
    </ul>
    <p>{{ t('privacy.account.after') }}</p>

    <h2>{{ t('privacy.solves.title') }}</h2>
    <p>{{ t('privacy.solves.body') }}</p>

    <h2>{{ t('privacy.cookies.title') }}</h2>
    <p>{{ t('privacy.cookies.body') }}</p>

    <h2>{{ t('privacy.processors.title') }}</h2>
    <p>{{ t('privacy.processors.body') }}</p>
    <ul>
      <li>{{ t('privacy.processors.item_frontend') }} {{ legalConfig.hosting.frontend }}</li>
      <li>{{ t('privacy.processors.item_database') }} {{ legalConfig.hosting.database }}</li>
      <li>{{ t('privacy.processors.item_wca') }}</li>
    </ul>
    <p>{{ t('privacy.processors.note') }}</p>

    <h2>{{ t('privacy.retention.title') }}</h2>
    <p>{{ t('privacy.retention.body') }}</p>

    <h2>{{ t('privacy.rights.title') }}</h2>
    <p>{{ t('privacy.rights.body') }}</p>

    <h2>{{ t('privacy.contact.title') }}</h2>
    <p>{{ t('privacy.contact.body') }}</p>
    <OperatorAddress/>
  </LegalPage>
</template>
