/**
 * Build raw 3-twist cases from the source CSV.
 *
 * A "twist" = 3 corners all rotated the same direction (cw/ccw). The CSV lists
 * them per buffer in a triangular matrix; each cell carries a CW and a CCW
 * variant with its letter pair and algorithm.
 *
 * Output: src/assets/three_twists.json keyed by a stable, buffer-order-
 * independent id ("cw UBL-UBR-UFR"), values { id, corners:[3], dir, algs }.
 * (Scrambles are added by a later step; the path/grouping is derived at runtime
 * from the configurable buffer order.)
 */
import { readFileSync, writeFileSync } from "node:fs";

const CSV = "/root/.claude/uploads/5122d928-164e-5ea4-a3d9-c7bbaa64298c/94cd9471-BLD_Tobias_Peter__3Twists.csv";
const OUT = new URL("../src/assets/three_twists.json", import.meta.url);

// canonical corner by its set of 3 face letters
const CORNER_BY_FACES = {
  BLU: "UBL", BRU: "UBR", FRU: "UFR", FLU: "UFL",
  DFR: "DFR", DFL: "DFL", BDR: "DBR", BDL: "DBL",
};
const canon = (name) => {
  const key = name.toUpperCase().split("").sort().join("");
  const c = CORNER_BY_FACES[key];
  if (!c) throw new Error(`unknown corner "${name}"`);
  return c;
};

// validated per-corner twist letters (from the CSV) for a cross-check
const CW  = { UBL:"R", UBR:"N", UFL:"F", UFR:"M", DFR:"P", DFL:"L", DBR:"T", DBL:"H" };
const CCW = { UBL:"E", UBR:"Q", UFL:"I", UFR:"J", DFR:"K", DFL:"G", DBR:"O", DBL:"S" };

function parseRecords(text) {
  const recs = []; let cur = "", q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    if (ch === "\n" && !q) { recs.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur) recs.push(cur);
  return recs.map(splitCsvLine);
}
function splitCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}

const records = parseRecords(readFileSync(CSV, "utf-8"));

// Clean up CSV alg typos so cubing can parse them: drop grouping parens and
// join a move with a stray space before its modifier ("D 2" -> "D2", "R '" -> "R'").
const sanitizeAlg = (s) =>
  s.replace(/[()]/g, " ")
   .replace(/([A-Za-z2'])\s+(['2])/g, "$1$2")
   .replace(/\s+/g, " ")
   .trim();

const twists = {};
const sortCorners = (cs) => [...cs].sort(); // stable string sort of canonical names
let header = null, buffer = null, cols = [];
let mismatches = 0;

for (const rec of records) {
  const c0 = (rec[0] || "").trim();
  if (c0.startsWith("Buffer:")) {
    header = rec.map((x) => x.trim());
    buffer = canon(c0.replace("Buffer:", "").trim());
    cols = header.slice(1).filter(Boolean).map(canon);
    continue;
  }
  if (!header || c0 === "" || c0.startsWith("#Algs") || /^\d+$/.test(c0)) continue;

  const firstTarget = canon(c0);
  for (let i = 1; i < rec.length; i++) {
    const cell = (rec[i] || "").trim();
    if (!cell) continue;
    const secondTarget = cols[i - 1];
    if (!secondTarget) continue;

    for (const [dir, table, label] of [["cw", CW, "CW"], ["ccw", CCW, "CCW"]]) {
      const m = cell.match(new RegExp("\\b" + label + " \\(([A-Z]{2})\\):\\s*([^\\n]+)"));
      if (!m) continue;
      const [letterPair, algRaw] = [m[1], sanitizeAlg(m[2].replace(/"+$/, ""))];
      // cross-check letters against the validated mapping
      const expected = [table[firstTarget], table[secondTarget]].sort().join("");
      if ([...letterPair].sort().join("") !== expected) {
        mismatches++;
        if (mismatches <= 8) console.log(`  letter mismatch ${buffer}/${firstTarget}/${secondTarget} ${label}: csv=${letterPair} expected=${expected}`);
      }
      const corners = sortCorners([buffer, firstTarget, secondTarget]);
      const id = `${dir} ${corners.join("-")}`;
      if (!twists[id]) twists[id] = { id, corners, dir, algs: [] };
      if (algRaw && !twists[id].algs.includes(algRaw)) twists[id].algs.push(algRaw);
    }
  }
}

const list = Object.values(twists);
console.log(`Parsed ${list.length} twists (expected 112). Letter mismatches: ${mismatches}.`);
console.log(`With >=1 alg: ${list.filter((t) => t.algs.length > 0).length}`);
console.log("samples:");
for (const id of ["cw UBL-UBR-UFR", "ccw UBL-UBR-UFR"]) {
  const t = twists[id];
  if (t) console.log(`  ${id}: dir=${t.dir} corners=${t.corners.join(",")} alg0="${t.algs[0]?.slice(0,40)}…"`);
}
writeFileSync(OUT, JSON.stringify(twists, null, 2) + "\n");
console.log(`Wrote ${OUT.pathname}`);
