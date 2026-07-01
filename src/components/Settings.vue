<script setup>
import {useSettingsStore} from "@/stores/SettingsStore";
import LetterSchemeEditor from "@/components/LetterSchemeEditor.vue";
import BufferOrderEditor from "@/components/BufferOrderEditor.vue";
import {useI18n} from 'vue-i18n'
import {useRouter, useRoute} from "vue-router";

const {t} = useI18n()
const settings = useSettingsStore()
const router = useRouter()
const route = useRoute()

const onResetBtnClicked = () => {
  if (confirm(t("settings.are_you_sure_to_reset"))) {
    settings.resetDefaults()
  }
}

// Return to wherever settings was opened from (e.g. the trainer), defaulting to
// the selection page.
const onDoneBtnClicked = () => router.push({name: route.query.from === 'timer' ? 'timer' : 'select'})
</script>

<template>
  <div class="card"><div class="card-body">
    <div class="d-lg-flex d-block align-items-center mb-3">
      <span class="h2 flex-grow-1">{{ $t("settings.settings_title") }}</span>
      <div class="d-lg-none d-block"><br></div>
      <button class="mx-2 btn btn-warning" @click="onResetBtnClicked">{{ $t("settings.reset_btn") }}</button>
      <button class="mx-2 btn btn-success" @click="onDoneBtnClicked">{{ $t("settings.done_btn") }}
      </button>
    </div>
    <hr>
    <form>

      <div class="mb-2">
        <label for="scrambleFontSize" class="form-label">{{ $t("settings.scramble_size") }}</label>
        <input
            type="number"
            min="1" max="999" maxlength="3" size="5"
            class="mx-2" tabindex="-1" @keydown.space.prevent=""
            v-model.number="settings.store.scrambleFontSize" id="scrambleFontSize"/>
      </div>

      <div class="mb-2">
        <label for="timerFontSize" class="form-label">{{ $t("settings.timer_size") }}</label>
        <input
            type="number"
            min="1" max="999" maxlength="3" size="5"
            class="mx-2" tabindex="-1" @keydown.space.prevent=""
            v-model.number="settings.store.timerFontSize" id="timerFontSize"/>
      </div>

      <div class="mb-2">
        <label for="timerUpdate" class="form-label">{{ $t("settings.timer_update") }}</label>
        <select
            v-model="settings.store.timerUpdate"
            class="mx-2" tabindex="-1" @keydown.space.prevent=""
            id="timerUpdate">
          <option value="on">{{ $t("settings.timer_update_on") }}</option>
          <option value="seconds">{{ $t("settings.timer_update_seconds") }}</option>
          <option value="off">{{ $t("settings.timer_update_off") }}</option>
        </select>
      </div>

      <div class="mb-2">
        <label for="timerPrecision" class="form-label">{{ $t("settings.timer_precision") }}</label>
        <select
            class="mx-2" tabindex="-1" @keydown.space.prevent=""
            v-model.number="settings.store.timerPrecision" id="timerPrecision">
          <option value="1">1/10</option>
          <option value="2">1/100</option>
          <option value="3">1/1000</option>
        </select>
      </div>

      <div class="mb-2">
        <label for="timerStartDelayMs" class="form-label">{{ $t("settings.timer_start_delay_ms") }}</label>
        <select
            class="mx-2" tabindex="-1" @keydown.space.prevent=""
            v-model.number="settings.store.timerStartDelayMs" id="timerStartDelayMs">
          <option value="0">0</option>
          <option value="100">100</option>
          <option value="300">300</option>
          <option value="500">500</option>
          <option value="1000">1000</option>
        </select>
      </div>

      <hr>
      <div class="mb-2">
        <label for="cubeOrientation" class="form-label">{{ $t("settings.cube_orientation") }}</label>
        <input
            type="text"
            class="mx-2 form-control form-control-sm d-inline-block"
            style="width: 160px"
            placeholder="e.g. x y"
            v-model="settings.store.cubeOrientation"
            @keydown.space.stop=""
            id="cubeOrientation"/>
        <small class="text-muted d-block mt-1">{{ $t("settings.cube_orientation_hint") }}</small>
      </div>

      <div class="mb-3">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" role="switch"
                 v-model="settings.store.letterPairMode" id="letterPairMode"
                 tabindex="-1" @keydown.space.prevent="">
          <label class="form-check-label" for="letterPairMode">{{ $t("settings.letterpair_mode") }}</label>
        </div>
        <small class="text-muted d-block mt-1">{{ $t("settings.letterpair_mode_hint") }}</small>
      </div>

      <div class="mb-3">
        <label class="form-label fw-bold">{{ $t("settings.letter_scheme") }}</label>
        <LetterSchemeEditor />
      </div>

      <div class="mb-3">
        <label class="form-label fw-bold">{{ $t("settings.buffer_order") }}</label>
        <small class="text-muted d-block mb-1">{{ $t("settings.buffer_order_hint") }}</small>
        <BufferOrderEditor setting-key="bufferOrder" />
      </div>

      <div class="mb-3">
        <label class="form-label fw-bold">{{ $t("settings.edge_buffer_order") }}</label>
        <small class="text-muted d-block mb-1">{{ $t("settings.edge_buffer_order_hint") }}</small>
        <BufferOrderEditor setting-key="edgeBufferOrder" />
      </div>
      <hr>

      <div class="mb-3">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" role="switch"
                 v-model="settings.store.smartSelection" id="smartSelection"
                 tabindex="-1" @keydown.space.prevent="">
          <label class="form-check-label" for="smartSelection">{{ $t("settings.smart_selection") }}</label>
        </div>
      </div>

    </form>
  </div></div>
</template>

<style scoped>
</style>