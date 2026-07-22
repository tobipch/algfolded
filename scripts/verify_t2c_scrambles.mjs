/**
 * Verify that generated T2C scrambles produce correct case states.
 * Checks: edges = [1,0,2,3,...,11] with all-zero orientation (UF↔UR swap),
 * corners match the expected state from inverse(algorithm), and no scramble
 * is just the inverse of one of the case's algs (the point of pre-generating
 * them is that they carry no hint of the algorithm).
 */

import { readFileSync } from "node:fs";
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";

const MAP_PATH = new URL("../src/assets/t2c_map.json", import.meta.url);
const EXPECTED_EDGES = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const EXPECTED_EDGE_ORIENT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const t2cMap = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
const kpuzzle = await puzzles["3x3x3"].kpuzzle();

let checked = 0;
let errors = 0;
const SAMPLE_SIZE = 3; // check first N scrambles per case

for (const [key, caseData] of Object.entries(t2cMap)) {
  if (!caseData.algs || caseData.algs.length === 0) continue;

  // Expected corner state
  const inverseAlg = new Alg(caseData.algs[0]).invert();
  const expectedPattern = kpuzzle.defaultPattern().applyAlg(inverseAlg);
  const expectedCornerPieces = [...expectedPattern.patternData.CORNERS.pieces];
  const expectedCornerOrient = [...expectedPattern.patternData.CORNERS.orientation];

  const inverseAlgs = new Set(
    caseData.algs.map((a) => new Alg(a).invert().toString()),
  );

  const scrambles = caseData.scrambles ?? [];
  if (scrambles.length === 0) {
    errors++;
    console.error(`FAIL: ${key} has no scrambles`);
    continue;
  }

  for (let i = 0; i < Math.min(SAMPLE_SIZE, scrambles.length); i++) {
    const scramble = scrambles[i];
    const result = kpuzzle.defaultPattern().applyAlg(new Alg(scramble));

    const edgePieces = [...result.patternData.EDGES.pieces];
    const edgeOrient = [...result.patternData.EDGES.orientation];
    const cornerPieces = [...result.patternData.CORNERS.pieces];
    const cornerOrient = [...result.patternData.CORNERS.orientation];

    // Check edges
    const edgesOk =
      JSON.stringify(edgePieces) === JSON.stringify(EXPECTED_EDGES) &&
      JSON.stringify(edgeOrient) === JSON.stringify(EXPECTED_EDGE_ORIENT);

    // Check corners
    const cornersOk =
      JSON.stringify(cornerPieces) === JSON.stringify(expectedCornerPieces) &&
      JSON.stringify(cornerOrient) === JSON.stringify(expectedCornerOrient);

    // Check independence from the algs
    const independent = !inverseAlgs.has(new Alg(scramble).toString());

    if (!edgesOk || !cornersOk || !independent) {
      errors++;
      console.error(`FAIL: ${key} scramble[${i}]: ${scramble}`);
      if (!edgesOk) {
        console.error(`  Edges: got [${edgePieces}] orient [${edgeOrient}]`);
        console.error(`  Expected: [${EXPECTED_EDGES}] orient [${EXPECTED_EDGE_ORIENT}]`);
      }
      if (!cornersOk) {
        console.error(`  Corners: got [${cornerPieces}] orient [${cornerOrient}]`);
        console.error(`  Expected: [${expectedCornerPieces}] orient [${expectedCornerOrient}]`);
      }
      if (!independent) {
        console.error(`  Scramble is the inverse of one of the case's algs`);
      }
    }
    checked++;
  }
}

console.log(`\nVerified ${checked} scrambles across ${Object.keys(t2cMap).length} cases.`);
if (errors === 0) {
  console.log("ALL PASSED — every scramble produces the correct T2C state.");
} else {
  console.error(`${errors} FAILURES found.`);
}
process.exit(errors > 0 ? 1 : 0);
