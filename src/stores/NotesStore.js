import {reactive, watch} from 'vue'
import { defineStore } from 'pinia'
import {migrateLocalStorageKey} from '@/helpers/helpers'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {LEGACY_ALGSET_ID} from '@/algsets/registry'
import {readNamespaced, writeNamespaced, migrateToNamespaced, isFlatStringMap} from '@/helpers/namespaced_storage'

const localStorageKey = "ltctTrainerNotes"
migrateLocalStorageKey("zbllTrainerNotes", localStorageKey)        // zbll* -> ltct* (legacy rename)
migrateToNamespaced(localStorageKey, LEGACY_ALGSET_ID, isFlatStringMap) // flat -> { algsetId: notes }

export const useNotesStore = defineStore('notes', () => {
  const algset = useAlgsetStore()
  const store = reactive(readNamespaced(localStorageKey, algset.activeId, {}))

  watch(() => store, () => {
    writeNamespaced(localStorageKey, algset.activeId, store)
  }, {deep: true})

  // switching algset -> load that set's notes slot
  watch(() => algset.activeId, (id) => {
    const fresh = readNamespaced(localStorageKey, id, {})
    for (const k of Object.keys(store)) delete store[k]
    Object.assign(store, fresh)
  })

  return {store}
});
