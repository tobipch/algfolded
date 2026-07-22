/**
 * Fetch latest LTCT algorithms from blddb and update ltct_map.json, and
 * (re)generate t2c_map.json from the same file.
 *
 * LTCT matching strategy: convert blddb Chichu-scheme keys to position
 * notation, then match against existing ltct_map keys. Only the `algs`
 * arrays are updated; scrambles are left untouched since they depend on the
 * case geometry, not the specific algorithm text.
 *
 * T2C: the non-J keys of the same file are LTCTs of other buffers whose
 * twisted corner is UFR ("T2C"). They are fully regenerated (carrying the
 * pre-generated scrambles over by case id): each key
 * `[X][Y][K|L]` encodes (canonical sticker of corner X, target sticker on
 * corner Y, UFR twist RUF/FUR); the case state — and from it all six
 * 3-target memo variants (one per possible start sticker) — follows from
 * corner-orientation bookkeeping (see stickerCycle below).
 *
 * Usage: node scripts/fetch_blddb_algs.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const BLDDB_URL =
  "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/ltctManmade.json";
const MAP_PATH = new URL("../src/assets/ltct_map.json", import.meta.url);

// ── Chichu letter scheme ───────────────────────────��────────────────────
// Each character maps to the corresponding position in positionArray.
// Spaces represent face centers (not used for corners).
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

// Build letter → position lookup (corner stickers only = 3-char positions)
const letterToPos = {};
for (let i = 0; i < POSITION_ARRAY.length; i++) {
  const ch = CHICHU[i];
  if (ch !== " " && POSITION_ARRAY[i].length === 3) {
    letterToPos[ch] = POSITION_ARRAY[i];
  }
}

/**
 * Convert a Chichu 3-letter key like "JAE" to position notation like
 * "UFL LUB" (dropping the first letter which is the buffer for J-series,
 * or extracting targets + twist for A/D/G-series).
 */
function chichuKeyToPositions(key) {
  return key.split("").map((ch) => letterToPos[ch] || ch);
}

// ── T2C generation ───────────────────────────────────────────────────────

const T2C_PATH = new URL("../src/assets/t2c_map.json", import.meta.url);

// Corner stickers in clockwise order starting from the U/D facelet, so the
// index of a sticker is its orientation (0 = U/D facelet, 1 = one clockwise
// twist, 2 = two). Same table as STICKER_CYCLES in src/algsets/t2c.ts.
const CORNER_CYCLES = [
  ["UFR", "RUF", "FUR"],
  ["UFL", "FUL", "LUF"],
  ["UBL", "LUB", "BUL"],
  ["UBR", "BUR", "RUB"],
  ["DFR", "FDR", "RDF"],
  ["DFL", "LDF", "FDL"],
  ["DBL", "BDL", "LDB"],
  ["DBR", "RDB", "BDR"],
];

const cycleOf = (sticker) => CORNER_CYCLES.find((c) => c.includes(sticker));
const oriOf = (sticker) => cycleOf(sticker).indexOf(sticker);
// The sticker `n` clockwise twists away from `sticker` on the same corner.
const rot = (sticker, n) => {
  const c = cycleOf(sticker);
  return c[(c.indexOf(sticker) + n) % 3];
};

/**
 * Decode a non-J blddb key into the case's memo variants.
 *
 * The state is a "twisted 2-cycle" of corners X and Y (plus the UFR twist):
 * the sticker at facelet t1 belongs at t2, at t2 belongs at t3, at t3
 * belongs at t1 — where t1 = X's canonical sticker (the key's first letter),
 * t2 = the key's second letter and t3 is forced by the orientation-sum
 * invariant: ori(t3) = ori(t1) + ori(twist) = ori of the key's K/L suffix.
 *
 * The rigid pieces extend that 3-facelet cycle to a full facelet map H
 * (rotating both alignments), and the memo starting at any sticker s of X or
 * Y is then simply [s, H(s), H(H(s))].
 */
function decodeT2cKey(blddbKey) {
  const [t1, t2, twist] = blddbKey.split("").map((ch) => letterToPos[ch]);
  if (!t1 || !t2 || !twist) throw new Error(`Undecodable T2C key "${blddbKey}"`);
  if (oriOf(t1) !== 0) throw new Error(`T2C key "${blddbKey}": first sticker ${t1} not canonical`);
  if (cycleOf(twist)[0] !== "UFR") throw new Error(`T2C key "${blddbKey}": suffix ${twist} not on UFR`);
  if (cycleOf(t1) === cycleOf(t2) || cycleOf(t2)[0] === "UFR" || cycleOf(t1)[0] === "UFR") {
    throw new Error(`T2C key "${blddbKey}": bad corner pair ${t1}/${t2}`);
  }

  const t3 = rot(t1, oriOf(twist));
  // full facelet map on X (aligned t1 -> t2) and Y (aligned t2 -> t3)
  const H = {};
  for (let n = 0; n < 3; n++) {
    H[rot(t1, n)] = rot(t2, n);
    H[rot(t2, n)] = rot(t3, n);
  }
  const variants = {};
  for (const s of [...cycleOf(t1), ...cycleOf(t2)]) {
    variants[s] = [s, H[s], H[H[s]]];
  }
  return {
    corners: [cycleOf(t1)[0], cycleOf(t2)[0]],
    twist,
    variants,
  };
}

/** Regenerate t2c_map.json from the non-J entries of the blddb data. */
function generateT2c(blddbData) {
  // Keep the pre-generated scrambles (generate_t2c_scrambles.mjs) across
  // regenerations: like for LTCT they depend on the case geometry, not the
  // specific algorithm text.
  let previousScrambles = {};
  try {
    const previous = JSON.parse(readFileSync(T2C_PATH, "utf-8"));
    for (const [id, c] of Object.entries(previous)) {
      if (c.scrambles && c.scrambles.length > 0) previousScrambles[id] = c.scrambles;
    }
  } catch {
    // no existing map — nothing to preserve
  }

  const map = {};
  for (const [blddbKey, entries] of Object.entries(blddbData)) {
    if (blddbKey.startsWith("J")) continue;

    const allAlgs = [];
    for (const entry of entries) {
      for (const alg of entry[0]) allAlgs.push(alg.trim());
    }
    if (allAlgs.length === 0) continue;

    const { corners, twist, variants } = decodeT2cKey(blddbKey);
    const [t1, t2] = blddbKey.split("").map((ch) => letterToPos[ch]);
    // stable, buffer-order-independent id: blddb's canonical representation
    const id = `${t1} ${t2} ${twist}`;
    map[id] = { corners, twist, variants, algs: allAlgs };
    if (previousScrambles[id]) map[id].scrambles = previousScrambles[id];
  }

  const ids = Object.keys(map).sort();
  const sorted = {};
  for (const id of ids) sorted[id] = map[id];

  writeFileSync(T2C_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\nWritten t2c_map.json with ${ids.length} cases.`);
}

// ── Main ──────────────────��─────────────────────────────────���───────────

async function main() {
  // 1. Fetch blddb data
  console.log("Fetching algorithms from blddb...");
  const res = await fetch(BLDDB_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const blddbData = await res.json();
  console.log(`  Got ${Object.keys(blddbData).length} blddb entries.\n`);

  // 2. Load our map
  const ltctMap = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
  const ourKeys = Object.keys(ltctMap);
  console.log(`  Local ltct_map has ${ourKeys.length} cases.\n`);

  // 3. Build index: first-alg → our-key (for fallback matching)
  const algToOurKey = {};
  for (const [key, val] of Object.entries(ltctMap)) {
    for (const alg of val.algs) {
      algToOurKey[alg.trim()] = key;
    }
  }

  // 4. Build index: position-pair → our-key
  //    Our keys look like "UU UFL LUB". The last two words are the sticker
  //    positions. Build a lookup by sorted sticker pair.
  const positionPairToKeys = {};
  for (const key of ourKeys) {
    const parts = key.split(" ");
    const pair = [parts[1], parts[2]].sort().join("+");
    if (!positionPairToKeys[pair]) positionPairToKeys[pair] = [];
    positionPairToKeys[pair].push(key);
  }

  // 5. Match blddb entries to our cases and collect updated algorithms
  //    Only process J-prefix keys (UFR buffer), which is what this trainer uses.
  let matched = 0;
  let updated = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const [blddbKey, entries] of Object.entries(blddbData)) {
    if (!blddbKey.startsWith("J")) {
      skipped++;
      continue;
    }

    // Collect all algorithms for this blddb case
    const allAlgs = [];
    for (const entry of entries) {
      for (const alg of entry[0]) {
        allAlgs.push(alg.trim());
      }
    }

    if (allAlgs.length === 0) continue;

    // Strategy 1: match by first algorithm text
    let ourKey = algToOurKey[allAlgs[0]];

    // Strategy 2: match by position pair from Chichu key
    if (!ourKey) {
      const positions = chichuKeyToPositions(blddbKey);
      // For J-series (JAE): positions[0]=UFR (buffer), targets are [1] and [2]
      // For A/D/G-series with K/L suffix: targets are [0] and [1], [2] is twist indicator
      let targetPositions;
      if (blddbKey.startsWith("J")) {
        targetPositions = [positions[1], positions[2]];
      } else if (blddbKey.length === 3) {
        targetPositions = [positions[0], positions[1]];
      } else {
        continue; // unexpected format
      }

      const pair = targetPositions.sort().join("+");
      const candidates = positionPairToKeys[pair] || [];

      // If there's exactly one candidate, use it. Otherwise try alg matching.
      if (candidates.length === 1) {
        ourKey = candidates[0];
      } else if (candidates.length > 1) {
        // Multiple candidates (different twist types) — try alg matching
        for (const alg of allAlgs) {
          for (const candidate of candidates) {
            if (ltctMap[candidate].algs.includes(alg)) {
              ourKey = candidate;
              break;
            }
          }
          if (ourKey) break;
        }
      }
    }

    if (!ourKey) {
      unmatched++;
      console.log(`  ✗ No match for blddb key "${blddbKey}"`);
      continue;
    }

    matched++;

    // Check if algorithms changed
    const oldAlgs = ltctMap[ourKey].algs;
    if (JSON.stringify(oldAlgs) !== JSON.stringify(allAlgs)) {
      ltctMap[ourKey].algs = allAlgs;
      updated++;
      console.log(
        `  ✓ Updated "${ourKey}" (${oldAlgs.length} → ${allAlgs.length} algs)`
      );
    }
  }

  const jCount = Object.keys(blddbData).filter((k) => k.startsWith("J")).length;
  console.log(
    `\nSummary: ${matched} matched, ${updated} updated, ${unmatched} unmatched out of ${jCount} UFR-buffer entries (${skipped} non-UFR skipped).`
  );

  // 6. Write back
  if (updated > 0) {
    writeFileSync(MAP_PATH, JSON.stringify(ltctMap, null, 2) + "\n");
    console.log(`\nWritten updated ltct_map.json.`);
  } else {
    console.log(`\nNo changes — ltct_map.json is up to date.`);
  }

  // 7. T2C: the non-J entries of the same file (LTCTs of other buffers with
  //    a twisted UFR) fully regenerate t2c_map.json.
  generateT2c(blddbData);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
