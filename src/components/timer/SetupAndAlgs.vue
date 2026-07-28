<script setup>
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {computed, onUnmounted, ref, watch} from "vue";
import {inverseScramble, algToMoveString, displayAlg} from "@/helpers/scramble_utils";
import {isValidAlg} from "@/helpers/alg_match";
import {copyToClipboard} from "@/helpers/helpers";
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

// Algs pulled above the display cutoff on demand — an entry the input turned
// out to duplicate, which is usually buried in the hidden tail of the list.
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

// Copy an alg as it is shown (so the notation setting decides what lands on
// the clipboard). The button confirms itself with a checkmark for a moment.
const copiedAlg = ref(null)
let copiedTimer = null
const copyAlg = async (alg) => {
  if (!await copyToClipboard(show(alg))) return
  copiedAlg.value = alg
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copiedAlg.value = null }, 1500)
}
onUnmounted(() => { if (copiedTimer) clearTimeout(copiedTimer) })

// --- "add your own alg" input ---
const newAlg = ref('')
// Outcome of the last add attempt, one of:
//   {kind: 'unparseable'}          — no usable moves in the input
//   {kind: 'duplicate', alg}       — collides with an alg already on screen
//   {kind: 'revealed', alg}        — collided with one hidden past the cutoff
// Only the first two are errors. A collision with a hidden alg isn't the
// user's mistake — nothing on screen said the alg was already there — so it
// just scrolls into the list highlighted instead of complaining.
const addResult = ref(null)
const isError = computed(() =>
    addResult.value !== null && addResult.value.kind !== 'revealed')

const clearResult = () => { addResult.value = null }

const addAlg = () => {
  const cleaned = newAlg.value.replace(/[()]/g, ' ').trim().replace(/\s+/g, ' ')
  if (!cleaned) return
  if (!isValidAlg(cleaned)) {
    addResult.value = {kind: 'unparseable'}
    return
  }
  const clash = custom.blockingAlg(props.caseKey, cleaned)
  if (clash) {
    // Visible already? Then the list contradicts the input and saying so is
    // the helpful answer; keep the text so it can be edited.
    if (suggestedAlgs.value.includes(clash)) {
      addResult.value = {kind: 'duplicate', alg: clash}
      return
    }
    revealed.value = new Set([...revealed.value, clash])
    newAlg.value = ''
    addResult.value = {kind: 'revealed', alg: clash}
    return
  }
  custom.addAlg(props.caseKey, cleaned)
  newAlg.value = ''
  addResult.value = null
}

// Switching case: the message and the revealed tail belong to the old one.
watch(() => props.caseKey, () => {
  addResult.value = null
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
          :class="[
            alg === preferred ? 'fw-bold preferred' : '',
            {clash: addResult?.kind === 'duplicate' && addResult.alg === alg},
            {'just-revealed': addResult?.kind === 'revealed' && addResult.alg === alg},
          ]"
          @click="onAlgClick(alg)"
      >
        <i class="bi me-1" :class="alg === preferred ? 'bi-check-circle-fill text-success' : 'bi-circle opacity-50'"/>
        <span class="alg-text">{{show(alg)}}</span>
        <i
            v-if="custom.isCustom(props.caseKey, alg)"
            class="bi bi-person-fill ms-1 opacity-50"
            :title="$t('result_card.custom_alg_title')"/>
        <span class="ms-auto d-flex align-items-center gap-1 row-actions">
          <button
              type="button"
              class="action-btn"
              :class="{copied: copiedAlg === alg}"
              :title="copiedAlg === alg ? $t('result_card.copy_alg_copied') : $t('result_card.copy_alg_title')"
              :aria-label="$t('result_card.copy_alg_title')"
              tabindex="-1"
              @click.stop="copyAlg(alg)">
            <i class="bi" :class="copiedAlg === alg ? 'bi-check-lg' : 'bi-copy'"/>
          </button>
          <button
              v-if="props.playable"
              type="button"
              class="action-btn"
              :title="$t('result_card.play_alg_title')"
              :aria-label="$t('result_card.play_alg_title')"
              tabindex="-1"
              @click.stop="emit('play', alg)">
            <i class="bi bi-play-circle"/>
          </button>
          <button
              v-if="custom.isCustom(props.caseKey, alg)"
              type="button"
              class="action-btn text-danger"
              :title="$t('result_card.delete_alg_title')"
              :aria-label="$t('result_card.delete_alg_title')"
              tabindex="-1"
              @click.stop="removeCustom(alg)">
            <i class="bi bi-trash"/>
          </button>
        </span>
      </li>
    </ul>
    <div class="input-group input-group-sm add-alg">
      <input
          v-model="newAlg"
          type="text"
          class="form-control themed font-monospace"
          :class="{'is-invalid': isError}"
          maxlength="120"
          :placeholder="$t('result_card.add_alg_placeholder')"
          @input="clearResult"
          @keydown.enter.prevent="addAlg"
          @keydown.stop
      >
      <button class="btn btn-outline-secondary" :title="$t('result_card.add_alg_btn')" @click="addAlg">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
    <div v-if="isError" class="add-alg-error text-danger small mt-1">
      <template v-if="addResult.kind === 'duplicate'">{{ $t('result_card.add_alg_duplicate') }}</template>
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
/* the visible alg a rejected input turned out to be a duplicate of */
.alg-item.clash {
  background: rgba(var(--bs-danger-rgb), 0.12);
  outline: 1px solid rgba(var(--bs-danger-rgb), 0.5);
}
/* one pulled up from the hidden tail — not an error, so no danger colour */
.alg-item.just-revealed {
  background: rgba(var(--bs-primary-rgb), 0.14);
  outline: 1px solid rgba(var(--bs-primary-rgb), 0.5);
}
.alg-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.action-btn {
  border: 0;
  background: none;
  color: inherit;
  line-height: 1;
  padding: 0 2px;
  /* hidden until the row is hovered, so the list stays quiet to read; the
     reserved width keeps the text from shifting when they appear */
  opacity: 0;
  transition: opacity 0.12s ease-in-out;
}
.alg-item:hover .action-btn,
.action-btn:focus-visible,
.action-btn.copied {
  opacity: 0.65;
}
.alg-item:hover .action-btn:hover,
.action-btn:focus-visible {
  opacity: 1;
}
.action-btn.copied {
  opacity: 1;
  color: var(--bs-success);
}
/* touch devices never hover — keep the actions permanently available there */
@media (hover: none) {
  .action-btn {
    opacity: 0.65;
  }
}
.add-alg {
  max-width: 340px;
}
.add-alg-error {
  max-width: 340px;
  overflow-wrap: anywhere;
}
</style>
