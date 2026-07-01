import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {migrateLocalStorageKey} from '@/helpers/helpers'

export const fontsList = ["Roboto Mono", "Courier New", "Ubuntu Mono", "Arial", "Helvetica",
    "sans-serif", "Times", "serif",]

const defaultSettings = {
    timerUpdate: "seconds",
    timerPrecision: 2,
    timerFont: fontsList[0],
    scrambleFontSize: 28,
    timerFontSize: 64,
    showHowTo: true,
    timerStartDelayMs: 0,
    cubeOrientation: "",
    letterPairMode: false,
    smartSelection: true,
    slownessPower: 2,
    recencyDecay: 0.5,
    // buffer order for the 3-twists algset (determines case grouping)
    bufferOrder: ["UFR", "UFL", "UBR", "UBL", "RDF", "FDL"],
}

const localStorageKey = "ltctTrainerSettings"
migrateLocalStorageKey("zbllTrainerSettings", localStorageKey)

export const useSettingsStore = defineStore('settings', () => {
    // merge defaults so settings saved before a new key existed still get it
    const store = reactive(
        {...defaultSettings, ...(JSON.parse(localStorage.getItem(localStorageKey)) || {})}
    )

    const resetDefaults = () => {
        for (let key in defaultSettings) {
            store[key] = defaultSettings[key]
        }
    }

    watch(() => store, () => {
        localStorage.setItem(localStorageKey, JSON.stringify(store))
    }, {deep: true})

    return { resetDefaults, store }
});