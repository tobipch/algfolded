/**
 * Refresh 3-twist algorithms from blddb (like fetch_blddb_algs.mjs for LTCT).
 *
 * Matching is by cube geometry, not Chichu keys: a case's signature is the
 * corner-orientation array of a pure 3-twist. We calibrate corner->orbit and
 * (corner,direction)->orientation from our own pure-twist cases, compute each
 * case's EXPECTED signature from its corners+direction, and match blddb by the
 * signature of its first alg. This self-corrects wrong source algs and only
 * touches `algs` (scrambles are regenerated separately).
 *
 * Usage: node scripts/fetch_blddb_twist_algs.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";

const BLDDB_URL = "https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/twistsManmade.json";
const PATH = new URL("../src/assets/three_twists.json", import.meta.url);
const sanitize = (s) => s.replace(/[()]/g, " ").replace(/([A-Za-z2'])\s+(['2])/g, "$1$2").replace(/\s+/g, " ").trim();

// orientation array of a pure 3-twist (perm identity, exactly 3 twisted), else null
function pureTwistOri(kpuzzle, algStr) {
  let p; try { p = kpuzzle.defaultPattern().applyAlg(new Alg(sanitize(algStr))); } catch { return null; }
  const c = p.patternData.CORNERS;
  for (let i = 0; i < c.pieces.length; i++) if (c.pieces[i] !== i) return null;
  if (c.orientation.filter((o) => o !== 0).length !== 3) return null;
  return c.orientation;
}

async function main() {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const map = JSON.parse(readFileSync(PATH, "utf-8"));
  const ids = Object.keys(map);

  // --- calibrate corner -> orbit index (intersection over our pure cases) ---
  const cand = {};
  for (const id of ids) {
    const ori = pureTwistOri(kpuzzle, map[id].algs[0]);
    if (!ori) continue;
    const pos = new Set(ori.map((o, i) => (o ? i : -1)).filter((i) => i >= 0));
    for (const corner of map[id].corners) {
      cand[corner] = cand[corner] ? new Set([...cand[corner]].filter((x) => pos.has(x))) : pos;
    }
  }
  const cornerOrbit = {};
  for (const corner in cand) {
    if (cand[corner].size !== 1) throw new Error(`ambiguous orbit for ${corner}: ${[...cand[corner]]}`);
    cornerOrbit[corner] = [...cand[corner]][0];
  }

  // --- calibrate (corner,dir) -> orientation value ---
  const oriCD = {};
  for (const id of ids) {
    const ori = pureTwistOri(kpuzzle, map[id].algs[0]);
    if (!ori) continue;
    for (const corner of map[id].corners) oriCD[`${corner}|${map[id].dir}`] = ori[cornerOrbit[corner]];
  }
  const expectedSig = (c) => {
    const arr = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const corner of c.corners) arr[cornerOrbit[corner]] = oriCD[`${corner}|${c.dir}`];
    return arr.join("");
  };

  // --- audit: which of our stored algs don't match their own geometry? ---
  const expToId = {};
  const wrong = [];
  for (const id of ids) {
    expToId[expectedSig(map[id])] = id;
    const ori = pureTwistOri(kpuzzle, map[id].algs[0]);
    if (!ori || ori.join("") !== expectedSig(map[id])) wrong.push(id);
  }
  console.log(`Geometry audit: ${wrong.length} case(s) with a wrong stored alg: ${wrong.join(", ") || "none"}`);

  // --- fetch + match blddb by expected signature ---
  const res = await fetch(BLDDB_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blddb = await res.json();
  let matched = 0, updated = 0, fixedWrong = 0;
  for (const entries of Object.values(blddb)) {
    const algs = [];
    for (const e of entries) for (const a of e[0]) { const s = sanitize(a); if (s) algs.push(s); }
    if (!algs.length) continue;
    const ori = pureTwistOri(kpuzzle, algs[0]);
    const id = ori && expToId[ori.join("")];
    if (!id) continue;
    matched++;
    if (JSON.stringify(map[id].algs) !== JSON.stringify(algs)) {
      if (wrong.includes(id)) fixedWrong++;
      map[id].algs = algs;
      updated++;
    }
  }
  console.log(`blddb: matched ${matched}, updated ${updated} (incl. ${fixedWrong} previously-wrong cases fixed).`);

  // any still-wrong cases blddb didn't fix?
  const stillWrong = wrong.filter((id) => {
    const ori = pureTwistOri(kpuzzle, map[id].algs[0]);
    return !ori || ori.join("") !== expectedSig(map[id]);
  });
  console.log(`Still wrong after import: ${stillWrong.join(", ") || "none"}`);

  writeFileSync(PATH, JSON.stringify(map, null, 2) + "\n");
  console.log("Written three_twists.json.");
}
main().catch((e) => { console.error(e); process.exit(1); });
