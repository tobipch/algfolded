import {ref} from 'vue'
import { defineStore } from 'pinia'


export const useDisplayStore = defineStore('display', () => {
  const showSettings = ref(false)
  const showStatistics = ref(false)

  // Toast notifications
  const toastMessage = ref('')
  const toastType = ref('info') // 'success' | 'danger' | 'info'
  const toastVisible = ref(false)
  let toastTimer = null

  const showToast = (message, type = 'info') => {
    toastMessage.value = message
    toastType.value = type
    toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastVisible.value = false }, 4000)
  }

  return {showSettings, showStatistics, toastMessage, toastType, toastVisible, showToast}
});
