<script setup>
import {computed, onUnmounted, ref} from "vue";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {displayAlg} from "@/helpers/scramble_utils";
import {copyToClipboard} from "@/helpers/helpers";

// A non-interruptive "I forgot the alg" card: shows the case's preferred
// algorithm large, plus any alternatives below it. Triggered by the help
// button, the L4 cube gesture or Alt+H — never touches the timer.
const props = defineProps(['caseKey']);
const algset = useAlgsetStore();
const custom = useCustomAlgsStore();
const prefs = usePreferredAlgStore();
const settings = useSettingsStore();

const label = computed(() => algset.caseLabel(props.caseKey))
const secondary = computed(() => algset.caseSecondary(props.caseKey))
const algs = computed(() => custom.mergedAlgs(props.caseKey))
const preferred = computed(() => prefs.resolvePreferred(props.caseKey, algs.value))
const others = computed(() => algs.value.filter(a => a !== preferred.value))
const show = (alg) => displayAlg(alg, settings.store.algNotation)

// Copy an alg straight off the hint card — mid-solve this is the one place the
// alg is on screen, so it shouldn't need a detour through the result card.
const copiedAlg = ref(null)
let copiedTimer = null
const copyAlg = async (alg) => {
  if (!await copyToClipboard(show(alg))) return
  copiedAlg.value = alg
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copiedAlg.value = null }, 1500)
}
onUnmounted(() => { if (copiedTimer) clearTimeout(copiedTimer) })
</script>

<template>
  <div class="alg-hint" role="status">
    <div class="alg-hint-head">
      <span class="alg-hint-label">{{ label }}</span>
      <small v-if="secondary" class="alg-hint-secondary">{{ secondary }}</small>
    </div>
    <div v-if="preferred" class="alg-hint-main font-monospace alg-hint-row">
      <span>{{ show(preferred) }}</span>
      <button
          type="button"
          class="copy-btn"
          :class="{copied: copiedAlg === preferred}"
          :title="copiedAlg === preferred ? $t('result_card.copy_alg_copied') : $t('result_card.copy_alg_title')"
          :aria-label="$t('result_card.copy_alg_title')"
          tabindex="-1"
          @click.stop="copyAlg(preferred)">
        <i class="bi" :class="copiedAlg === preferred ? 'bi-check-lg' : 'bi-clipboard'"/>
      </button>
    </div>
    <div v-else class="alg-hint-none fst-italic">{{ $t('select.no_alg') }}</div>
    <ul v-if="others.length" class="alg-hint-others font-monospace">
      <li v-for="a in others" :key="a" class="alg-hint-row">
        <span>{{ show(a) }}</span>
        <button
            type="button"
            class="copy-btn"
            :class="{copied: copiedAlg === a}"
            :title="copiedAlg === a ? $t('result_card.copy_alg_copied') : $t('result_card.copy_alg_title')"
            :aria-label="$t('result_card.copy_alg_title')"
            tabindex="-1"
            @click.stop="copyAlg(a)">
          <i class="bi" :class="copiedAlg === a ? 'bi-check-lg' : 'bi-clipboard'"/>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.alg-hint {
  margin: 0.5rem auto 0;
  max-width: 640px;
  padding: 0.75rem 1rem;
  border: 1px solid var(--bs-border-color);
  border-left: 4px solid var(--bs-primary);
  border-radius: 8px;
  background: var(--bs-body-bg);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  text-align: center;
  animation: alg-hint-in 0.18s ease-out;
}
@keyframes alg-hint-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
.alg-hint-head {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}
.alg-hint-label {
  font-weight: 700;
  font-size: 1.1rem;
}
.alg-hint-secondary {
  opacity: 0.7;
}
.alg-hint-main {
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.alg-hint-none {
  opacity: 0.6;
}
.alg-hint-others {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0.4rem 0 0;
  border-top: 1px solid var(--bs-border-color);
  font-size: 0.9rem;
  opacity: 0.8;
  overflow-wrap: anywhere;
}
.alg-hint-others li {
  padding: 1px 0;
}
/* the alg text plus its copy button, centred as one unit */
.alg-hint-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}
/* mirror the button's footprint on the left so the alg itself stays optically
   centred in the card rather than sitting half a button off to the side */
.alg-hint-row::before {
  content: '';
  flex: none;
  width: calc(0.85em + 4px);
}
.copy-btn {
  border: 0;
  background: none;
  color: inherit;
  flex: none;
  line-height: 1;
  padding: 0 2px;
  font-size: 0.85em;
  /* only on hover, so the card stays a clean read while solving */
  opacity: 0;
  transition: opacity 0.12s ease-in-out;
}
.alg-hint-row:hover .copy-btn,
.copy-btn:focus-visible,
.copy-btn.copied {
  opacity: 0.65;
}
.alg-hint-row:hover .copy-btn:hover,
.copy-btn:focus-visible {
  opacity: 1;
}
.copy-btn.copied {
  opacity: 1;
  color: var(--bs-success);
}
@media (hover: none) {
  .copy-btn {
    opacity: 0.65;
  }
}
</style>
