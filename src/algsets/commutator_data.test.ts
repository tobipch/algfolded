import { describe, it, expect } from 'vitest'
// @ts-ignore -- plain JS helper
import { isValidAlg } from '@/helpers/alg_match'
// @ts-ignore -- plain JS helper
import { algToMoveString } from '@/helpers/scramble_utils'
import { puzzles } from 'cubing/puzzles'
import cornerComms from '@/assets/corner_comms.json'
import edgeComms from '@/assets/edge_comms.json'

type CommData = Record<string, { algs: string[]; buffers: Record<string, string[]> }>

// The comm sets ship their algs in commutator notation (decomposed in place by
// generate_commutators.mjs, like blddb.net). This guards that output against
// the app's own parser: (a) notation coverage stays high, (b) every notation
// alg parses via the app's expander, and (c) — on a sample, since it needs a
// cube engine — all algs of a case still have the identical cube effect, so a
// notation alg can never mean something different from its siblings.
const check = (data: CommData, label: string) => {
  const cases = Object.entries(data).filter(([, v]) => (v.algs?.length ?? 0) > 0)
  const allAlgs = cases.flatMap(([, v]) => v.algs)
  const notated = allAlgs.filter((a) => /[[\],:]/.test(a))

  describe(`${label} commutator data`, () => {
    it('most algs are in commutator notation', () => {
      expect(notated.length / allAlgs.length).toBeGreaterThan(0.9)
    })

    it('every commutator-notation alg parses as a valid alg', () => {
      const invalid = notated.filter((a) => !isValidAlg(a))
      expect(invalid.slice(0, 10)).toEqual([])
    })

    it('every cycle has its inverse in the data (targets swapped)', () => {
      // The "also select inverses" action relies on the reversed cycle being a
      // real case: buffer [t1, t2] must exist as buffer [t2, t1] somewhere.
      const cycles = new Set(
        Object.values(data).flatMap((v) =>
          Object.entries(v.buffers).map(([b, [t1, t2]]) => `${b} ${t1} ${t2}`)),
      )
      const missing = Object.entries(data).flatMap(([id, v]) =>
        Object.entries(v.buffers)
          .filter(([b, [t1, t2]]) => !cycles.has(`${b} ${t2} ${t1}`))
          .map(([b, [t1, t2]]) => `${id}: no inverse for ${b} ${t1} ${t2}`))
      expect(missing.slice(0, 10)).toEqual([])
    })

    it('sampled cases: every alg has the same cube effect as the first', async () => {
      const kpuzzle = await puzzles['3x3x3'].kpuzzle()
      const solved = kpuzzle.defaultPattern()
      const sample = cases.filter((_, i) => i % Math.ceil(cases.length / 60) === 0)
      const bad: string[] = []
      for (const [id, v] of sample) {
        const ref = solved.applyAlg(algToMoveString(v.algs[0]))
        for (const alg of v.algs.slice(1)) {
          if (!solved.applyAlg(algToMoveString(alg)).isIdentical(ref)) {
            bad.push(`${id}: ${alg} != ${v.algs[0]}`)
          }
        }
      }
      expect(bad).toEqual([])
    })
  })
}

check(cornerComms as CommData, 'corner')
check(edgeComms as CommData, 'edge')
