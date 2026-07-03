/**
 * Fetch parity algorithms from blddb and (re)generate parities_map.json.
 *
 * A parity alg swaps the corner buffer with one corner target and, at the
 * same time, two edges (memo swap / pseudo swap). blddb keys are 4 Chichu
 * letters: [edge 1][edge 2][corner buffer][corner target] — edges and
 * corners use separate letter tables. Orientation is encoded in the sticker
 * names (e.g. UF-UB vs UF-BU = flipped swap).
 *
 * Usage: node scripts/fetch_blddb_parity_algs.mjs
 */

import { writeFileSync } from "node:fs";

const BLDDB_URL =
  "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/parityManmade.json";
const MAP_PATH = new URL("../src/assets/parities_map.json", import.meta.url);

// ── Chichu letter scheme (same layout as fetch_blddb_algs.mjs) ──────────
const CHICHU =
  "DEGC GAAJEDCX TQLMBBLS QNJYKHIR ZZPSHFFY WTNPWIXK OOMR";

const POSITION_ARRAY = [
  "UBL", "UB", "UBR", "UL", "U", "UR", "UFL", "UF", "UFR",
  "LUB", "LU", "LUF", "LB", "L", "LF", "LDB", "LD", "LDF",
  "FUL", "FU", "FUR", "FL", "F", "FR", "FDL", "FD", "FDR",
  "RUF", "RU", "RUB", "RF", "R", "RB", "RDF", "RD", "RDB",
  "BUR", "BU", "BUL", "BR", "B", "BL", "BDR", "BD", "BDL",
  "DFL", "DF", "DFR", "DL", "D", "DR", "DBL", "DB", "DBR",
];

// Corners and edges share letters, so build one table per piece type.
const cornerOf = {};
const edgeOf = {};
for (let i = 0; i < POSITION_ARRAY.length; i++) {
  const ch = CHICHU[i];
  if (ch === " ") continue;
  if (POSITION_ARRAY[i].length === 3) cornerOf[ch] = POSITION_ARRAY[i];
  if (POSITION_ARRAY[i].length === 2) edgeOf[ch] = POSITION_ARRAY[i];
}

// Display/id convention: when the swap involves the UF piece, its sticker
// comes first ("UF-UR", not "UR-UF" as blddb writes it). A sticker swap is
// symmetric, so this only normalizes the representation.
const normalizeEdgePair = (e1, e2) => {
  const onUF = (s) => s === "UF" || s === "FU";
  if (!onUF(e1) && onUF(e2)) return [e2, e1];
  return [e1, e2];
};

async function main() {
  console.log("Fetching parity algorithms from blddb...");
  const res = await fetch(BLDDB_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const blddbData = await res.json();
  console.log(`  Got ${Object.keys(blddbData).length} blddb entries.`);

  const map = {};
  for (const [blddbKey, entries] of Object.entries(blddbData)) {
    const [c1, c2, c3, c4] = blddbKey.split("");
    const eRaw = [edgeOf[c1], edgeOf[c2]];
    const cornerBuffer = cornerOf[c3];
    const cornerTarget = cornerOf[c4];
    if (!eRaw[0] || !eRaw[1] || !cornerBuffer || !cornerTarget) {
      throw new Error(`Undecodable parity key "${blddbKey}"`);
    }

    const allAlgs = [];
    for (const entry of entries) {
      for (const alg of entry[0]) allAlgs.push(alg.trim());
    }
    if (allAlgs.length === 0) continue;

    const [e1, e2] = normalizeEdgePair(...eRaw);
    const id = `${cornerBuffer} ${cornerTarget} ${e1} ${e2}`;
    map[id] = { algs: allAlgs };
  }

  const ids = Object.keys(map).sort();
  const sorted = {};
  for (const id of ids) sorted[id] = map[id];

  writeFileSync(MAP_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\nWritten parities_map.json with ${ids.length} cases.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
