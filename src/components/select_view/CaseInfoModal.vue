<script setup>
import {computed, onMounted, ref} from "vue";
import {Modal} from 'bootstrap'
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import CaseInfo from "@/components/select_view/CaseInfo.vue";

const props = defineProps(['caseKey', 'closeCallback']);
const algset = useAlgsetStore();
const selected = useSelectedStore();

const secondary = computed(() => algset.caseSecondary(props.caseKey))

// select/deselect the case right from the modal
const isSelectedCheckbox = computed({
  get: () => selected.isCaseSelected(props.caseKey),
  set: (v) => {
    const action = v ? selected.addCase : selected.removeCase
    action(props.caseKey)
  }
})

const infoModal = ref(null)

// when the component is mounted (via v-if), show this modal right away and destroy (via callback) on close
onMounted(() => {
  const m = new Modal(infoModal.value);
  m.show();
  infoModal.value.addEventListener('hidden.bs.modal', props.closeCallback)
})
</script>

<template>
  <div class="modal" ref="infoModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
<!-- text-start: the modal node can sit inside the group's text-center well -->
      <div class="modal-content text-start">
        <div class="modal-header py-2">
          <div class="d-flex align-items-baseline title-block">
            <h5 class="modal-title fw-bold">{{ algset.caseLabel(props.caseKey) }}</h5>
            <small v-if="secondary" class="ms-2 opacity-75 text-truncate">{{ secondary }}</small>
          </div>
          <div class="form-check ms-auto me-3 mb-0">
            <label class="form-check-label text-nowrap" :title="$t('result_card.selected_title')">
              <input class="form-check-input styled" type="checkbox" v-model="isSelectedCheckbox">
              {{ $t("result_card.selected") }}
            </label>
          </div>
          <button type="button" class="btn-close ms-0" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <CaseInfo :caseKey="props.caseKey"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-block {
  min-width: 0;
}
</style>
