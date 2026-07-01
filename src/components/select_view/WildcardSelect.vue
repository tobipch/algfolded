<script setup>
import {ref} from "vue";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";

const selected = useSelectedStore();
const algset = useAlgsetStore();

const pattern = ref("");
const lastCount = ref(null); // number of cases matched by the last apply, or null

// Deselect all, then select the cases matching the wildcard pattern.
const apply = () => {
  if (!pattern.value.trim() || !algset.loaded) return;
  lastCount.value = selected.selectByPattern(pattern.value);
};
</script>

<template>
  <div class="mb-2">
    <div class="input-group input-group-sm" style="max-width: 460px">
      <span class="input-group-text"><i class="bi bi-asterisk"></i></span>
      <input
          v-model="pattern"
          class="form-control"
          :placeholder="$t('select.wildcard_placeholder')"
          :title="$t('select.wildcard_hint')"
          @keydown.enter="apply"
      />
      <button class="btn btn-outline-primary" type="button" @click="apply">
        {{ $t("select.wildcard_apply") }}
      </button>
    </div>
    <small class="text-muted d-block mt-1">
      <template v-if="lastCount !== null">
        {{ $t(lastCount === 1 ? "select.wildcard_result_one" : "select.wildcard_result_other", { count: lastCount }) }}
      </template>
      <template v-else>{{ $t("select.wildcard_hint") }}</template>
    </small>
  </div>
</template>

<style scoped>
</style>
