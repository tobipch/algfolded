/**
 * Cancellations between two consecutive cases.
 *
 * Flowing from one comm into the next, the end of the first and the start of
 * the second often cancel: "... R D' R'" followed by "R D R' ..." is turned as
 * "... R D' D R' ..." or less. The cube for the first case then never passes
 * through solved, so on its own it never registers as done.
 *
 * Both cases are known in advance, though. Starting a second virtual cube from
 * both scrambles applied (the second case's, then the first's), the user's
 * moves bring it to solved exactly when they have done the first case and the
 * second, however the moves between them cancelled. That cube is the
 * BluetoothCubeStore's business; what is left is the bookkeeping: where did the
 * first case end and the second begin?
 *
 * The first case ended at the last move where the user was still on the path
 * of one of its algorithms: the latest point where the cube for the first case
 * is in a state that algorithm passes through. What the algorithm would have
 * done from there on was cancelled into the second case. The first case is
 * timed up to that move, the second from the move after it, which matches how
 * a cancellation saves time in a real solve.
 *
 * Pure: no store, no DOM. Works on cubing.js patterns, which bring their own
 * puzzle definition along.
 */

import type {KPattern} from 'cubing/kpuzzle'
import {algToFaceMoves} from '@/helpers/alg_match'
import {invertMove} from '@/helpers/scramble_utils'

/**
 * How many moves at the end of the first algorithm may be cancelled. A real
 * cancellation is a move or two at the junction (a few more when commuting
 * moves cancel in a chain). A longer "cancelled" tail means the user turned an
 * algorithm the case does not list, so the path match says nothing.
 */
export const MAX_CANCELLED_MOVES = 4

/** Edge and corner pieces out of place, centres ignored. 0 means solved. */
export const piecesOff = (pattern: KPattern, solved: KPattern): number => {
    const a = pattern.patternData
    const b = solved.patternData
    let off = 0
    for (const orbit in a) {
        if (/CENTER/i.test(orbit)) continue
        const oa = a[orbit], ob = b[orbit]
        for (let i = 0; i < oa.pieces.length; i++) {
            if (oa.pieces[i] !== ob.pieces[i] || (oa.orientation[i] ?? 0) !== (ob.orientation[i] ?? 0)) off++
        }
    }
    return off
}

export interface CombinedSplit {
    /** the first `k` executed moves belong to the first case, the rest to the second */
    k: number
    /**
     * Moves to run algorithm detection on, per case: the first case's
     * algorithm in full, and for the second what its algorithm must have been
     * (the cancelled tail undone, then the moves actually turned). Null when
     * the split was only estimated: detecting an algorithm from it would
     * record nonsense as the user's own.
     */
    movesA: string[] | null
    movesB: string[] | null
}

/**
 * Split the moves that finished two cases in one go.
 *
 * @param start    the first case's scrambled state, as the cube was armed
 * @param executed every move from the first case's first move to the end
 * @param algsA    the first case's algorithms, the preferred one first
 */
export const splitCombined = (start: KPattern, executed: string[], algsA: string[]): CombinedSplit => {
    const solved = start.kpuzzle.defaultPattern()
    const states: KPattern[] = [start]
    for (const m of executed) states.push(states[states.length - 1].applyMove(m))

    let best: {k: number, alg: string[], i: number} | null = null
    for (const alg of algsA) {
        const faceMoves = algToFaceMoves(alg)
        if (!faceMoves || faceMoves.length === 0) continue
        // States along the algorithm, before each of its moves. The solved
        // state at its end is left out: had the user reached it, the first
        // case would have registered on its own.
        const path: KPattern[] = [start]
        for (let i = 0; i < faceMoves.length - 1; i++) path.push(path[i].applyMove(faceMoves[i]))
        for (let k = states.length - 1; k > (best?.k ?? 0); k--) {
            let i = path.length - 1
            while (i >= 0 && !path[i].isIdentical(states[k])) i--
            if (i >= 0) { best = {k, alg: faceMoves, i}; break }
        }
    }

    if (best && best.alg.length - best.i <= MAX_CANCELLED_MOVES) {
        const tail = best.alg.slice(best.i)
        const undo = tail.slice().reverse().map(invertMove)
        return {k: best.k, movesA: best.alg, movesB: [...undo, ...executed.slice(best.k)]}
    }

    // No listed algorithm explains the moves: end the first case where its
    // cube came closest to solved (the later point on a tie).
    let k = Math.min(1, executed.length)
    let fewest = Infinity
    for (let j = 1; j < executed.length; j++) {
        const off = piecesOff(states[j], solved)
        if (off <= fewest) { fewest = off; k = j }
    }
    return {k, movesA: null, movesB: null}
}
