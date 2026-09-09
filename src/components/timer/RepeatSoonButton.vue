<script setup>
import {computed} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";

// "Didn't know this case" — temporarily boosts the case in smart case
// selection so it comes up again sooner. Lives next to the case's algorithms
// so it's always clear which case it applies to; click again to undo.
const props = defineProps(['caseKey']);
const session = useSessionStore();
const settings = useSettingsStore();

const visible = computed(() =>
    !!props.caseKey && settings.store.smartSelection && session.store.mode !== 'recap')
const active = computed(() => props.caseKey in session.didntKnowMap)
const onClick = () => {
  if (active.value) session.unflagDidntKnow(props.caseKey)
  else session.flagDidntKnow(props.caseKey)
}
</script>

<template>
  <button
      v-if="visible"
      class="btn btn-sm repeat-soon-btn"
      :class="{ active }"
      tabindex="-1"
      :title="$t('result_card.repeat_soon_tooltip') + ' (Alt+F)'"
      @click.stop="onClick"
      @keydown.space.prevent="">
    <i class="bi" :class="active ? 'bi-check-circle-fill' : 'bi-arrow-repeat'"></i>
    {{ $t("result_card.repeat_soon") }}
  </button>
</template>

<style scoped>
.repeat-soon-btn {
  /* readable in both modes — see --alg-quiet-* in theme.css */
  color: var(--alg-quiet-color, #4a5163);
  border-color: var(--alg-quiet-border, #8087a0);
}
.repeat-soon-btn:hover,
.repeat-soon-btn:focus-visible {
  color: var(--bs-body-color);
  border-color: var(--bs-danger);
  background: var(--alg-quiet-hover-bg, transparent);
}
.repeat-soon-btn.active {
  color: var(--bs-danger);
  border-color: var(--bs-danger);
  background: var(--alg-quiet-hover-bg, transparent);
}
</style>
