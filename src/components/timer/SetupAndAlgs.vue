<script setup>
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {computed, ref} from "vue";
import {inverseScramble, algToMoveString} from "@/helpers/scramble_utils";
import {isValidAlg} from "@/helpers/alg_match";

// `playable`: show a play button per alg and emit 'play' with the alg —
// the parent (case info modal) animates it on its twisty player.
const props = defineProps(['caseKey', 'maxAmount', 'playable']);
const emit = defineEmits(['play']);
const algset = useAlgsetStore();
const prefs = usePreferredAlgStore();
const custom = useCustomAlgsStore();

const collectionAlgs = computed(() => algset.byId[props.caseKey]?.algs ?? [])
const algs = computed(() => custom.mergedAlgs(props.caseKey))

// The alg the user picked for this case; falls back to the collection's first.
const preferred = computed(() => {
  const p = prefs.store[props.caseKey]
  return p && algs.value.includes(p) ? p : (algs.value[0] ?? null)
})

// Keep the collection order (capped at maxAmount), but always show the
// user's own algs and keep the preferred alg visible past the cutoff.
const suggestedAlgs = computed(() => {
  const list = collectionAlgs.value.slice(0, props.maxAmount)
  for (const a of custom.algsFor(props.caseKey)) list.push(a)
  if (preferred.value && !list.includes(preferred.value)) list.push(preferred.value)
  return list
})

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
const inputInvalid = ref(false)
const addAlg = () => {
  const cleaned = newAlg.value.replace(/[()]/g, ' ').trim()
  if (!cleaned) return
  if (!isValidAlg(cleaned) || !custom.addAlg(props.caseKey, cleaned)) {
    inputInvalid.value = true // unparseable or (canonical) duplicate
    return
  }
  newAlg.value = ''
  inputInvalid.value = false
}
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
          :class="alg === preferred ? 'fw-bold preferred' : ''"
          @click="onAlgClick(alg)"
      >
        <i class="bi me-1" :class="alg === preferred ? 'bi-check-circle-fill text-success' : 'bi-circle opacity-50'"/>
        <span class="alg-text">{{alg}}</span>
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
          :class="{'is-invalid': inputInvalid}"
          maxlength="120"
          :placeholder="$t('result_card.add_alg_placeholder')"
          @input="inputInvalid = false"
          @keydown.enter.prevent="addAlg"
          @keydown.stop
      >
      <button class="btn btn-outline-secondary" :title="$t('result_card.add_alg_btn')" @click="addAlg">
        <i class="bi bi-plus-lg"></i>
      </button>
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
</style>
