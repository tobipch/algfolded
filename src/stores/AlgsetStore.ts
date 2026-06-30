import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AlgCase } from '@/algsets/types'
import { ALGSETS, DEFAULT_ALGSET_ID, getAlgset } from '@/algsets/registry'
import { buildTree } from '@/algsets/tree'

const activeIdKey = 'ltct_active_algset'

const getInitialId = (): string => {
  const stored = (typeof localStorage !== 'undefined' && localStorage)
    ? localStorage.getItem(activeIdKey)
    : null
  return stored && getAlgset(stored) ? stored : DEFAULT_ALGSET_ID
}

// Holds the currently active algset and its (lazily loaded) cases. This is the
// single place the rest of the app reads case data / hierarchy from.
export const useAlgsetStore = defineStore('algset', () => {
  const activeId = ref(getInitialId())
  const cases = ref<AlgCase[]>([])
  const loaded = ref(false)

  const active = computed(() => getAlgset(activeId.value) ?? ALGSETS[0])

  const byId = computed<Record<string, AlgCase>>(() => {
    const map: Record<string, AlgCase> = {}
    for (const c of cases.value) map[c.id] = c
    return map
  })

  const tree = computed(() => buildTree(cases.value, active.value.levels))

  async function activate(id: string): Promise<void> {
    const set = getAlgset(id)
    if (!set) return
    activeId.value = id
    loaded.value = false
    cases.value = await set.load()
    loaded.value = true
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(activeIdKey, id)
    }
  }

  return { activeId, active, cases, byId, tree, loaded, activate }
})
