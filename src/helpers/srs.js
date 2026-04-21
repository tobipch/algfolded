/**
 * Spaced repetition helpers for weighted case selection.
 * Pure functions — no store or DOM dependencies.
 */

export function updateEma(oldEma, solveTimeSec, alpha = 0.3) {
    if (oldEma === null) return solveTimeSec
    return alpha * solveTimeSec + (1 - alpha) * oldEma
}

export function caseWeight(caseData, medianEma, globalCounter, totalCases, settings) {
    const { slownessPower = 2, recencyDecay = 0.5 } = settings
    const { a: ema, n: count, s: lastSolveIndex } = caseData

    if (!count) return 10

    const slowness = Math.max(0.1, Math.min(ema / medianEma, 10))
    const solvesSince = globalCounter - (lastSolveIndex || 0)
    const recency = Math.min(1 + recencyDecay * solvesSince / Math.max(totalCases, 1), 5)

    return Math.pow(slowness, slownessPower) * recency
}

export function weightedRandomPick(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0)
    let r = Math.random() * total
    for (const e of entries) {
        r -= e.weight
        if (r <= 0) return e.key
    }
    return entries[entries.length - 1].key
}

export function aoN(times, n) {
    if (times.length < n) return null
    const last = [...times.slice(-n)].sort((a, b) => a - b)
    return last.slice(1, -1).reduce((s, t) => s + t, 0) / (n - 2)
}

export function median(arr) {
    if (arr.length === 0) return 1
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
