<script setup>
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {computed, ref, watch} from "vue";
import {inverseScramble, algToMoveString, displayAlg} from "@/helpers/scramble_utils";
import {isValidAlg} from "@/helpers/alg_match";
import {useSettingsStore} from "@/stores/SettingsStore";

// `playable`: show a play button per alg and emit 'play' with the alg —
// the parent (case info modal) animates it on its twisty player.
const props = defineProps(['caseKey', 'maxAmount', 'playable']);
const emit = defineEmits(['play']);
const prefs = usePreferredAlgStore();
const custom = useCustomAlgsStore();
const settings = useSettingsStore();

const algs = computed(() => custom.mergedAlgs(props.caseKey))

// Render an alg per the notation display setting (commutator vs expanded).
const show = (alg) => displayAlg(alg, settings.store.algNotation)

// The alg the user picked for this case; falls back to the collection's first.
const preferred = computed(() => prefs.resolvePreferred(props.caseKey, algs.value))

// Algs pulled above the display cutoff on demand — currently the entry a
// rejected input turned out to be a duplicate of, which is usually buried in
// the hidden tail of the list.
const revealed = ref(new Set())

// Keep the merged-list order (capped at maxAmount), but always show the
// user's own algs and keep the preferred / revealed algs visible past the cutoff.
const suggestedAlgs = computed(() => algs.value.filter((a, i) =>
    i < props.maxAmount || custom.isCustom(props.caseKey, a) || a === preferred.value
    || revealed.value.has(a)))

const setup = computed(() => preferred.value ? inverseScramble(algToMoveString(preferred.value)) : '')

// Click an alg to make it "yours"; clicking the current pick clears the choice.
const onAlgClick = (alg) => {
  prefs.setPreferred(props.caseKey, prefs.store[props.caseKey] === alg ? null : alg)
}

const removeCustom = (alg) => {
  custom.removeAlg(props.caseKey, alg)
  if (prefs.store[props.caseKey] === alg) prefs.setPreferred(props.caseKey, null)
}

// --- "add your own alg" input ---
const newAlg = ref('')
// Why the last attempt failed: null, {kind: 'unparseable'} or
// {kind: 'duplicate', alg}. Rejections used to only turn the field red, which
// is baffling for the common duplicate case — the alg it collides with is
// usually below the maxAmount cutoff, so nothing on screen explains it.
const addError = ref(null)

const clearError = () => { addError.value = null }

const addAlg = () => {
  const cleaned = newAlg.value.replace(/[()]/g, ' ').trim().replace(/\s+/g, ' ')
  if (!cleaned) return
  if (!isValidAlg(cleaned)) {
    addError.value = {kind: 'unparseable'}
    return
  }
  const clash = custom.blockingAlg(props.caseKey, cleaned)
  if (clash) {
    addError.value = {kind: 'duplicate', alg: clash}
    revealed.value = new Set([...revealed.value, clash]) // show what it collides with
    return
  }
  custom.addAlg(props.caseKey, cleaned)
  newAlg.value = ''
  addError.value = null
}

// Switching case: the message and the revealed tail belong to the old one.
watch(() => props.caseKey, () => {
  addError.value = null
  revealed.value = new Set()
})
</script>

<template>
  <template v-if="algs.length > 0">
    <div>{{ $t("result_card.setup_moves") }}: <strong>{{setup}}</strong></div>
    <div class="mt-2">
      {{ $t("result_card.algorithms_collection") }}:
      <small class="text-muted ms-1">{{ $t("result_card.choose_alg_hint") }}</small>
    </div>
  </template>
  <div v-else class="text-muted fst-italic">{{ $t("select.no_alg") }}</div>
  <div>
    <ul>
      <li
          v-for="alg in suggestedAlgs"
          :key="alg"
          class="alg-item d-flex align-items-center"
          :class="[alg === preferred ? 'fw-bold preferred' : '', {clash: addError?.alg === alg}]"
          @click="onAlgClick(alg)"
      >
        <i class="bi me-1" :class="alg === preferred ? 'bi-check-circle-fill text-success' : 'bi-circle opacity-50'"/>
        <span class="alg-text">{{show(alg)}}</span>
        <i
            v-if="custom.isCustom(props.caseKey, alg)"
            class="bi bi-person-fill ms-1 opacity-50"
            :title="$t('result_card.custom_alg_title')"/>
        <span class="ms-auto d-flex align-items-center gap-1 row-actions">
          <i
              v-if="props.playable"
              class="bi bi-play-circle action-icon"
              :title="$t('result_card.play_alg_title')"
              @click.stop="emit('play', alg)"/>
          <i
              v-if="custom.isCustom(props.caseKey, alg)"
              class="bi bi-trash action-icon text-danger"
              :title="$t('result_card.delete_alg_title')"
              @click.stop="removeCustom(alg)"/>
        </span>
      </li>
    </ul>
    <div class="input-group input-group-sm add-alg">
      <input
          v-model="newAlg"
          type="text"
          class="form-control themed font-monospace"
          :class="{'is-invalid': !!addError}"
          maxlength="120"
          :placeholder="$t('result_card.add_alg_placeholder')"
          @input="clearError"
          @keydown.enter.prevent="addAlg"
          @keydown.stop
      >
      <button class="btn btn-outline-secondary" :title="$t('result_card.add_alg_btn')" @click="addAlg">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
    <div v-if="addError" class="add-alg-error text-danger small mt-1">
      <template v-if="addError.kind === 'duplicate'">
        {{ $t('result_card.add_alg_duplicate') }}
        <span class="font-monospace">{{ show(addError.alg) }}</span>
      </template>
      <template v-else>{{ $t('result_card.add_alg_unparseable') }}</template>
    </div>
  </div>
</template>

<style scoped>
ul {
  list-style-type: none;
  padding-left: 0;
  margin-bottom: 0.5rem;
}
.alg-item {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
}
.alg-item:hover {
  background: var(--bs-secondary-bg, rgba(128, 128, 128, 0.15));
}
/* the listed alg a rejected input turned out to be a duplicate of */
.alg-item.clash {
  background: rgba(var(--bs-danger-rgb), 0.12);
  outline: 1px solid rgba(var(--bs-danger-rgb), 0.5);
}
.alg-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.action-icon {
  opacity: 0.55;
  padding: 0 2px;
}
.action-icon:hover {
  opacity: 1;
}
.add-alg {
  max-width: 340px;
}
.add-alg-error {
  max-width: 340px;
  overflow-wrap: anywhere;
}
</style>
