import {describe, it, expect, beforeAll} from 'vitest'
import type {KPuzzle} from 'cubing/kpuzzle'
import {splitCombined, piecesOff, MAX_CANCELLED_MOVES} from '@/helpers/cancellation'
import {normalizeMoves} from '@/helpers/alg_match'
import {invertMove} from '@/helpers/scramble_utils'

let kpuzzle: KPuzzle
beforeAll(async () => {
    const {puzzles} = await import('cubing/puzzles')
    kpuzzle = await puzzles['3x3x3'].kpuzzle()
})

const split = (s: string) => s.split(' ')
const inverse = (s: string) => split(s).reverse().map(invertMove).join(' ')
// The scrambled state a case is armed in: the inverse of its algorithm.
const startFor = (alg: string) => kpuzzle.defaultPattern().applyAlg(inverse(alg))
const norm = (moves: string[] | null) => moves && normalizeMoves(moves).join(' ')

// Two corner comms: the first ends in D', the second starts with D.
const A = "R U R' D R U' R' D'"
const B = "D R' D' R U2 R' D R D' U2"

describe('splitCombined', () => {
    it('splits a cancelled junction where the first algorithm left off', () => {
        // D' D cancelled: the user turned neither
        const executed = [...split(A).slice(0, -1), ...split(B).slice(1)]
        const s = splitCombined(startFor(A), executed, ["R2 U R2", A])
        expect(s.k).toBe(7)
        expect(norm(s.movesA)).toBe(norm(split(A)))
        // the second case's moves are its algorithm, so it can be detected
        expect(norm(s.movesB)).toBe(norm(split(B)))
    })

    it('handles a merged move at the junction (D\' then D2 turned as D)', () => {
        const B2 = "D2 R U R' D2 R U' R'"
        const executed = [...split(A).slice(0, -1), 'D', ...split(B2).slice(1)]
        const s = splitCombined(startFor(A), executed, [A])
        expect(s.k).toBe(7)
        expect(norm(s.movesB)).toBe(norm(split(B2)))
    })

    it('matches algorithms written in commutator notation', () => {
        const executed = [...split(A).slice(0, -1), ...split(B).slice(1)]
        const s = splitCombined(startFor(A), executed, ["[R U R', D]"])
        expect(s.k).toBe(7)
    })

    it('a half turn reported as two quarter turns still lands on the path', () => {
        const A2 = "R2 U R2 U' R2 D2"   // ends in a half turn
        const B2 = "D2 F R F'"
        // D2 D2 cancelled; earlier R2s turned as R R
        const executed = ['R', 'R', 'U', 'R', 'R', "U'", 'R', 'R', 'F', 'R', "F'"]
        const s = splitCombined(startFor(A2), executed, [A2])
        expect(s.k).toBe(8)
        expect(norm(s.movesB)).toBe(norm(split(B2)))
    })

    it('without a matching algorithm, estimates the split and detects nothing', () => {
        const executed = [...split(A).slice(0, -1), ...split(B).slice(1)]
        const s = splitCombined(startFor(A), executed, [])
        expect(s.movesA).toBeNull()
        expect(s.movesB).toBeNull()
        expect(s.k).toBeGreaterThan(0)
        expect(s.k).toBeLessThan(executed.length)
    })

    it('a long "cancelled" tail is not a cancellation', () => {
        // the user only turned the start of A before going on with B: the
        // "cancelled" tail would be longer than any real cancellation
        const executed = [...split(A).slice(0, 2), ...split(B)]
        expect(8 - 2).toBeGreaterThan(MAX_CANCELLED_MOVES)
        const s = splitCombined(startFor(A), executed, [A])
        expect(s.movesA).toBeNull()
    })

    it('piecesOff counts edges and corners, not centres', () => {
        const solved = kpuzzle.defaultPattern()
        expect(piecesOff(solved, solved)).toBe(0)
        expect(piecesOff(solved.applyMove('U'), solved)).toBe(8)
        expect(piecesOff(solved.applyAlg('x'), solved)).toBe(20)
    })
})
