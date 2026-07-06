<script setup>
import {computed} from "vue";
import {useRouter} from "vue-router";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import SideAccordion from "@/components/select_view/SideAccordion.vue";

const router = useRouter();
const selected = useSelectedStore();
const session = useSessionStore()
const algset = useAlgsetStore()
const settings = useSettingsStore()
// also disabled until the active set's cases have loaded (scrambles need them)
const btnDisabled = computed(() => selected.totalCasesSelected() === 0 || !algset.loaded)

const startPractice = () => {
  session.store.recapMode = false
  router.push('timer')
}

const startRecap = () => {
  session.startRecap()
  router.push('timer')
}

</script>

<template>
  <div class="card mt-1">
    <div class="card-body">
      <button
          class="form-control my-1 btn btn-primary"
          tabindex="-1"
          :title="$t('select.practice_btn_title') + ' (Alt+T)'"
          :disabled="btnDisabled"
          @click="startPractice"
          @keydown.space.prevent=""
      >
        {{ $t("select.practice") }}
      </button>
      <button
          class="form-control my-1 btn btn-outline-primary"
          tabindex="-1"
          :title="$t('select.recap_btn_title') + ' (Alt+R)'"
          :disabled="btnDisabled"
          @click="startRecap"
          @keydown.space.prevent=""
      >
        {{ $t("select.recap") }}
      </button>

      <div class="form-check my-1" :title="$t('select.timed_title')">
        <input
            class="form-check-input styled"
            type="checkbox"
            id="timedModeCheck"
            tabindex="-1" @keydown.space.prevent=""
            v-model="settings.store.timedMode">
        <label class="form-check-label" for="timedModeCheck">
          <i class="bi bi-stopwatch"></i>
          {{ $t("select.timed") }}
        </label>
      </div>

      <SideAccordion/>

    </div>
  </div>
</template>

<style scoped>
</style>