<script setup>
import {computed, onMounted, onUnmounted} from "vue";
import {useRouter} from "vue-router";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import SideAccordion from "@/components/select_view/SideAccordion.vue";
import {CASES_PER_PAGE} from "@/helpers/flow_timing";
import {useI18n} from "vue-i18n";

const {t} = useI18n()

const router = useRouter();
const selected = useSelectedStore();
const session = useSessionStore()
const algset = useAlgsetStore()
const settings = useSettingsStore()
// also disabled until the active set's cases have loaded (scrambles need them)
const btnDisabled = computed(() => selected.totalCasesSelected() === 0 || !algset.loaded)

const mode = computed({
  get: () => session.store.mode,
  set: (m) => { session.store.mode = m },
})
const isFlow = computed(() => mode.value === 'flow')

const flowPages = computed({
  get: () => settings.store.flowPages,
  set: (v) => { settings.store.flowPages = Math.max(1, Math.floor(Number(v)) || 1) },
})

// "start" runs whichever mode the pills have selected.
const start = () => {
  if (btnDisabled.value) return
  if (mode.value === 'recap') {
    session.startRecap()
    router.push('timer')
  } else if (mode.value === 'flow') {
    router.push('flow')
  } else {
    session.store.mode = 'practice'
    router.push('timer')
  }
}

const startIn = (m) => { mode.value = m; start() }

// The start button explains whichever mode is armed, with its shortcut.
const startTitle = computed(() => {
  if (mode.value === 'recap') return t('select.recap_btn_title') + ' (Alt+R)'
  if (mode.value === 'flow') return t('select.flow_btn_title') + ' (Alt+F)'
  return t('select.practice_btn_title') + ' (Alt+T)'
})

// Alt+R and Alt+F start recap / flow straight from the selection screen.
// Alt+T (toggle to the timer) stays where it is, in SelectView.
const onKeyDown = (e) => {
  if (!e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'r') { e.preventDefault(); startIn('recap') }
  else if (key === 'f') { e.preventDefault(); startIn('flow') }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="card mt-1">
    <div class="card-body">
      <div class="btn-group w-100 my-1" role="group" :aria-label="$t('select.mode')">
        <input class="btn-check" type="radio" id="modePractice" value="practice" v-model="mode"
               tabindex="-1" autocomplete="off">
        <label class="btn btn-outline-primary" for="modePractice"
               :title="$t('select.practice_btn_title')">{{ $t("select.mode_practice") }}</label>

        <input class="btn-check" type="radio" id="modeRecap" value="recap" v-model="mode"
               tabindex="-1" autocomplete="off">
        <label class="btn btn-outline-primary" for="modeRecap"
               :title="$t('select.recap_btn_title') + ' (Alt+R)'">{{ $t("select.mode_recap") }}</label>

        <input class="btn-check" type="radio" id="modeFlow" value="flow" v-model="mode"
               tabindex="-1" autocomplete="off">
        <label class="btn btn-outline-primary" for="modeFlow"
               :title="$t('select.flow_btn_title') + ' (Alt+F)'">{{ $t("select.mode_flow") }}</label>
      </div>

      <template v-if="isFlow">
        <p class="text-muted small my-1 mb-2">
          {{ $t("select.flow_explainer", {n: CASES_PER_PAGE}) }}
        </p>
        <div class="d-flex align-items-center gap-2 my-1">
          <label class="form-label mb-0 flex-grow-1 small" for="flowPagesInput">
            {{ $t("select.flow_pages", {n: CASES_PER_PAGE}) }}
          </label>
          <input
              id="flowPagesInput"
              class="form-control form-control-sm flow-pages"
              type="number"
              min="1"
              step="1"
              tabindex="-1" @keydown.space.prevent=""
              v-model.number="flowPages">
        </div>
      </template>

      <button
          class="form-control my-1 btn btn-primary"
          tabindex="-1"
          :title="startTitle"
          :disabled="btnDisabled"
          @click="start"
          @keydown.space.prevent=""
      >
        {{ $t("select.practice") }}
      </button>

      <!-- the timer has no meaning in flow: cases are measured by the cube -->
      <div v-if="!isFlow" class="form-check my-1" :title="$t('select.timed_title')">
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
.flow-pages {
  width: 5rem;
  flex: none;
}
</style>
