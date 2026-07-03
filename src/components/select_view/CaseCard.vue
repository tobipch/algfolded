<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {useNotesStore} from "@/stores/NotesStore";
import {computed, ref} from "vue";
import CaseInfoModal from "@/components/select_view/CaseInfoModal.vue";

// `node` is a leaf node of the algset tree; node.caseId is the case key.
const props = defineProps(['node']);
const key = computed(() => props.node.caseId)
const selected = useSelectedStore();
const algset = useAlgsetStore();
const ls = useLetterSchemeStore();
const notes = useNotesStore();

const caseLevel = computed(() => algset.active.levels[algset.active.levels.length - 1])
const display = computed(() => caseLevel.value.display(props.node.value, {toLetter: s => ls.toLetter(s)}))

const is_selected = computed(() => selected.isCaseSelected(key.value));

const onCardClicked = () => {
  const action = is_selected.value ? selected.removeCase : selected.addCase
  action(key.value);
}

const note = computed(() => notes.store[key.value] ?? '')

const infoShown = ref(false)
</script>

<template>
  <div
      class="case-card clickable rounded-2 p-2 flex-fill d-flex flex-column noselect"
      :class="{'case-selected': is_selected}"
      :title="$t('result_card.selected_title')"
      @click="onCardClicked">
    <div class="d-flex align-items-baseline">
      <span class="fs-5 fw-bold lh-sm">{{ display.primary }}</span>
      <small class="ms-1 opacity-75 text-truncate">{{ display.secondary }}</small>
      <span class="ms-auto ps-1 d-flex align-items-center gap-1 flex-shrink-0">
        <i
            class="bi bi-info-circle info-btn"
            :title="$t('select.case_info_title')"
            @click.stop="infoShown = true"></i>
        <i class="bi select-mark" :class="is_selected ? 'bi-check-circle-fill' : 'bi-circle'"></i>
      </span>
    </div>
    <div v-if="note" class="meta text-truncate mt-auto pt-1" :title="note">
      <i class="bi bi-chat-left-text"></i> {{ note }}
    </div>
  </div>
  <CaseInfoModal v-if="infoShown" :caseKey="key" :closeCallback="() => infoShown=false"/>
</template>

<style scoped>
.case-card {
  border: 1px solid var(--bs-border-color);
  background-color: var(--bs-body-bg);
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  /* stay inside the grid column and let the truncated lines actually shrink */
  width: 100%;
  min-width: 0;
}

/* flex items refuse to shrink below their content without this */
.case-card .text-truncate {
  min-width: 0;
}

.case-card:hover {
  border-color: rgba(var(--bs-primary-rgb), 0.55);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
}

/* selected: soft success tint + coloured border instead of a solid fill, so
   the text keeps normal contrast in both light and dark mode */
.case-selected {
  border-color: rgba(var(--bs-success-rgb), 0.8);
  background-color: rgba(var(--bs-success-rgb), 0.13);
}

.case-selected:hover {
  border-color: var(--bs-success);
}

.select-mark {
  opacity: 0.35;
}

.case-selected .select-mark {
  color: var(--bs-success);
  opacity: 1;
}

.info-btn {
  opacity: 0.55;
}

.info-btn:hover {
  opacity: 1;
  color: var(--bs-primary);
}

.meta {
  font-size: 0.75rem;
  opacity: 0.75;
}

/* dark mode: raise the card slightly above the well's tinted background */
:root[data-mode="dark"] .case-card {
  background-color: rgba(255, 255, 255, 0.04);
}

:root[data-mode="dark"] .case-selected {
  background-color: rgba(var(--bs-success-rgb), 0.16);
}
</style>
