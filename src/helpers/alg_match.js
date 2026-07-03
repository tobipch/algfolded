import {moveFace, moveAmount, amountToMove, ROTATION_MAP, applyRotation} from '@/helpers/scramble_utils'

// Matching "which algorithm did the user execute" from smart-cube move
// reports. The cube only ever reports outer-face turns in its own fixed
// hardware frame, so algorithms containing rotations (x/y/z), slice moves
// (M/S/E) and wide moves (r/Rw, ...) are first expanded into the equivalent
// face-turn sequence as the cube would see it.

// Each slice/wide move = one whole-cube rotation + the outer-face turn(s)
// that cancel that rotation on the layers the move doesn't touch. All parts
// share an axis, so they commute and amounts scale uniformly.
// Format: [letter, quarter turns] with rotations as 'x'/'y'/'z'.
const COMPOUND = {
  M: [['x', 3], ['R', 1], ['L', 3]],
  E: [['y', 3], ['U', 1], ['D', 3]],
  S: [['z', 1], ['F', 3], ['B', 1]],
  r: [['x', 1], ['L', 1]],
  l: [['x', 3], ['R', 1]],
  u: [['y', 1], ['D', 1]],
  d: [['y', 3], ['U', 1]],
  f: [['z', 1], ['B', 1]],
  b: [['z', 3], ['F', 1]],
}

const FACES = new Set(['U', 'D', 'F', 'B', 'L', 'R'])
const ROTATIONS = new Set(['x', 'y', 'z'])

const rotationToken = (letter, amount) => {
  const a = ((amount % 4) + 4) % 4
  if (a === 0) return null
  return letter + (a === 1 ? '' : a === 2 ? '2' : "'")
}

// Expand an alg string into the face-turn sequence a smart cube would report
// while the user executes it. Returns null when the alg contains a token we
// can't translate (so callers can skip matching instead of mismatching).
export const algToFaceMoves = (alg) => {
  const tokens = (alg || '').trim().split(/\s+/).filter(Boolean)
  // position (letter as written in the alg) -> physical cube face
  let mapping = {U: 'U', D: 'D', F: 'F', B: 'B', L: 'L', R: 'R'}
  const out = []

  for (const token of tokens) {
    let base = token.replace(/['2]+$/, '')
    const amount = moveAmount(token)
    if (base.length === 2 && base[1] === 'w') base = base[0].toLowerCase() // Rw -> r

    if (ROTATIONS.has(base)) {
      const rot = rotationToken(base, amount)
      if (rot) mapping = applyRotation(mapping, rot)
      continue
    }
    if (FACES.has(base)) {
      const m = amountToMove(mapping[base], amount)
      if (m) out.push(m)
      continue
    }
    const parts = COMPOUND[base]
    if (!parts) return null // unknown token
    // Face parts first (they live in the pre-rotation frame), then shift the frame.
    let rotPart = null
    for (const [letter, baseAmount] of parts) {
      const a = baseAmount * amount
      if (ROTATIONS.has(letter)) {
        rotPart = rotationToken(letter, a)
      } else {
        const m = amountToMove(mapping[letter], a)
        if (m) out.push(m)
      }
    }
    if (rotPart) mapping = applyRotation(mapping, rotPart)
  }
  return out
}

const AXIS = {U: 'UD', D: 'UD', R: 'RL', L: 'RL', F: 'FB', B: 'FB'}
const AXIS_FACES = {UD: ['U', 'D'], RL: ['R', 'L'], FB: ['F', 'B']}

// One canonicalization pass: group runs of moves that share an axis (such
// moves commute), sum the quarter turns per face and re-emit them in a fixed
// face order. This merges doubled turns, drops cancellations and normalizes
// orderings like "L' R" vs "R L'".
const canonicalizePass = (moves) => {
  const out = []
  let axis = null
  let amounts = null
  const flush = () => {
    if (!axis) return
    for (const face of AXIS_FACES[axis]) {
      const m = amountToMove(face, amounts[face] || 0)
      if (m) out.push(m)
    }
    axis = null
    amounts = null
  }
  for (const mv of moves) {
    const a = AXIS[moveFace(mv)]
    if (!a) { flush(); out.push(mv); continue }
    if (axis !== a) { flush(); axis = a; amounts = {} }
    amounts[moveFace(mv)] = ((amounts[moveFace(mv)] || 0) + moveAmount(mv)) % 4
  }
  flush()
  return out
}

// Canonical form of a face-turn sequence. Runs passes until stable, so
// cancellations that expose new merges (R U U' R' -> R R' -> nothing)
// collapse fully.
export const normalizeMoves = (moves) => {
  let cur = moves
  for (;;) {
    const next = canonicalizePass(cur)
    if (next.length === cur.length && next.every((m, i) => m === cur[i])) return next
    cur = next
  }
}

// Canonical face-turn form of an alg string, for duplicate detection across
// different notations ("R U R'" vs "R U R2 R"). Falls back to the trimmed
// string when the alg contains untranslatable tokens.
export const canonicalAlg = (alg) => {
  const faceMoves = algToFaceMoves(alg)
  return faceMoves ? normalizeMoves(faceMoves).join(' ') : (alg || '').trim()
}

// Does the string parse as a playable/matchable alg? (all tokens known,
// at least one actual turn)
export const isValidAlg = (alg) => {
  const faceMoves = algToFaceMoves(alg)
  return faceMoves !== null && faceMoves.length > 0
}

// Which of the case's algorithms did the user just execute? Compares the
// canonicalized executed moves against each candidate; returns the matching
// alg exactly as written in the collection, or null.
export const detectAlg = (executedMoves, algs) => {
  if (!executedMoves || executedMoves.length === 0) return null
  const exec = normalizeMoves(executedMoves).join(' ')
  if (exec === '') return null
  for (const alg of algs || []) {
    const faceMoves = algToFaceMoves(alg)
    if (faceMoves && normalizeMoves(faceMoves).join(' ') === exec) return alg
  }
  return null
}
