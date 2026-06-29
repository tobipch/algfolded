<script setup>
import MainCaseGrid from "@/components/select_view/MainCaseGrid.vue";
import SelectSideCard from "@/components/select_view/SelectSideCard.vue";
import Settings from "@/components/Settings.vue";
import {useRouter} from "vue-router";
import {onMounted} from "vue";
import {useDisplayStore} from "@/stores/DisplayStore";

const router = useRouter();
const displayStore = useDisplayStore()
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
  <div v-if="displayStore.showSettings" class="mt-2">
    <Settings/>
  </div>
  <div class="mt-1">
    <SelectSideCard/>
  </div>
  <div class="card mt-2 mb-2">
    <div class="card-body">
      <p class="text-muted mb-2">{{ $t("select.select_intro") }}</p>
      <MainCaseGrid/>
    </div>
  </div>
</template>

<style scoped>
</style>