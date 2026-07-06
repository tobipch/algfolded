import { describe, it, expect } from 'vitest'
// @ts-ignore -- helper is plain JS
import { expandCommutator, algToMoveString, moveAmount, inverseScramble,
  condenseMoves, displayAlg } from './scramble_utils'

describe('moveAmount', () => {
  it('reads R, R2, R\' and the R2\' spelling of R2', () => {
    expect(moveAmount('R')).toBe(1)
    expect(moveAmount("R'")).toBe(3)
    expect(moveAmount('R2')).toBe(2)
    expect(moveAmount("R2'")).toBe(2)
  })
})

describe('expandCommutator', () => {
  it('expands a plain commutator [A, B] -> A B A\' B\'', () => {
    expect(expandCommutator('[R, U]')).toBe("R U R' U'")
  })

  it('expands a conjugate [A: B] -> A B A\'', () => {
    expect(expandCommutator("[R U R': U2]")).toBe("R U R' U2 R U' R'")
  })

  it('expands the user example to its move sequence', () => {
    // [R U R2' U': [D', R U R']]
    expect(expandCommutator("[R U R2' U': [D', R U R']]"))
      .toBe("R U R2' U' D' R U R' D R U' R' U R2 U' R'")
  })

  it('leaves a plain alg (no brackets) as its tokens', () => {
    expect(expandCommutator("R U R' U'")).toBe("R U R' U'")
  })

  it('returns null on malformed brackets', () => {
    expect(expandCommutator('[R, U')).toBeNull()
    expect(expandCommutator('R, U]')).toBeNull()
    expect(expandCommutator('[R U]')).toBeNull() // missing separator
  })
})

describe('algToMoveString', () => {
  it('expands commutator notation, passes plain algs through', () => {
    expect(algToMoveString('[R, U]')).toBe("R U R' U'")
    expect(algToMoveString("R U R'")).toBe("R U R'")
  })

  it('condenses the seams of an expanded commutator (never R R / R\' R\')', () => {
    // UFR AB: [R' B' R: [R D R', U']] — the conjugate seam must merge to R2,
    // and its inverse (the setup shown to the user) must merge as well.
    const moves = algToMoveString("[R' B' R: [R D R', U']]")
    expect(moves).toBe("R' B' R2 D R' U' R D' R' U R' B R")
    expect(inverseScramble(moves)).toBe("R' B' R U' R D R' U R D' R2 B R")
  })
})

describe('commutator + inverse round-trips', () => {
  it('a conjugate and its expansion invert to the same scramble', () => {
    const expanded = expandCommutator("[R U R': U2]")
    expect(inverseScramble(expanded)).toBe(inverseScramble("R U R' U2 R U' R'"))
  })
})

describe('condenseMoves', () => {
  it('merges adjacent same-base moves', () => {
    expect(condenseMoves("R' B' R R D R' U' R D' R' U R' B R"))
      .toBe("R' B' R2 D R' U' R D' R' U R' B R")
    expect(condenseMoves('R2 R')).toBe("R'")
    expect(condenseMoves("x x'")).toBe('')
    expect(condenseMoves('l l U')).toBe('l2 U')
  })

  it('collapses cascading cancellations', () => {
    expect(condenseMoves("U R R' U")).toBe('U2')
  })
})

describe('displayAlg', () => {
  it('keeps notation in commutator mode, expands in expanded mode', () => {
    const alg = "[R' B' R: [R D R', U']]"
    expect(displayAlg(alg, 'commutator')).toBe(alg)
    expect(displayAlg(alg, 'expanded')).toBe("R' B' R2 D R' U' R D' R' U R' B R")
  })

  it('leaves plain algs alone in both modes', () => {
    expect(displayAlg("R U R'", 'expanded')).toBe("R U R'")
    expect(displayAlg("R U R'", 'commutator')).toBe("R U R'")
  })
})
