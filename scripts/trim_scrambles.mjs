/**
 * Cap the pre-generated scrambles in the algset data files.
 *
 *   node scripts/trim_scrambles.mjs [n]        # default: SCRAMBLES_PER_CASE
 *   node scripts/trim_scrambles.mjs 12 --dry
 *
 * The generators (generate_*_scrambles.mjs) produce N per case and skip cases
 * that already have some, so lowering their constant only affects newly
 * generated cases. This trims what is already committed, without re-running the
 * expensive Kociemba solves.
 *
 * Keeps the FIRST n — they are independent of each other (each is solved from
 * the case state with its own random pre-moves), so the first n are as varied
 * as any other n.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const KEEP = Number(process.argv[2]) || 12
const DRY = process.argv.includes('--dry')

const FILES = ['edge_comms', 'corner_comms', 'parities_map', 'ltct_map',
  't2c_map', 'three_twists', 'edge_flips', 'corner_twists2']

const fmt = (b) => (b / 1024).toFixed(0) + 'K'

let beforeTotal = 0
let afterTotal = 0

for (const name of FILES) {
  const url = new URL(`../src/assets/${name}.json`, import.meta.url)
  const before = readFileSync(url, 'utf8')
  const data = JSON.parse(before)

  let trimmed = 0
  let dropped = 0
  for (const c of Object.values(data)) {
    if (!Array.isArray(c.scrambles) || c.scrambles.length <= KEEP) continue
    dropped += c.scrambles.length - KEEP
    c.scrambles = c.scrambles.slice(0, KEEP)
    trimmed++
  }

  // Two-space indent + trailing newline, matching what the generators write.
  const after = JSON.stringify(data, null, 2) + '\n'
  beforeTotal += before.length
  afterTotal += after.length
  if (!DRY) writeFileSync(url, after)

  console.log(
    `${name.padEnd(15)} ${fmt(before.length).padStart(7)} -> ${fmt(after.length).padStart(7)}` +
    `  (${trimmed} Cases gekürzt, ${dropped} Scrambles entfernt)`)
}

console.log('-'.repeat(66))
console.log(`${'SUMME'.padEnd(15)} ${fmt(beforeTotal).padStart(7)} -> ${fmt(afterTotal).padStart(7)}` +
  `  (${(100 * (1 - afterTotal / beforeTotal)).toFixed(0)}% kleiner)`)
if (DRY) console.log('\n(--dry: nichts geschrieben)')
