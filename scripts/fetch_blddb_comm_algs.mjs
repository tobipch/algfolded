/**
 * Build / refresh the edge- and corner-commutator (3-style) data files from
 * blddb, analogous to fetch_blddb_algs.mjs (LTCT) and fetch_blddb_twist_algs.mjs
 * (3-twists).
 *
 * blddb stores every distinct corner/edge 3-cycle exactly once, keyed in the
 * Chichu letter scheme, buffer = first letter. We decode each case by GEOMETRY
 * (apply the inverse of the first alg to a solved cube -> the scramble state),
 * then re-express it from every configurable trainer buffer whose piece is part
 * of the cycle. That makes the data buffer-order-independent: the algset picks
 * the highest-priority buffer at runtime (like 3-twists).
 *
 * Output: src/assets/corner_comms.json, src/assets/edge_comms.json, keyed by the
 * stable blddb key, values { algs, buffers: { <bufferSticker>: [t1, t2] }, scrambles }.
 * Only `algs` and `buffers` are (re)written; existing `scrambles` are preserved.
 *
 * Usage: node scripts/fetch_blddb_comm_algs.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";

const EDGE_URL = "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/edgeManmade.json";
const CORNER_URL = "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/cornerManmade.json";
const CORNER_PATH = new URL("../src/assets/corner_comms.json", import.meta.url);
const EDGE_PATH = new URL("../src/assets/edge_comms.json", import.meta.url);

const sanitize = (s) =>
  s.replace(/[()]/g, " ").replace(/([A-Za-z2'])\s+(['2])/g, "$1$2").replace(/\s+/g, " ").trim();

// ── Chichu letter scheme (blddb's key encoding) ──────────────────────────────
const CHICHU = "DEGC GAAJEDCX TQLMBBLS QNJYKHIR ZZPSHFFY WTNPWIXK OOMR";
const POSITION_ARRAY = [
  "UBL","UB","UBR","UL","U","UR","UFL","UF","UFR",
  "LUB","LU","LUF","LB","L","LF","LDB","LD","LDF",
  "FUL","FU","FUR","FL","F","FR","FDL","FD","FDR",
  "RUF","RU","RUB","RF","R","RB","RDF","RD","RDB",
  "BUR","BU","BUL","BR","B","BL","BDR","BD","BDL",
  "DFL","DF","DFR","DL","D","DR","DBL","DB","DBR",
];
// Chichu letter -> its sticker (per orbit). A letter denotes exactly one sticker
// of the relevant orbit (2-char = edge, 3-char = corner).
const cornerLetterSticker = {}, edgeLetterSticker = {};
for (let i = 0; i < POSITION_ARRAY.length; i++) {
  const ch = CHICHU[i];
  if (ch === " ") continue;
  const pos = POSITION_ARRAY[i];
  if (pos.length === 3 && !cornerLetterSticker[ch]) cornerLetterSticker[ch] = pos;
  if (pos.length === 2 && !edgeLetterSticker[ch]) edgeLetterSticker[ch] = pos;
}

// ── cubing.js piece layout (derived from face moves), sticker cyclic order ────
// Reading a sticker: at its home position sits piece p with orientation o; the
// visible sticker's identity = HOME[p][(slot + o) mod n]. Validated 100% against
// all blddb keys (see scripts/README).
const HOME_C = {
  0:["UFR","FUR","RUF"], 1:["UBR","RUB","BUR"], 2:["UBL","BUL","LUB"], 3:["UFL","LUF","FUL"],
  4:["DFR","RDF","FDR"], 5:["DFL","FDL","LDF"], 6:["DBL","LDB","BDL"], 7:["DBR","BDR","RDB"],
};
const HOME_E = {
  0:["UF","FU"], 1:["UR","RU"], 2:["UB","BU"], 3:["UL","LU"],
  4:["DF","FD"], 5:["DR","RD"], 6:["DB","BD"], 7:["DL","LD"],
  8:["FR","RF"], 9:["FL","LF"], 10:["BR","RB"], 11:["BL","LB"],
};
const stickerLoc = {}; // sticker -> { orbit, pos, slot }
for (const [p, arr] of Object.entries(HOME_C)) arr.forEach((s, slot) => (stickerLoc[s] = { orbit: "CORNERS", pos: +p, slot }));
for (const [p, arr] of Object.entries(HOME_E)) arr.forEach((s, slot) => (stickerLoc[s] = { orbit: "EDGES", pos: +p, slot }));
// piece (home position) -> its 3/2 stickers (first sticker = canonical piece name)
const cornerName = (pos) => HOME_C[pos][0];
const edgeName = (pos) => HOME_E[pos][0];

// ── configurable trainer buffers (sticker -> the piece it lives on) ──────────
// Corners: same set/stickers as the 3-twists buffers.
const CORNER_BUFFERS = { UFR:"UFR", UFL:"UFL", UBR:"UBR", UBL:"UBL", RDF:"DFR", FDL:"DFL" };
// Edges: the U/D (and F/B for equator) reference sticker of each buffer edge.
const EDGE_BUFFERS = { UF:"UF", UB:"UB", UR:"UR", UL:"UL", FR:"FR", FL:"FL", DF:"DF", DB:"DB", DR:"DR", DL:"DL" };

function reader(pat, sticker) {
  const { orbit, pos, slot } = stickerLoc[sticker];
  const o = pat.patternData[orbit];
  const mod = orbit === "CORNERS" ? 3 : 2;
  const home = orbit === "CORNERS" ? HOME_C[o.pieces[pos]] : HOME_E[o.pieces[pos]];
  return home[(((slot + o.orientation[pos]) % mod) + mod) % mod];
}
const trace = (pat, bufSticker) => [reader(pat, bufSticker), reader(pat, (reader(pat, bufSticker)))];

// pieces moved by a scramble, as canonical piece names of the given orbit
function movedPieces(pat, orbit) {
  const o = pat.patternData[orbit];
  const nameOf = orbit === "CORNERS" ? cornerName : edgeName;
  const out = new Set();
  for (let i = 0; i < o.pieces.length; i++) if (o.pieces[i] !== i || o.orientation[i] !== 0) out.add(nameOf(i));
  return out;
}

async function buildSet({ url, path, orbit, buffers }) {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const solved = kpuzzle.defaultPattern();
  const otherOrbit = orbit === "CORNERS" ? "EDGES" : "CORNERS";

  console.log(`Fetching ${orbit} commutators from blddb...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const blddb = await res.json();
  console.log(`  Got ${Object.keys(blddb).length} blddb entries.`);

  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
  const out = {};
  let impure = 0, updatedAlgs = 0, changedBuffers = 0;

  for (const [key, entries] of Object.entries(blddb)) {
    // collect + sanitize all algs for this case
    const algs = [];
    for (const entry of entries) for (const a of entry[0]) { const s = sanitize(a); if (s && !algs.includes(s)) algs.push(s); }
    if (!algs.length) continue;

    // scramble state = inverse of the (solution) alg applied to solved
    let scr;
    try { scr = solved.applyAlg(new Alg(algs[0]).invert()); } catch { continue; }

    // must be a pure 3-cycle in this orbit (nothing disturbed in the other one)
    const moved = movedPieces(scr, orbit);
    if (moved.size !== 3 || movedPieces(scr, otherOrbit).size !== 0) { impure++; continue; }

    // re-express from every trainer buffer whose piece is part of the cycle
    const bufferPairs = {};
    for (const [bufSticker, piece] of Object.entries(buffers)) {
      if (!moved.has(piece)) continue;
      const [t1, t2] = trace(scr, bufSticker);
      bufferPairs[bufSticker] = [t1, t2];
    }
    if (!Object.keys(bufferPairs).length) continue; // (shouldn't happen: >=1 buffer per cycle)

    const prev = existing[key] || {};
    if (JSON.stringify(prev.algs) !== JSON.stringify(algs)) updatedAlgs++;
    if (JSON.stringify(prev.buffers) !== JSON.stringify(bufferPairs)) changedBuffers++;
    out[key] = { algs, buffers: bufferPairs, scrambles: prev.scrambles ?? [] };
  }

  console.log(`  ${orbit}: wrote ${Object.keys(out).length} cases (impure/skipped: ${impure}, alg changes: ${updatedAlgs}, buffer changes: ${changedBuffers}).`);
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`  Written ${path.pathname}`);
  return out;
}

async function main() {
  await buildSet({ url: CORNER_URL, path: CORNER_PATH, orbit: "CORNERS", buffers: CORNER_BUFFERS });
  await buildSet({ url: EDGE_URL, path: EDGE_PATH, orbit: "EDGES", buffers: EDGE_BUFFERS });
}
main().catch((e) => { console.error(e); process.exit(1); });
