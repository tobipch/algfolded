import { ref } from 'vue'
import { defineStore } from 'pinia'

// Open/close state for the global command palette (Alt+K / navbar button).
// `initialQuery` lets an opener pre-fill the box (e.g. the wildcard button
// could open it primed with "*").
export const useCommandPaletteStore = defineStore('commandPalette', () => {
  const open = ref(false)
  const initialQuery = ref('')

  const openPalette = (query = '') => { initialQuery.value = query; open.value = true }
  const close = () => { open.value = false }
  const toggle = () => { open.value ? close() : openPalette() }

  return { open, initialQuery, openPalette, close, toggle }
})
