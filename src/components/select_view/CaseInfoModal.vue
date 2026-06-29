<script setup>
import {computed, onMounted, ref} from "vue";
import {Modal} from 'bootstrap'
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {parseLtctKey} from "@/helpers/helpers";
import CaseInfo from "@/components/select_view/CaseInfo.vue";

const props = defineProps(['caseKey', 'closeCallback']);
const ls = useLetterSchemeStore();
const parsed = computed(() => parseLtctKey(props.caseKey, ls.toLetter));

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
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ parsed.letters }}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <CaseInfo :caseKey="props.caseKey"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
