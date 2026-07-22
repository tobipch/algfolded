/**
 * Generate ambiguous scrambles for all parity cases (src/assets/parities_map.json).
 *
 * Parity cube state: one corner swap plus one edge swap (memo swap / pseudo
 * swap), as encoded by the case id. Same approach as generate_scrambles.mjs:
 * 1. Apply inverse(premoves) + inverse(algorithm) to solved cube → state S
 * 2. Solve S with Kociemba → solution
 * 3. Scramble = premoves + inverse(solution)
 *    This always produces the exact case state (P · P⁻¹ · A = A), but
 *    expressed as different moves each time — so the scramble carries no
 *    hint of the algorithm, unlike the plain inverse-of-alg fallback.
 * 4. If scramble < MIN_LENGTH moves, retry with more premoves.
 *
 * Usage: node scripts/generate_parity_scrambles.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";

const SCRAMBLES_PER_CASE = 20;
const MIN_LENGTH = 14;
const MAX_PREMOVES = 10;
const INITIAL_PREMOVES = 3;
const MAP_PATH = new URL("../src/assets/parities_map.json", import.meta.url);

const MOVES = ["U", "R", "F", "D", "L", "B"];
const SUFFIXES = ["", "'", "2"];
// Opposite faces (index pairs that shouldn't follow each other)
const OPPOSITE = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

function generatePremoves(n) {
  let previous = "";
  let result = [];
  for (let i = 0; i < n; i++) {
    let move;
    do {
      move = MOVES[Math.floor(Math.random() * MOVES.length)];
    } while (move === previous || move === OPPOSITE[previous]);
    previous = move;
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    result.push(move + suffix);
  }
  return result.join(" ");
}

function invertMoves(movesStr) {
  return new Alg(movesStr).invert().toString().replace(/(\w)2'/g, "$12");
}

function normalizeNotation(str) {
  return str
    .replace(/(\w)2'/g, "$12")   // U2' → U2
    .replace(/(\w)3'/g, "$1")    // U3' → U (3 inverse quarter turns = 1 forward)
    .replace(/(\w)3/g, "$1'");   // U3 → U' (3 forward quarter turns = 1 inverse)
}

function moveCount(scrambleStr) {
  return scrambleStr.trim().split(/\s+/).length;
}

function parseMoveList(str) {
  if (!str.trim()) return [];
  return str.trim().split(/\s+/).map(m => ({ face: m[0], suffix: m.slice(1) }));
}

function combineSuffix(a, b) {
  const vals = { "": 1, "'": -1, "2": 2 };
  const sum = ((vals[a] + vals[b]) % 4 + 4) % 4;
  return sum === 0 ? null : sum === 1 ? "" : sum === 2 ? "2" : "'";
}

// Cancel moves on the same face that are separated only by moves on the opposite (parallel) face.
// E.g. "U2 D U2" → "D", "R2 L' R" → "R' L'"
// Runs iteratively until no more cancellations are possible.
function cancelParallelMoves(moveStr) {
  let moves = parseMoveList(moveStr);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < moves.length; i++) {
      const { face } = moves[i];
      const oppFace = OPPOSITE[face];
      let j = i + 1;
      while (j < moves.length && moves[j].face === oppFace) j++;
      if (j < moves.length && moves[j].face === face) {
        const combined = combineSuffix(moves[i].suffix, moves[j].suffix);
        if (combined === null) {
          moves.splice(j, 1);
          moves.splice(i, 1);
        } else {
          moves[i] = { face, suffix: combined };
          moves.splice(j, 1);
        }
        changed = true;
        break;
      }
    }
  }
  return moves.map(m => m.face + m.suffix).join(" ");
}

async function generateOneScramble(kpuzzle, inverseAlgStr, solve) {
  for (let numPremoves = INITIAL_PREMOVES; numPremoves <= MAX_PREMOVES; numPremoves++) {
    const premoves = generatePremoves(numPremoves);
    const inversePremoves = invertMoves(premoves);

    // Apply inverse(premoves) + inverse(algorithm) to solved cube
    const combined = inversePremoves + " " + inverseAlgStr;
    const pattern = kpuzzle.defaultPattern().applyAlg(new Alg(combined));

    // Solve the state
    const solution = await solve(pattern);

    // Scramble = premoves + inverse(solution)
    // Use experimentalSimplify to cancel adjacent same-face moves, fix X2' notation
    const rawAlg = new Alg(premoves).concat(solution.invert());
    const simplified = rawAlg.experimentalSimplify({ cancel: true });
    const scramble = cancelParallelMoves(normalizeNotation(simplified.toString()));

    if (moveCount(scramble) >= MIN_LENGTH) {
      return scramble;
    }
    // Too short — retry with more premoves
  }
  // Fallback: return whatever we get with MAX_PREMOVES
  const premoves = generatePremoves(MAX_PREMOVES);
  const inversePremoves = invertMoves(premoves);
  const pattern = kpuzzle.defaultPattern().applyAlg(new Alg(inversePremoves + " " + inverseAlgStr));
  const solution = await solve(pattern);
  const rawAlg = new Alg(premoves).concat(solution.invert());
  const simplified = rawAlg.experimentalSimplify({ cancel: true });
  return cancelParallelMoves(normalizeNotation(simplified.toString()));
}

async function main() {
  const parityMap = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();

  const keys = Object.keys(parityMap);
  const total = keys.length;
  let done = 0;
  let skipped = 0;

  console.log(`Generating ${SCRAMBLES_PER_CASE} scrambles for ${total} parity cases...\n`);

  // Warm up the solver
  const warmupPattern = kpuzzle.defaultPattern().applyAlg(new Alg("R U R'"));
  await experimentalSolve3x3x3IgnoringCenters(warmupPattern);

  const startTime = Date.now();

  for (const key of keys) {
    const caseData = parityMap[key];

    if (!caseData.algs || caseData.algs.length === 0) {
      skipped++;
      done++;
      console.log(`  [${done}/${total}] ${key} — SKIPPED (no algorithms)`);
      continue;
    }

    const algStr = caseData.algs[0];
    const inverseAlgStr = new Alg(algStr).invert().toString();

    const scrambles = [];

    for (let i = 0; i < SCRAMBLES_PER_CASE; i++) {
      const scramble = await generateOneScramble(
        kpuzzle,
        inverseAlgStr,
        experimentalSolve3x3x3IgnoringCenters,
      );
      scrambles.push(scramble);
    }

    caseData.scrambles = scrambles;
    done++;

    if (done % 25 === 0 || done === total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (done / (Date.now() - startTime)) * 1000;
      const eta = ((total - done) / rate).toFixed(0);
      console.log(
        `  [${done}/${total}] ${key} — ${SCRAMBLES_PER_CASE} scrambles (${elapsed}s elapsed, ~${eta}s remaining)`,
      );
    }
  }

  writeFileSync(MAP_PATH, JSON.stringify(parityMap, null, 2) + "\n");

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! ${total - skipped} cases processed, ${skipped} skipped, in ${totalTime}s`);
  console.log(`Written to ${MAP_PATH}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
