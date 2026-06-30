import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AlgCase } from '@/algsets/types'
import { ALGSETS, DEFAULT_ALGSET_ID, getAlgset } from '@/algsets/registry'
import { buildTree } from '@/algsets/tree'
import { useSettingsStore } from '@/stores/SettingsStore'
import { useLetterSchemeStore } from '@/stores/LetterSchemeStore'

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
  const settings = useSettingsStore()
  const ls = useLetterSchemeStore()
  const activeId = ref(getInitialId())
  const rawData = ref<unknown>(null)
  const loaded = ref(false)

  const active = computed(() => getAlgset(activeId.value) ?? ALGSETS[0])

  // Cases are derived from the raw data + settings (e.g. the buffer order for
  // 3-twists), so they update reactively when those change.
  const cases = computed<AlgCase[]>(() => {
    if (rawData.value === null) return []
    return active.value.derive(rawData.value, { bufferOrder: settings.store.bufferOrder })
  })

  const byId = computed<Record<string, AlgCase>>(() => {
    const map: Record<string, AlgCase> = {}
    for (const c of cases.value) map[c.id] = c
    return map
  })

  const tree = computed(() => buildTree(cases.value, active.value.levels))

  // Human-readable label for a case id, delegated to the active algset so each
  // set controls its own format (both translate stickers through the scheme).
  const caseLabel = (id: string): string => {
    const c = byId.value[id]
    if (!c) return id
    return active.value.caseLabel(c, ls.toLetter)
  }

  async function activate(id: string): Promise<void> {
    const set = getAlgset(id)
    if (!set) return
    activeId.value = id
    loaded.value = false
    rawData.value = null
    rawData.value = await set.load()
    loaded.value = true
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(activeIdKey, id)
    }
  }

  return { activeId, active, cases, byId, tree, loaded, activate, caseLabel }
})
