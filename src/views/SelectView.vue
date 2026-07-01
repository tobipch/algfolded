<script setup>
import MainCaseGrid from "@/components/select_view/MainCaseGrid.vue";
import SelectSideCard from "@/components/select_view/SelectSideCard.vue";
import AlgsetPicker from "@/components/select_view/AlgsetPicker.vue";
import WildcardSelect from "@/components/select_view/WildcardSelect.vue";
import {useRouter} from "vue-router";
import {onMounted} from "vue";

const router = useRouter();
onMounted(() => {
  window.addEventListener('keydown', event => {
    if (event.key === "t" && event.altKey) {
      event.preventDefault()
      router.push('timer')
    }
  })
})

</script>

<template>
  <div class="mt-1">
    <SelectSideCard/>
  </div>
  <div class="card mt-2 mb-2">
    <div class="card-body">
      <AlgsetPicker/>
      <p class="text-muted mb-2">{{ $t("select.select_intro") }}</p>
      <WildcardSelect/>
      <MainCaseGrid/>
    </div>
  </div>
</template>

<style scoped>
</style>