/**
 * Full-spin gestures: four quarter turns of one face in the same direction
 * (U U U U, U' U' U' U') or two half turns (U2 U2). Net-identity, so they can
 * never appear inside a real algorithm and are free to act as controls
 * (D4/U4 re-arms the case, L4 reveals its algorithm).
 *
 * The turns of a gesture have to follow each other quickly. Without that, the
 * last turn of a failed attempt counted as the first turn of the spin: an
 * attempt ending in U followed by U4 fired after the third U, and the fourth U
 * became the first move of the re-armed case - which the next U4 then repeated
 * forever. A gesture is one continuous spin; the turn before it is separated
 * by the moment the user needs to notice the case did not solve.
 *
 * Pure: no store, no DOM, no clock of its own. Every turn comes with its
 * timestamps.
 */

import {moveFace} from '@/helpers/scramble_utils'

/**
 * Longest pause allowed between two turns of one gesture, ms. A deliberate
 * spin runs at 3-4 turns per second (gaps up to ~330 ms), a fast one at well
 * under 150 ms per turn, while noticing that a case did not solve and starting
 * to spin takes longer than this.
 */
export const SPIN_MAX_GAP_MS = 400

/**
 * When a turn happened. `cube` is the cube's own clock in ms, when it reports
 * one: moves the cube sends in a burst (QiYi collects them and sends them
 * packed, recovered moves arrive together) keep their real spacing there.
 * `local` is when the turn arrived here, always known.
 */
export interface TurnTime {
    cube: number | null
    local: number
}

interface Turn {
    move: string
    time: TurnTime
}

/** Gap between two turns, on the cube's clock whenever both carry it. */
export const turnGapMs = (a: TurnTime, b: TurnTime): number =>
    a.cube != null && b.cube != null ? b.cube - a.cube : b.local - a.local

export interface SpinDetector {
    /** Feed one turn; true when it completes a full spin. */
    push: (move: string, time: TurnTime) => boolean
    clear: () => void
}

export const createSpinDetector = (
    faces: readonly string[],
    maxGapMs: number = SPIN_MAX_GAP_MS,
): SpinDetector => {
    let turns: Turn[] = []
    const push = (move: string, time: TurnTime): boolean => {
        const face = moveFace(move)
        if (!faces.includes(face)) { turns = []; return false }
        const last = turns[turns.length - 1]
        // Another face, or a pause: whatever came before is not part of this spin.
        if (last && (moveFace(last.move) !== face || turnGapMs(last.time, time) > maxGapMs)) {
            turns = []
        }
        turns.push({move, time})
        if (turns.length > 4) turns = turns.slice(-4)
        const moves = turns.map(t => t.move)
        const last4 = moves.slice(-4)
        const last2 = moves.slice(-2)
        const spun = (last4.length === 4 && (last4.every(m => m === face) || last4.every(m => m === face + "'")))
            || (last2.length === 2 && last2.every(m => m === face + '2'))
        // A completed spin is used up: the next turn starts a new one.
        if (spun) turns = []
        return spun
    }
    return {push, clear: () => { turns = [] }}
}
