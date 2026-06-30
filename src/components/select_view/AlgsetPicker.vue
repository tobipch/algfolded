<script setup>
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {ALGSETS} from "@/algsets/registry";

const algset = useAlgsetStore();
const onChange = (e) => algset.activate(e.target.value);
</script>

<template>
  <div class="d-flex align-items-center gap-2 mb-3">
    <label class="form-label mb-0 text-muted">{{ $t("select.algset") }}</label>
    <select
        class="form-select form-select-sm w-auto"
        :value="algset.activeId"
        @change="onChange"
        tabindex="-1" @keydown.space.prevent="">
      <option v-for="s in ALGSETS" :key="s.id" :value="s.id">{{ $t(s.name) }}</option>
    </select>
  </div>
</template>

<style scoped>
</style>
