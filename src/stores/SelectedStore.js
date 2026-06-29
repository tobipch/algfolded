import {reactive, watch} from 'vue'
import { defineStore } from 'pinia'
import ltct_map from "@/assets/ltct_map.json"

const localStoreKey = "currentLtctArray";
const loadedArray = JSON.parse(localStorage.getItem(localStoreKey) || "[]")

// Speffz sticker order for sorting cases
const SPEFFZ_ORDER = [
  "UBL", "UBR", "UFR", "UFL",
  "LUB", "LUF", "LDF", "LDB",
  "FUL", "FUR", "FDR", "FDL",
  "RUF", "RUB", "RDB", "RDF",
  "BUR", "BUL", "BDL", "BDR",
  "DFL", "DFR", "DBR", "DBL",
]
const speffzIndex = Object.fromEntries(SPEFFZ_ORDER.map((s, i) => [s, i]))

const GROUP_ORDER = { "UU": 0, "UD": 1, "DU": 2, "DD": 3 }

function compareKeys(a, b) {
  const [gA, tA, wA] = a.split(' ')
  const [gB, tB, wB] = b.split(' ')
  const gi = (GROUP_ORDER[gA] ?? 99) - (GROUP_ORDER[gB] ?? 99)
  if (gi !== 0) return gi
  const ti = (speffzIndex[tA] ?? 99) - (speffzIndex[tB] ?? 99)
  if (ti !== 0) return ti
  return (speffzIndex[wA] ?? 99) - (speffzIndex[wB] ?? 99)
}

export const useSelectedStore = defineStore('selected', () => {
  const allCaseKeysArray = Object.keys(ltct_map).sort(compareKeys)

  const store = reactive({
    keys: loadedArray,
  });

  const applyFromPreset = presetKeysSet => store.keys = [...presetKeysSet]

  const removeGroup = group => {
    store.keys = store.keys.filter(key => !key.startsWith(`${group} `))
  }

  // this may lead to duplicate store.keys, use with caution
  const addGroup = group => {
    store.keys = [...store.keys, ...allCaseKeysArray.filter(key => key.startsWith(`${group} `))]
  }

  // this may lead to duplicate store.keys, use with caution
  const addSubgroup = (group, subgroup) => {
    store.keys = [...store.keys, ...allCaseKeysArray.filter(key => key.startsWith(`${group} ${subgroup} `))]
  }

  const addCase = key => {
    store.keys = [...store.keys, key] // if you just .push(), then freakin' VueJS won't track it
  }

  // remove all cases of the subgroup
  const removeSubgroup = (group, subgroup) => {
    store.keys = store.keys.filter(key => !key.startsWith(`${group} ${subgroup} `))
  }

  const removeCase = key => store.keys = store.keys.filter(k => k !== key)

  const isCaseSelected = key => store.keys.includes(key)

  const numCasesInSubgroupSelected = (group, subgroup) => store.keys.filter(key => key.startsWith(`${group} ${subgroup} `)).length

  const numCasesInGroupSelected = (group) => store.keys.filter(key => key.startsWith(`${group} `)).length

  const totalCasesSelected = () => store.keys.length

  const toggleSelected = result => {
    if (!result) return
    const action = isCaseSelected(result.key) ? removeCase : addCase
    action(result.key)
  }

  watch(() => store.keys, () => {
    localStorage.setItem(localStoreKey, JSON.stringify(store.keys))
  })

  return {store, allCaseKeysArray, addGroup, addSubgroup, addCase,
    removeGroup, removeSubgroup, removeCase, toggleSelected,
    isCaseSelected, numCasesInSubgroupSelected, numCasesInGroupSelected, totalCasesSelected, applyFromPreset}
});
