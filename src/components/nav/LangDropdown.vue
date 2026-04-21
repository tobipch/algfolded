<script setup>

import {setLocaleAndReload, supportedLocales} from "@/locale"

</script>

<template>
  <div class="dropdown d-inline">
    <button class="btn btn-outline-info dropdown-toggle"
            :title="$t('nav.language')"
            tabindex="-1"
            @keydown.space.prevent=""
            type="button"
            id="dropdownLang"
            data-bs-toggle="dropdown"
            aria-expanded="false">
      <i class="bi-translate"/>
    </button>
    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownLang">
      <li v-for="locale in supportedLocales" :key="locale.code">
        <a class="dropdown-item clickable d-flex align-items-center gap-2" @click="setLocaleAndReload(locale.code)">
          <img :src="locale.flag" :alt="locale.code" class="lang-flag">
          {{locale.name}}
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lang-flag {
  width: 1.4em;
  height: 1em;
  object-fit: cover;
  border-radius: 2px;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.15);
}
</style>
