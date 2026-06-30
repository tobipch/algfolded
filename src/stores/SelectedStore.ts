import {reactive, watch} from 'vue'
import { defineStore } from 'pinia'
import { useAlgsetStore } from '@/stores/AlgsetStore'
import { casesUnder } from '@/algsets/selection'

const localStoreKey = "currentLtctArray";
const loadedArray: string[] = JSON.parse(localStorage.getItem(localStoreKey) || "[]")

export const useSelectedStore = defineStore('selected', () => {
  const algset = useAlgsetStore()

  const store = reactive<{ keys: string[] }>({
    keys: loadedArray,
  });

  const applyFromPreset = (presetKeysSet: Iterable<string>) => store.keys = [...presetKeysSet]

  // ---- generic, level-agnostic selection by hierarchy node (path prefix) ----
  // (may produce duplicate keys; callers guard via the "0 selected" check)
  const addNode = (prefix: string[]) => {
    store.keys = [...store.keys, ...casesUnder(algset.cases, prefix)]
  }
  const removeNode = (prefix: string[]) => {
    const under = new Set(casesUnder(algset.cases, prefix))
    store.keys = store.keys.filter(k => !under.has(k))
  }
  const numSelectedUnder = (prefix: string[]) => {
    const under = new Set(casesUnder(algset.cases, prefix))
    return store.keys.filter(k => under.has(k)).length
  }

  // ---- single case ----
  const addCase = (id: string) => {
    store.keys = [...store.keys, id] // if you just .push(), then freakin' VueJS won't track it
  }
  const removeCase = (id: string) => store.keys = store.keys.filter(k => k !== id)
  const isCaseSelected = (id: string) => store.keys.includes(id)
  const totalCasesSelected = () => store.keys.length

  const toggleSelected = (result: { key: string } | null | undefined) => {
    if (!result) return
    const action = isCaseSelected(result.key) ? removeCase : addCase
    action(result.key)
  }

  watch(() => store.keys, () => {
    localStorage.setItem(localStoreKey, JSON.stringify(store.keys))
  })

  return {store, addNode, removeNode, numSelectedUnder,
    addCase, removeCase, isCaseSelected,
    toggleSelected, totalCasesSelected, applyFromPreset}
});
