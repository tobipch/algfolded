import { describe, it, expect } from 'vitest'
// @ts-ignore -- plain JS helper
import { isValidAlg } from '@/helpers/alg_match'
// @ts-ignore -- plain JS helper
import { algToMoveString } from '@/helpers/scramble_utils'
import { puzzles } from 'cubing/puzzles'
import cornerComms from '@/assets/corner_comms.json'
import edgeComms from '@/assets/edge_comms.json'

type CommData = Record<string, { algs: string[] }>

// Generated commutators (algs[0]) must (a) parse via the app's own expander and
// (b) have the exact same effect on the cube as the expanded alg they were
// derived from (algs[1]). (a) is checked for every case; (b) — which needs a
// cube engine — is checked on a sample to keep the test quick. This guards the
// generate_commutators.mjs output against the runtime parser.
const check = (data: CommData, label: string) => {
  const withComm = Object.entries(data).filter(([, v]) => /[[\],:]/.test(v.algs?.[0] ?? ''))

  describe(`${label} commutator data`, () => {
    it('has commutators for (nearly) every case', () => {
      expect(withComm.length).toBeGreaterThan(0)
    })

    it('every commutator parses as a valid alg', () => {
      const invalid = withComm.filter(([, v]) => !isValidAlg(v.algs[0])).map(([id, v]) => `${id}: ${v.algs[0]}`)
      expect(invalid.slice(0, 10)).toEqual([])
    })

    it('sampled commutators have the same cube effect as their expanded alg', async () => {
      const kpuzzle = await puzzles['3x3x3'].kpuzzle()
      const solved = kpuzzle.defaultPattern()
      const sample = withComm.filter((_, i) => i % Math.ceil(withComm.length / 60) === 0)
      const bad: string[] = []
      for (const [id, v] of sample) {
        const commMoves = algToMoveString(v.algs[0])
        const same = solved.applyAlg(commMoves).isIdentical(solved.applyAlg(v.algs[1]))
        if (!same) bad.push(`${id}: ${v.algs[0]} != ${v.algs[1]}`)
      }
      expect(bad).toEqual([])
    })
  })
}

check(cornerComms as CommData, 'corner')
check(edgeComms as CommData, 'edge')
