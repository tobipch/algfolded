<script setup>
import {Collapse} from "bootstrap";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";

const selected = useSelectedStore();
const algset = useAlgsetStore();

// Expand / collapse every group (and subgroup) collapse on the page at once.
const setAllCollapses = (show) => {
  document.querySelectorAll(".group-grid .multi-collapse").forEach((el) => {
    const inst = Collapse.getOrCreateInstance(el, {toggle: false});
    show ? inst.show() : inst.hide();
  });
};
</script>

<template>
  <div class="select-toolbar d-flex align-items-center gap-2 flex-wrap py-2 mb-2">
    <span class="fw-semibold">{{ $t("nav.n_cases", selected.totalCasesSelected()) }}</span>
    <div class="ms-auto d-flex align-items-center gap-1">
      <button class="btn btn-sm btn-outline-primary" tabindex="-1" @keydown.space.prevent=""
              :disabled="!algset.loaded" @click="selected.selectAll()">
        {{ $t("select.all") }}
      </button>
      <button class="btn btn-sm btn-outline-secondary" tabindex="-1" @keydown.space.prevent=""
              :disabled="selected.totalCasesSelected() === 0" @click="selected.deselectAll()">
        {{ $t("select.none") }}
      </button>
      <button v-if="selected.canAddInverses()" class="btn btn-sm btn-outline-secondary" tabindex="-1"
              @keydown.space.prevent="" :title="$t('select.add_inverses_title')"
              :disabled="selected.totalCasesSelected() === 0" @click="selected.addInverses()">
        {{ $t("select.add_inverses") }}
      </button>
      <span class="vr mx-1"></span>
      <button class="btn btn-sm btn-outline-secondary" tabindex="-1" @keydown.space.prevent=""
              :title="$t('select.expand_all')" @click="setAllCollapses(true)">
        <i class="bi bi-arrows-expand"></i>
      </button>
      <button class="btn btn-sm btn-outline-secondary" tabindex="-1" @keydown.space.prevent=""
              :title="$t('select.collapse_all')" @click="setAllCollapses(false)">
        <i class="bi bi-arrows-collapse"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.select-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bs-body-bg);
  border-bottom: 1px solid var(--bs-border-color);
  /* span the full card width: cancel the card-body's horizontal padding and
     re-add it as our own, so no content scrolls past beside the sticky bar */
  margin-left: calc(-1 * var(--bs-card-spacer-x, 1rem));
  margin-right: calc(-1 * var(--bs-card-spacer-x, 1rem));
  padding-left: var(--bs-card-spacer-x, 1rem);
  padding-right: var(--bs-card-spacer-x, 1rem);
}
</style>
