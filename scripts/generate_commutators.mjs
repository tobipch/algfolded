/**
 * Rewrite the corner- and edge-commutator algs in commutator notation, the same
 * way blddb.net does: every expanded alg is structurally decomposed into
 * "[setup: [A, B]]" form with nbwzx's commutator library (vendored in
 * scripts/vendor/commutator.cjs, MIT). The decomposition is the SAME move
 * sequence re-written — not a different algorithm — and every result is
 * verified against the original with cubing.js before being written. Algs the
 * decomposer can't express (blddb shows "Not found." for these) keep their
 * expanded form.
 *
 * Runs after fetch_blddb_comm_algs.mjs in the weekly update workflow, so the
 * fetched (expanded) algs are converted before the PR is opened.
 *
 * Usage: node scripts/generate_commutators.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { puzzles } from "cubing/puzzles";

const require = createRequire(import.meta.url);
const commutator = require("./vendor/commutator.cjs");

const WRITE = process.argv.includes("--write");
const CORNER_PATH = new URL("../src/assets/corner_comms.json", import.meta.url);
const EDGE_PATH = new URL("../src/assets/edge_comms.json", import.meta.url);

// blddb-style output: "[R' B' R: [R D R', U']]" — outer brackets and spaces
// after separators, matching the app's own commutator grammar.
const SEARCH_OPTS = { outerBrackets: true, spaceAfterColon: true, spaceAfterComma: true };

const invMove = (m) => (m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : m + "'");

// Expand "[A, B]" / "[A: B]" notation to a plain move string. Same grammar as
// the app's expandCommutator (src/helpers/scramble_utils.js), duplicated here
// because the app helper pulls in Vue-aliased imports Node can't resolve.
const expandNotation = (str) => {
  const s = (str || "").trim();
  if (!s) return null;
  const invert = (moves) => moves.slice().reverse().map(invMove);
  let i = 0;
  const parseSeq = (stops) => {
    const moves = [];
    let buf = "";
    const flush = () => {
      const t = buf.trim();
      if (t) for (const tok of t.split(/\s+/)) moves.push(tok);
      buf = "";
    };
    while (i < s.length) {
      const c = s[i];
      if (stops.includes(c)) break;
      if (c === "[") {
        flush();
        i++;
        const a = parseSeq([",", ":"]);
        const sep = s[i];
        if (a === null || (sep !== "," && sep !== ":")) return null;
        i++;
        const b = parseSeq(["]"]);
        if (b === null || s[i] !== "]") return null;
        i++;
        if (sep === ",") moves.push(...a, ...b, ...invert(a), ...invert(b));
        else moves.push(...a, ...b, ...invert(a));
      } else if (c === "]" || c === "," || c === ":") {
        return null;
      } else {
        buf += c;
        i++;
      }
    }
    flush();
    return moves;
  };
  const result = parseSeq([]);
  if (result === null || i < s.length) return null;
  return result.join(" ");
};

async function main() {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const solved = kpuzzle.defaultPattern();
  const sameEffect = (a, b) => {
    try {
      return solved.applyAlg(a).isIdentical(solved.applyAlg(b));
    } catch {
      return false;
    }
  };

  // Decompose one alg; returns the verified notation or null.
  const decompose = (alg) => {
    let results;
    try {
      results = commutator.search({ algorithm: alg, ...SEARCH_OPTS });
    } catch {
      return null;
    }
    const best = results?.[0];
    if (!best || best.includes("Not found") || !best.includes("[")) return null;
    const expanded = expandNotation(best);
    if (!expanded || !sameEffect(expanded, alg)) return null;
    return best;
  };

  const processFile = (path, label) => {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    let converted = 0, kept = 0, already = 0, total = 0;
    for (const c of Object.values(data)) {
      if (!Array.isArray(c.algs)) continue;
      c.algs = c.algs.map((alg) => {
        total++;
        if (/[[\],:]/.test(alg)) { already++; return alg; } // already in notation
        const notation = decompose(alg);
        if (notation) { converted++; return notation; }
        kept++;
        return alg;
      });
    }
    console.log(`${label}: ${converted}/${total} algs converted to commutator notation` +
      ` (${already} already were, ${kept} not decomposable).`);
    if (WRITE) {
      writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
      console.log(`  wrote ${path.pathname}`);
    }
  };

  processFile(CORNER_PATH, "corners");
  processFile(EDGE_PATH, "edges");
}
main().catch((e) => { console.error(e); process.exit(1); });
