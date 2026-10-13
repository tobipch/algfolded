import {describe, it, expect} from 'vitest'
import {createSpinDetector, turnGapMs, SPIN_MAX_GAP_MS} from '@/helpers/spin_gesture'

// Turns at the given local times, no cube clock.
const at = (local: number) => ({cube: null, local})

const feed = (faces: string[], turns: [string, number][]) => {
    const d = createSpinDetector(faces)
    return turns.map(([m, t]) => d.push(m, at(t)))
}

describe('spin gesture', () => {
    it('fires on four quarter turns or two half turns of one face', () => {
        expect(feed(['U', 'D'], [['U', 0], ['U', 150], ['U', 300], ['U', 450]])).toEqual([false, false, false, true])
        expect(feed(['U', 'D'], [["D'", 0], ["D'", 150], ["D'", 300], ["D'", 450]])).toEqual([false, false, false, true])
        expect(feed(['U', 'D'], [['U2', 0], ['U2', 200]])).toEqual([false, true])
    })

    it('ignores mixed directions, other faces and face switches', () => {
        expect(feed(['U', 'D'], [['U', 0], ["U'", 100], ['U', 200], ['U', 300]])).toEqual([false, false, false, false])
        expect(feed(['U', 'D'], [['U', 0], ['U', 100], ['D', 200], ['U', 300], ['U', 400]])).toEqual([false, false, false, false, false])
        expect(feed(['U', 'D'], [['U', 0], ['U', 100], ['R', 200], ['U', 300], ['U', 400]])).toEqual([false, false, false, false, false])
    })

    // The loop Ezra got stuck in: an attempt ending in U, then U4 to reset.
    it('does not count the last turn of the attempt into the spin', () => {
        const d = createSpinDetector(['U', 'D'])
        d.push('R', at(0))
        d.push('U', at(100))               // last move of the failed attempt
        // noticing the case did not solve, then spinning
        expect(d.push('U', at(900))).toBe(false)
        expect(d.push('U', at(1050))).toBe(false)
        expect(d.push('U', at(1200))).toBe(false) // used to fire here
        expect(d.push('U', at(1350))).toBe(true)  // fires exactly at the end of the spin
        // and the next case may start with U right away
        expect(d.push('U', at(1450))).toBe(false)
    })

    it('a slow spin is not a gesture', () => {
        const gap = SPIN_MAX_GAP_MS + 1
        expect(feed(['U', 'D'], [['U', 0], ['U', gap], ['U', 2 * gap], ['U', 3 * gap]])).toEqual([false, false, false, false])
        expect(feed(['U', 'D'], [['U2', 0], ['U2', gap]])).toEqual([false, false])
        // exactly at the limit still counts
        const ok = SPIN_MAX_GAP_MS
        expect(feed(['U', 'D'], [['U', 0], ['U', ok], ['U', 2 * ok], ['U', 3 * ok]])[3]).toBe(true)
    })

    // QiYi cubes collect moves and send them packed: they arrive here at the
    // same instant, but the cube's clock still has their real spacing.
    it('measures on the cube clock when both turns carry it', () => {
        const d = createSpinDetector(['U', 'D'])
        d.push('U', {cube: 1000, local: 5000})
        // burst: same local time, but 800 ms apart on the cube
        expect(d.push('U', {cube: 1800, local: 5000})).toBe(false)
        expect(d.push('U', {cube: 1900, local: 5001})).toBe(false)
        expect(d.push('U', {cube: 2000, local: 5002})).toBe(false)
        expect(d.push('U', {cube: 2100, local: 5003})).toBe(true)
    })

    it('falls back to arrival time when a turn has no cube timestamp', () => {
        expect(turnGapMs({cube: 10, local: 0}, {cube: null, local: 250})).toBe(250)
        expect(turnGapMs({cube: 10, local: 0}, {cube: 30, local: 900})).toBe(20)
    })

    it('clear() starts over', () => {
        const d = createSpinDetector(['L'])
        d.push('L', at(0)); d.push('L', at(100)); d.push('L', at(200))
        d.clear()
        expect(d.push('L', at(300))).toBe(false)
    })
})
