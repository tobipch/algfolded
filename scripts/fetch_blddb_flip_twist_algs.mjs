/**
 * Build / refresh the edge-2-flip and corner-2-twist data files from blddb.
 *
 * - 2-flips: flipsManmade.json — every pair of flipped edges (66 cases).
 * - 2-twists: the length-2 keys of twistsManmade.json — every pair of twisted
 *   corners, one CW one CCW (56 cases). (The length-3 keys are the 3-twists,
 *   handled by fetch_blddb_twist_algs.mjs.)
 *
 * Like the commutator importer, each case is decoded by cube geometry (apply the
 * inverse of the first alg -> the scramble state) and stored buffer-order-
 * independently: `buffers` maps every piece in the case to what the other piece
 * needs for its label, so the set re-groups live from the configurable buffer
 * order. Only `algs`/`buffers` are (re)written; existing `scrambles` are kept.
 *
 * Output: src/assets/edge_flips.json, src/assets/corner_twists2.json.
 *
 * Usage: node scripts/fetch_blddb_flip_twist_algs.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";

const FLIPS_URL = "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/flipsManmade.json";
const TWISTS_URL = "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/twistsManmade.json";
const FLIPS_PATH = new URL("../src/assets/edge_flips.json", import.meta.url);
const TWISTS_PATH = new URL("../src/assets/corner_twists2.json", import.meta.url);

const sanitize = (s) =>
  s.replace(/[()]/g, " ").replace(/([A-Za-z2'])\s+(['2])/g, "$1$2").replace(/\s+/g, " ").trim();

// cubing.js piece layout (see fetch_blddb_comm_algs.mjs). HOME[pos] lists the
// sticker names at each slot in the solved state.
const HOME_C = {
  0:["UFR","FUR","RUF"], 1:["UBR","RUB","BUR"], 2:["UBL","BUL","LUB"], 3:["UFL","LUF","FUL"],
  4:["DFR","RDF","FDR"], 5:["DFL","FDL","LDF"], 6:["DBL","LDB","BDL"], 7:["DBR","BDR","RDB"],
};
const HOME_E = {
  0:["UF","FU"], 1:["UR","RU"], 2:["UB","BU"], 3:["UL","LU"],
  4:["DF","FD"], 5:["DR","RD"], 6:["DB","BD"], 7:["DL","LD"],
  8:["FR","RF"], 9:["FL","LF"], 10:["BR","RB"], 11:["BL","LB"],
};
const cornerName = (p) => HOME_C[p][0];
const edgeName = (p) => HOME_E[p][0];

// corner piece -> its tracked buffer sticker (matches the 3-twists buffers, plus
// the two never-configured back corners as their own U/D facelet).
const CORNER_BUFFER_STICKER = {
  UFR: "UFR", UFL: "UFL", UBR: "UBR", UBL: "UBL", DFR: "RDF", DFL: "FDL", DBR: "DBR", DBL: "DBL",
};

// Landing sticker of a twisted corner's U/D facelet: with orientation o in place,
// the U/D facelet sits at slot (3-o)%3, whose solved position name is that sticker.
const landingSticker = (pos, o) => HOME_C[pos][(3 - o) % 3];

async function buildFlips(kpuzzle, solved) {
  console.log("Fetching 2-flips from blddb...");
  const res = await fetch(FLIPS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blddb = await res.json();
  const existing = existsSync(FLIPS_PATH) ? JSON.parse(readFileSync(FLIPS_PATH, "utf-8")) : {};
  const out = {};
  let impure = 0;
  for (const [key, entries] of Object.entries(blddb)) {
    const algs = [];
    for (const e of entries) for (const a of e[0]) { const s = sanitize(a); if (s && !algs.includes(s)) algs.push(s); }
    if (!algs.length) continue;
    let scr; try { scr = solved.applyAlg(new Alg(algs[0]).invert()); } catch { continue; }
    const E = scr.patternData.EDGES, C = scr.patternData.CORNERS;
    const flipped = []; let bad = false;
    for (let i = 0; i < 12; i++) {
      if (E.pieces[i] !== i) bad = true;
      if (E.orientation[i] === 1) flipped.push(edgeName(i));
      else if (E.orientation[i] !== 0) bad = true;
    }
    if (bad || flipped.length !== 2 || C.pieces.some((p, i) => p !== i) || C.orientation.some((o) => o !== 0)) { impure++; continue; }
    const [a, b] = flipped;
    const prev = existing[key] || {};
    out[key] = { algs, buffers: { [a]: b, [b]: a }, scrambles: prev.scrambles ?? [] };
  }
  console.log(`  2-flips: wrote ${Object.keys(out).length} cases (skipped ${impure}).`);
  writeFileSync(FLIPS_PATH, JSON.stringify(out, null, 2) + "\n");
}

async function buildTwists(kpuzzle, solved) {
  console.log("Fetching 2-twists from blddb...");
  const res = await fetch(TWISTS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blddb = await res.json();
  const existing = existsSync(TWISTS_PATH) ? JSON.parse(readFileSync(TWISTS_PATH, "utf-8")) : {};
  const out = {};
  let impure = 0;
  for (const [key, entries] of Object.entries(blddb)) {
    if (key.length !== 2) continue; // length-3 keys are the 3-twists set
    const algs = [];
    for (const e of entries) for (const a of e[0]) { const s = sanitize(a); if (s && !algs.includes(s)) algs.push(s); }
    if (!algs.length) continue;
    let scr; try { scr = solved.applyAlg(new Alg(algs[0]).invert()); } catch { continue; }
    const C = scr.patternData.CORNERS, E = scr.patternData.EDGES;
    const twisted = []; let bad = false;
    for (let i = 0; i < 8; i++) {
      if (C.pieces[i] !== i) bad = true;
      if (C.orientation[i] !== 0) twisted.push({ name: cornerName(i), landing: landingSticker(i, C.orientation[i]) });
    }
    if (bad || twisted.length !== 2 || E.pieces.some((p, i) => p !== i) || E.orientation.some((o) => o !== 0)) { impure++; continue; }
    // buffers: each corner's tracked buffer sticker -> the OTHER corner's landing sticker.
    const [x, y] = twisted;
    const buffers = {
      [CORNER_BUFFER_STICKER[x.name]]: y.landing,
      [CORNER_BUFFER_STICKER[y.name]]: x.landing,
    };
    const prev = existing[key] || {};
    out[key] = { algs, buffers, scrambles: prev.scrambles ?? [] };
  }
  console.log(`  2-twists: wrote ${Object.keys(out).length} cases (skipped ${impure}).`);
  writeFileSync(TWISTS_PATH, JSON.stringify(out, null, 2) + "\n");
}

async function main() {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const solved = kpuzzle.defaultPattern();
  await buildFlips(kpuzzle, solved);
  await buildTwists(kpuzzle, solved);
}
main().catch((e) => { console.error(e); process.exit(1); });
