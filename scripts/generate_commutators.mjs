/**
 * Generate commutator / conjugate notation for the corner- and edge-commutator
 * sets. blddb ships these algs only as expanded move sequences; here we search
 * for a nice commutator that has the *exact* same effect on the cube and, when
 * found, prepend it to the case's alg list so the app shows it in commutator
 * notation. Every commutator is verified against the case's transformation with
 * cubing.js, so a generated commutator is never wrong (cases with no commutator
 * in the search space simply keep their expanded algs).
 *
 * A 3-cycle is solved by a pure commutator [A, B] or a conjugated commutator
 * [S: [A, B]], where A = "P Q P'" is an insert, B is an interchange, and S is a
 * short setup. We precompute the transformation of every candidate pure
 * commutator once, key them, and then for each case look up the case's
 * transformation conjugated by each setup.
 *
 * Usage: node scripts/generate_commutators.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { puzzles } from "cubing/puzzles";

const WRITE = process.argv.includes("--write");
const CORNER_PATH = new URL("../src/assets/corner_comms.json", import.meta.url);
const EDGE_PATH = new URL("../src/assets/edge_comms.json", import.meta.url);

const FACES = ["U", "D", "F", "B", "R", "L"];
const AMOUNTS = ["", "'", "2"];
const ALL_MOVES = FACES.flatMap((f) => AMOUNTS.map((a) => f + a));
const QUARTERS = FACES.flatMap((f) => ["", "'"].map((a) => f + a));
const SLICES = ["M", "E", "S"].flatMap((f) => AMOUNTS.map((a) => f + a));

const invMove = (m) => (m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : m + "'");
const invSeq = (s) => s.split(" ").filter(Boolean).map(invMove).reverse().join(" ");
const sameFace = (a, b) => a[0] === b[0];

async function main() {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const T = (algStr) => kpuzzle.algToTransformation(algStr);

  // Serialize a transformation's CORNERS+EDGES permutation & orientation.
  const key = (t) => {
    const d = t.transformationData;
    const orbit = (o) => o.permutation.join(",") + ";" + o.orientationDelta.join(",");
    return orbit(d.CORNERS) + "|" + orbit(d.EDGES);
  };

  const identityKey = key(T(""));

  // Build the pure-commutator map for one orbit. `interchanges` are the B moves:
  // for edges we use slice moves (M/E/S) which leave corners untouched, so
  // [A, B] is provably corner-safe; for corners we use face turns.
  const buildPureMap = (interchanges) => {
    const map = new Map();
    const addPure = (A, B) => {
      const expanded = `${A} ${B} ${invSeq(A)} ${invMove(B)}`;
      const k = key(T(expanded));
      const comm = `[${A}, ${B}]`;
      const prev = map.get(k);
      if (prev && prev.comm.length <= comm.length) return; // keep the shorter
      map.set(k, { comm, expanded });
    };
    for (const p of ALL_MOVES) {
      for (const q of QUARTERS) {
        if (sameFace(p, q)) continue; // P Q P' with same face is just Q
        const A = `${p} ${q} ${invMove(p)}`;
        for (const b of interchanges) addPure(A, b);
      }
    }
    return map;
  };

  // setups: identity, then 1- and (face-only) 2-move sequences. Conjugating by
  // any setup preserves the inner commutator's safe orbit, so face setups are
  // fine for both corners and edges.
  const makeSetups = (extra = []) => {
    const s = [""];
    for (const a of [...ALL_MOVES, ...extra]) s.push(a);
    for (const a of ALL_MOVES) for (const b of ALL_MOVES) if (!sameFace(a, b)) s.push(`${a} ${b}`);
    return s;
  };

  // Find a commutator (notation string) whose transform == target, or null.
  const makeSolver = (pureMap, setups) => (targetAlg) => {
    const target = T(targetAlg);
    const tgtKey = key(target);
    if (tgtKey === identityKey) return null;
    for (const S of setups) {
      // conjugated target = S' · target · S  -> look up as a pure commutator
      const conj = S === "" ? target : T(`${invSeq(S)} ${targetAlg} ${S}`);
      const hit = pureMap.get(key(conj));
      if (!hit) continue;
      const notation = S === "" ? hit.comm : `[${S}: ${hit.comm}]`;
      const expanded = S === "" ? hit.expanded : `${S} ${hit.expanded} ${invSeq(S)}`;
      // verify: the commutator must have the exact same effect as the case alg
      if (key(T(expanded)) === tgtKey) return notation;
    }
    return null;
  };

  console.log("Precomputing pure commutators…");
  const cornerSolve = makeSolver(buildPureMap(ALL_MOVES), makeSetups());
  const edgeSolve = makeSolver(buildPureMap(SLICES), makeSetups(SLICES));

  const process = (path, label, solve) => {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const ids = Object.keys(data);
    let found = 0, already = 0;
    for (const id of ids) {
      const algs = data[id].algs || [];
      if (!algs.length) continue;
      if (algs.some((a) => /[[\],:]/.test(a))) { already++; continue; } // already has a commutator
      const comm = solve(algs[0]);
      if (comm) {
        data[id].algs = [comm, ...algs];
        found++;
      }
    }
    console.log(`${label}: ${found}/${ids.length} got a commutator (${already} already had one).`);
    if (WRITE) { writeFileSync(path, JSON.stringify(data, null, 2) + "\n"); console.log(`  wrote ${path.pathname}`); }
  };

  process(CORNER_PATH, "corners", cornerSolve);
  process(EDGE_PATH, "edges", edgeSolve);
}
main().catch((e) => { console.error(e); process.exit(1); });
