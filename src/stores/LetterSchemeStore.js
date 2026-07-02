import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'

// Corner scheme: sticker (3 chars) -> letter. Speffz by default.
const defaultScheme = {
    UBL: "A", UBR: "B", UFR: "C", UFL: "D",
    LUB: "E", LUF: "F", LDF: "G", LDB: "H",
    FUL: "I", FUR: "J", FDR: "K", FDL: "L",
    RUF: "M", RUB: "N", RDB: "O", RDF: "P",
    BUR: "Q", BUL: "R", BDL: "S", BDR: "T",
    DFL: "U", DFR: "V", DBR: "W", DBL: "X",
}

// Edge scheme: sticker (2 chars) -> letter. Speffz edges by default. Used by the
// edge-commutator set; corner sets never touch it.
const defaultEdgeScheme = {
    UB: "A", UR: "B", UF: "C", UL: "D",
    LU: "E", LF: "F", LD: "G", LB: "H",
    FU: "I", FR: "J", FD: "K", FL: "L",
    RU: "M", RB: "N", RD: "O", RF: "P",
    BU: "Q", BL: "R", BD: "S", BR: "T",
    DF: "U", DR: "V", DB: "W", DL: "X",
}

const localStorageKey = "ltctLetterScheme"
const edgeStorageKey = "ltctEdgeLetterScheme"

export const useLetterSchemeStore = defineStore('letterScheme', () => {
    const scheme = reactive(
        JSON.parse(localStorage.getItem(localStorageKey)) || {...defaultScheme}
    )
    const edgeScheme = reactive(
        JSON.parse(localStorage.getItem(edgeStorageKey)) || {...defaultEdgeScheme}
    )

    // Dispatch by sticker length: 2-char stickers are edges, everything else is a
    // corner. Keeps every caller (`ls.toLetter(sticker)`) scheme-aware without
    // needing to know which orbit the sticker belongs to.
    const toLetter = (piece) =>
        (piece && piece.length === 2 ? edgeScheme[piece] : scheme[piece]) || piece

    const resetDefaults = () => {
        for (let key in defaultScheme) scheme[key] = defaultScheme[key]
        for (let key in defaultEdgeScheme) edgeScheme[key] = defaultEdgeScheme[key]
    }

    watch(() => scheme, () => {
        localStorage.setItem(localStorageKey, JSON.stringify(scheme))
    }, {deep: true})
    watch(() => edgeScheme, () => {
        localStorage.setItem(edgeStorageKey, JSON.stringify(edgeScheme))
    }, {deep: true})

    return { scheme, edgeScheme, toLetter, resetDefaults }
})
