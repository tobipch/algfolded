import {random_element} from "@/helpers/helpers";
import ltct_map from "@/assets/ltct_map.json"

export const makeScramble = (zbllKey) => {
  if (!zbllKey) return ""
  const entry = ltct_map[zbllKey]
  const scrambles = entry["scrambles"]

  if (!scrambles || scrambles.length === 0) {
    const algs = entry["algs"]
    if (!algs || algs.length === 0) return ""
    return inverseScramble(algs[0])
  }

  return random_element(scrambles);
}

export const invertMove = (m) => {
  if (!m || m.length === 0) return ""
  if (m[m.length - 1] === '2') return m
  if (m[m.length - 1] === '\'') return m.slice(0, -1)
  return `${m}'`
}

export const inverseScramble = s => {
  return s.split(" ").map(invertMove).reverse().join(" ");
};

export const moveFace = (m) => m[0]

export const moveAmount = (m) => {
  if (m.endsWith("'")) return 3
  if (m.endsWith("2")) return 2
  return 1
}

export const amountToMove = (face, amount) => {
  const a = ((amount % 4) + 4) % 4
  if (a === 0) return null
  if (a === 1) return face
  if (a === 2) return face + '2'
  return face + "'"
}

// How each rotation remaps face positions: rotation → { newPosition: originalFace }
const ROTATION_MAP = {
  'x':   { U:'F', D:'B', F:'D', B:'U', L:'L', R:'R' },
  "x'":  { U:'B', D:'F', F:'U', B:'D', L:'L', R:'R' },
  'x2':  { U:'D', D:'U', F:'B', B:'F', L:'L', R:'R' },
  'y':   { U:'U', D:'D', F:'R', B:'L', L:'F', R:'B' },
  "y'":  { U:'U', D:'D', F:'L', B:'R', L:'B', R:'F' },
  'y2':  { U:'U', D:'D', F:'B', B:'F', L:'R', R:'L' },
  'z':   { U:'L', D:'R', F:'F', B:'B', L:'D', R:'U' },
  "z'":  { U:'R', D:'L', F:'F', B:'B', L:'U', R:'D' },
  'z2':  { U:'D', D:'U', F:'F', B:'B', L:'R', R:'L' },
}

function applyRotation(map, rot) {
  const rmap = ROTATION_MAP[rot]
  if (!rmap) return map
  const result = {}
  for (const face of Object.keys(rmap)) {
    result[face] = map[rmap[face]]
  }
  return result
}

// Build a function that remaps cube-reported moves to match the user's oriented frame.
// With z2 orientation: D' → U', D2 → U2, etc. (face swap, direction preserved).
// Returns null if no orientation is set.
export function buildMoveRemap(orientationString) {
  const rotations = (orientationString || '').trim().split(/\s+/).filter(Boolean)
  if (rotations.length === 0) return null

  // Build position→originalFace mapping
  let mapping = { U:'U', D:'D', F:'F', B:'B', L:'L', R:'R' }
  for (const rot of rotations) {
    mapping = applyRotation(mapping, rot)
  }

  // Invert to get standardFace→userPosition
  const inverse = {}
  for (const [pos, face] of Object.entries(mapping)) {
    inverse[face] = pos
  }

  return (move) => {
    const face = moveFace(move)
    const target = inverse[face]
    if (!target || target === face) return move
    return target + move.slice(1)
  }
}
