// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { msToClock } from '@/helpers/time_formatter'

// The session clock in flow mode. A solve time prints "28"; a clock has to
// print "0:28", or half a minute of practice looks like a solve.
describe('msToClock', () => {
  it('always shows minutes and padded seconds', () => {
    expect(msToClock(0)).toBe('0:00')
    expect(msToClock(7_400)).toBe('0:07')
    expect(msToClock(28_000)).toBe('0:28')
    expect(msToClock(62_000)).toBe('1:02')
    expect(msToClock(600_000)).toBe('10:00')
  })

  it('adds hours only once there are any', () => {
    expect(msToClock(3_599_000)).toBe('59:59')
    expect(msToClock(3_600_000)).toBe('1:00:00')
    expect(msToClock(3_723_000)).toBe('1:02:03')
  })

  it('treats nonsense as zero rather than printing NaN', () => {
    expect(msToClock(-5)).toBe('0:00')
    expect(msToClock(NaN)).toBe('0:00')
    expect(msToClock(Infinity)).toBe('0:00')
  })
})
