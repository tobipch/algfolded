/**
 * Not a correctness test — a stopwatch on the work the app does between
 * "algset data arrived" and "the select view can render". Run with
 *   npx vitest run src/algsets/startup_cost.bench.ts
 * and compare the printed numbers before/after a change. Excluded from
 * `npm test` by the *.bench.ts name (vitest only picks up *.test.ts).
 */
import { describe, it } from 'vitest'
import { partition as partitionComms } from '@/algsets/commutators'
import { buildTree } from '@/algsets/tree'
import { dedupeAlgs } from '@/helpers/alg_match'
import type { AlgsetLevel } from '@/algsets/types'
import edgeCommsRaw from '@/assets/edge_comms.json?raw'
import cornerCommsRaw from '@/assets/corner_comms.json?raw'

const EDGE_BUFFERS = ['UF', 'UR', 'UB', 'UL', 'FR', 'FL', 'DF', 'BR']
const CORNER_BUFFERS = ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL']

const LEVELS = [
  { id: 'buffer', display: (v: string) => ({ primary: v }) },
  { id: 't1', display: (v: string) => ({ primary: v }) },
  { id: 'case', display: (v: string) => ({ primary: v }) },
] as unknown as AlgsetLevel[]

// Both numbers matter: "kalt" is the first run, which is what a user actually
// waits through on page load; the median is the warm, JIT-optimised steady
// state that a re-derive (e.g. changing the buffer order) hits.
const time = (label: string, fn: () => unknown, runs = 5): void => {
  const ms: number[] = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    fn()
    ms.push(performance.now() - t)
  }
  const cold = ms[0]
  const warm = [...ms].sort((a, b) => a - b)[Math.floor(runs / 2)]
  console.log(`  ${label.padEnd(44)} kalt ${cold.toFixed(1).padStart(6)} ms | warm ${warm.toFixed(1).padStart(6)} ms`)
}

describe('startup cost of the algset pipeline', () => {
  it('times each stage for the two biggest sets', () => {
    for (const [name, raw, buffers] of [
      ['edge_comms', edgeCommsRaw as unknown as string, EDGE_BUFFERS],
      ['corner_comms', cornerCommsRaw as unknown as string, CORNER_BUFFERS],
    ] as const) {
      console.log(`\n${name} (${(raw.length / 1048576).toFixed(2)} MB)`)
      let parsed: Record<string, never> = {}
      time('JSON.parse(string)', () => { parsed = JSON.parse(raw) })
      let cases: ReturnType<typeof partitionComms> = []
      time('[Pipeline] partition()', () => { cases = partitionComms(parsed, buffers as unknown as string[]) })
      time('[Pipeline] buildTree()', () => buildTree(cases, LEVELS))
      // No longer part of the pipeline: AlgsetStore used to canonicalise every
      // alg of every case here, which CustomAlgsStore.mergedAlgs then redid per
      // case. Kept as a stopwatch on what was removed.
      time('[entfernt] dedupeAlgs() über ALLE Cases',
        () => cases.map((c) => ({ ...c, algs: dedupeAlgs(c.algs) })))
      time('[aktuell] dedupeAlgs() für 10 sichtbare Cases',
        () => cases.slice(0, 10).map((c) => dedupeAlgs(c.algs)))
      console.log(`  -> ${cases.length} Cases, ${cases.reduce((a, c) => a + c.algs.length, 0)} Algs`)
    }
  })
})
