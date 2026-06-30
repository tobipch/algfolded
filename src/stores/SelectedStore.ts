import {reactive, computed, watch} from 'vue'
import { defineStore } from 'pinia'
import { useAlgsetStore } from '@/stores/AlgsetStore'
import { flattenLeaves } from '@/algsets/tree'
import { casesUnder } from '@/algsets/selection'

const localStoreKey = "currentLtctArray";
const loadedArray: string[] = JSON.parse(localStorage.getItem(localStoreKey) || "[]")

export const useSelectedStore = defineStore('selected', () => {
  const algset = useAlgsetStore()

  const store = reactive<{ keys: string[] }>({
    keys: loadedArray,
  });

  // ordered list of all case ids in the active set (same order the tree renders)
  const allCaseKeysArray = computed(() => flattenLeaves(algset.tree))

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

  // ---- LTCT-shaped convenience wrappers (the cards still call these; they
  //      move to the generic node API in the next phase) ----
  const addGroup = (group: string) => addNode([group])
  const removeGroup = (group: string) => removeNode([group])
  const addSubgroup = (group: string, subgroup: string) => addNode([group, subgroup])
  const removeSubgroup = (group: string, subgroup: string) => removeNode([group, subgroup])
  const numCasesInGroupSelected = (group: string) => numSelectedUnder([group])
  const numCasesInSubgroupSelected = (group: string, subgroup: string) => numSelectedUnder([group, subgroup])

  const toggleSelected = (result: { key: string } | null | undefined) => {
    if (!result) return
    const action = isCaseSelected(result.key) ? removeCase : addCase
    action(result.key)
  }

  watch(() => store.keys, () => {
    localStorage.setItem(localStoreKey, JSON.stringify(store.keys))
  })

  return {store, allCaseKeysArray, addNode, removeNode, numSelectedUnder,
    addGroup, addSubgroup, addCase, removeGroup, removeSubgroup, removeCase,
    toggleSelected, isCaseSelected, numCasesInSubgroupSelected, numCasesInGroupSelected,
    totalCasesSelected, applyFromPreset}
});
