import {moveFace, moveAmount, amountToMove, ROTATION_MAP, applyRotation, expandCommutator} from '@/helpers/scramble_utils'

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
  // Expand commutator / conjugate notation (e.g. "[R U R': [D, R2]]") to a
  // plain move sequence first, so such algs are validated, deduplicated,
  // played and detected like any other.
  let source = alg || ''
  if (/[[\],:]/.test(source)) {
    const expanded = expandCommutator(source)
    if (expanded === null) return null
    source = expanded
  }
  const tokens = source.trim().split(/\s+/).filter(Boolean)
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

// How much execution intent a spelling carries: commutator/conjugate
// notation (2) > wide/slice/rotation moves (1) > plain outer turns (0).
// The plain face-turn spelling is mechanically derivable from the richer
// ones (that is exactly what algToFaceMoves does), so when two spellings
// are the same moves, the richer one is the better representative.
export const notationRichness = (alg) => {
  const s = (alg || '').trim()
  if (/[[\],:]/.test(s)) return 2
  const plain = s.split(/\s+/).filter(Boolean)
    .every(t => FACES.has(t.replace(/['2]+$/, '')))
  return plain ? 0 : 1
}

// Collapse canonically-equivalent spellings of the same algorithm into one
// list entry — blddb lists e.g. "D L D' ..." and "D r F' ..." (identical
// moves, wide vs face notation) as two algs. Keeps the order of first
// occurrence; within a group the spelling with the richest notation wins.
export const dedupeAlgs = (algs) => {
  const byCanon = new Map()
  for (const alg of algs || []) {
    const canon = canonicalAlg(alg)
    const cur = byCanon.get(canon)
    if (cur === undefined || notationRichness(alg) > notationRichness(cur)) {
      byCanon.set(canon, alg) // re-setting a key keeps its list position
    }
  }
  return [...byCanon.values()]
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
//
// A case can list several algs that are the same moves written differently
// (e.g. "U2 r' F2 r …" vs "U2 L' U2 L …" — wide vs face notation). When the
// executed moves match more than one, `preferred` (the user's chosen alg) wins
// so detection doesn't flip them onto an equivalent alg that merely appears
// earlier in the list.
/**
 * @param {string[]|null} executedMoves
 * @param {string[]|null|undefined} algs
 * @param {string|null} [preferred]
 * @returns {string|null}
 */
export const detectAlg = (executedMoves, algs, preferred = null) => {
  if (!executedMoves || executedMoves.length === 0) return null
  const exec = normalizeMoves(executedMoves).join(' ')
  if (exec === '') return null
  const matches = (alg) => {
    const faceMoves = algToFaceMoves(alg)
    return faceMoves && normalizeMoves(faceMoves).join(' ') === exec
  }
  if (preferred && matches(preferred)) return preferred
  for (const alg of algs || []) {
    if (matches(alg)) return alg
  }
  return null
}
