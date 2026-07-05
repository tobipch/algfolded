import { describe, it, expect } from 'vitest'
// @ts-ignore -- helper is plain JS (checkJs is off)
import { algToFaceMoves, normalizeMoves, detectAlg, canonicalAlg, isValidAlg } from './alg_match'

describe('normalizeMoves', () => {
  it('merges doubled turns', () => {
    expect(normalizeMoves(['R', 'R'])).toEqual(['R2'])
    expect(normalizeMoves(['U', 'U', 'U'])).toEqual(["U'"])
  })

  it('drops cancellations, including ones exposed by earlier merges', () => {
    expect(normalizeMoves(['R', "R'"])).toEqual([])
    expect(normalizeMoves(['R', 'U', "U'", "R'"])).toEqual([])
  })

  it('orders commuting same-axis moves canonically', () => {
    expect(normalizeMoves(["L'", 'R'])).toEqual(normalizeMoves(['R', "L'"]))
  })

  it('keeps non-commuting moves in order', () => {
    expect(normalizeMoves(['R', 'U', "R'"])).toEqual(['R', 'U', "R'"])
  })
})

describe('algToFaceMoves', () => {
  it('passes plain face-turn algs through', () => {
    expect(algToFaceMoves("R U R' U'")).toEqual(['R', 'U', "R'", "U'"])
  })

  it('translates moves after a rotation into the fixed cube frame', () => {
    // y F y' is physically an R turn as the cube reports it
    expect(algToFaceMoves("y F y'")).toEqual(['R'])
    expect(algToFaceMoves('y2 R')).toEqual(['L'])
  })

  it('expands slice moves into the reported outer-layer turns', () => {
    // M = x' R L': cube reports R L'; the following U happens in the
    // x'-shifted frame, i.e. on the hardware B axis
    expect(algToFaceMoves('M U')).toEqual(['R', "L'", 'B'])
    expect(algToFaceMoves("M U M'")).toEqual(['R', "L'", 'B', "R'", 'L'])
  })

  it('expands wide moves', () => {
    expect(algToFaceMoves("r U r'")).toEqual(['L', 'F', "L'"])
  })

  it('returns null for tokens it cannot translate', () => {
    expect(algToFaceMoves('R foo U')).toBeNull()
  })
})

describe('detectAlg', () => {
  const algs = ["U2 R' U' R2 D R' U' R D' R2 U2 R U", "M U M'", "R U R'"]

  it('finds the exact alg that was executed', () => {
    expect(detectAlg(['R', 'U', "R'"], algs)).toBe("R U R'")
  })

  it('ignores in-place corrected mistakes', () => {
    expect(detectAlg(['R', 'U', "U'", 'U', "R'"], algs)).toBe("R U R'")
  })

  it('matches slice algs from the reported face turns, in either order', () => {
    expect(detectAlg(['R', "L'", 'B', "R'", 'L'], algs)).toBe("M U M'")
    expect(detectAlg(["L'", 'R', 'B', 'L', "R'"], algs)).toBe("M U M'")
  })

  it('returns null when nothing matches', () => {
    expect(detectAlg(['R', 'U2', "R'"], algs)).toBeNull()
    expect(detectAlg([], algs)).toBeNull()
    expect(detectAlg(null, algs)).toBeNull()
  })
})

describe('canonicalAlg', () => {
  it('equates different notations of the same alg', () => {
    expect(canonicalAlg("R U R'")).toBe(canonicalAlg("R U R2 R"))
    expect(canonicalAlg("M U M'")).toBe(canonicalAlg("R L' B R' L"))
  })

  it('distinguishes different algs', () => {
    expect(canonicalAlg("R U R'")).not.toBe(canonicalAlg("R U' R'"))
  })

  it('falls back to the trimmed string for untranslatable input', () => {
    expect(canonicalAlg('  R foo U ')).toBe('R foo U')
  })
})

describe('isValidAlg', () => {
  it('accepts face turns, slices, wide moves and rotations', () => {
    expect(isValidAlg("R U R' U'")).toBe(true)
    expect(isValidAlg("M' U2 M")).toBe(true)
    expect(isValidAlg("y Rw U Rw'")).toBe(true)
  })

  it('rejects unknown tokens and empty/rotation-only input', () => {
    expect(isValidAlg('R foo U')).toBe(false)
    expect(isValidAlg('')).toBe(false)
    expect(isValidAlg('x y2')).toBe(false)
  })
})

describe('commutator notation', () => {
  it('accepts commutator/conjugate notation as valid', () => {
    expect(isValidAlg('[R, U]')).toBe(true)
    expect(isValidAlg("[R U R': [D', R U R']]")).toBe(true)
  })

  it('rejects malformed commutator notation', () => {
    expect(isValidAlg('[R, U')).toBe(false)
    expect(isValidAlg('[R foo, U]')).toBe(false)
  })

  it('canonicalizes a commutator to the same form as its expansion', () => {
    // the user example vs its (correct) written-out move sequence: the
    // conjugate's A^-1 tail is "U R2 U' R'" (invert the leading R -> R')
    expect(canonicalAlg("[R U R2' U': [D', R U R']]"))
      .toBe(canonicalAlg("R U R2' U' D' R U R' D R U' R' U R2 U' R'"))
  })

  it('detects a commutator alg from the executed face moves', () => {
    const exec = algToFaceMoves('[R, U]') // R U R' U'
    expect(detectAlg(exec, ['[R, U]'])).toBe('[R, U]')
    expect(detectAlg(['R', 'U', "R'", "U'"], ['[R, U]'])).toBe('[R, U]')
  })
})

describe('detectAlg preferred tie-break (equivalent algs)', () => {
  // GQ / "DU LDF BUR": two listed algs that are the same moves in different
  // notation (wide r/R vs face L/l). Executing them yields the same face turns.
  const algL = "U2 L' U2 L U' M F' L F l'"
  const algR = "U2 r' F2 r U' M F' r U R'"
  const exec = algToFaceMoves(algR) // what the cube reports

  it('returns the first match when no preference is given', () => {
    expect(detectAlg(exec, [algL, algR])).toBe(algL)
  })

  it('returns the preferred alg when it is an equivalent match', () => {
    expect(detectAlg(exec, [algL, algR], algR)).toBe(algR)
    expect(detectAlg(exec, [algL, algR], algL)).toBe(algL)
  })

  it('ignores a preferred alg that does not match, falling back to the list', () => {
    expect(detectAlg(exec, [algL, algR], "R U R'")).toBe(algL)
  })
})
