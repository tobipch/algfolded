import {reactive, watch} from 'vue'
import { defineStore } from 'pinia'
import { useAlgsetStore } from '@/stores/AlgsetStore'
import { useLetterSchemeStore } from '@/stores/LetterSchemeStore'
import { casesUnder, casesMatchingPattern } from '@/algsets/selection'
import { LEGACY_ALGSET_ID } from '@/algsets/registry'
import { readNamespaced, writeNamespaced, migrateToNamespaced, isFlatArray } from '@/helpers/namespaced_storage'

const localStoreKey = "currentLtctArray";
migrateToNamespaced(localStoreKey, LEGACY_ALGSET_ID, isFlatArray)

export const useSelectedStore = defineStore('selected', () => {
  const algset = useAlgsetStore()
  const ls = useLetterSchemeStore()

  const store = reactive<{ keys: string[] }>({
    keys: readNamespaced<string[]>(localStoreKey, algset.activeId, []),
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

  // ---- bulk selection ----
  const selectAll = () => { store.keys = algset.cases.map((c) => c.id) }
  const deselectAll = () => { store.keys = [] }
  const invertSelection = () => {
    const sel = new Set(store.keys)
    store.keys = algset.cases.filter((c) => !sel.has(c.id)).map((c) => c.id)
  }

  // ---- wildcard selection ----
  const matchingIds = (query: string): string[] =>
    casesMatchingPattern(algset.cases, algset.active.levels, ls.toLetter, query)

  // How many cases a query would match (for a live preview), without applying.
  const countMatching = (query: string): number => matchingIds(query).length

  // Deselect everything, then select exactly the cases matching `query`
  // ("*" = any run of characters). Returns how many were selected.
  const selectByPattern = (query: string): number => {
    const ids = matchingIds(query)
    store.keys = ids
    return ids.length
  }

  // Add the matching cases to the current selection. Returns how many matched.
  const addByPattern = (query: string): number => {
    const ids = matchingIds(query)
    store.keys = [...new Set([...store.keys, ...ids])]
    return ids.length
  }

  // Remove the matching cases from the current selection. Returns how many were removed.
  const removeByPattern = (query: string): number => {
    const ids = new Set(matchingIds(query))
    const before = store.keys.length
    store.keys = store.keys.filter((k) => !ids.has(k))
    return before - store.keys.length
  }

  watch(() => store.keys, () => {
    writeNamespaced(localStoreKey, algset.activeId, store.keys)
  })

  // switching algset -> load that set's selection slot
  watch(() => algset.activeId, (id) => {
    store.keys = readNamespaced<string[]>(localStoreKey, id, [])
  })

  return {store, addNode, removeNode, numSelectedUnder,
    addCase, removeCase, isCaseSelected,
    toggleSelected, totalCasesSelected, applyFromPreset,
    selectAll, deselectAll, invertSelection,
    countMatching, selectByPattern, addByPattern, removeByPattern}
});
