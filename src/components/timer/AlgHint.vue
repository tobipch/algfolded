<script setup>
import {computed} from "vue";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";

// A non-interruptive "I forgot the alg" card: shows the case's preferred
// algorithm large, plus any alternatives below it. Triggered by the help
// button, the L4 cube gesture or Alt+H — never touches the timer.
const props = defineProps(['caseKey']);
const algset = useAlgsetStore();
const custom = useCustomAlgsStore();
const prefs = usePreferredAlgStore();

const label = computed(() => algset.caseLabel(props.caseKey))
const secondary = computed(() => algset.caseSecondary(props.caseKey))
const algs = computed(() => custom.mergedAlgs(props.caseKey))
const preferred = computed(() => {
  const p = prefs.store[props.caseKey]
  return p && algs.value.includes(p) ? p : (algs.value[0] ?? null)
})
const others = computed(() => algs.value.filter(a => a !== preferred.value))
</script>

<template>
  <div class="alg-hint" role="status">
    <div class="alg-hint-head">
      <span class="alg-hint-label">{{ label }}</span>
      <small v-if="secondary" class="alg-hint-secondary">{{ secondary }}</small>
    </div>
    <div v-if="preferred" class="alg-hint-main font-monospace">{{ preferred }}</div>
    <div v-else class="alg-hint-none fst-italic">{{ $t('select.no_alg') }}</div>
    <ul v-if="others.length" class="alg-hint-others font-monospace">
      <li v-for="a in others" :key="a">{{ a }}</li>
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
</style>
