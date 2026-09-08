// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { msToClock } from '@/helpers/time_formatter'

// The session clock in flow mode. Leading zero units are noise: under a minute
// the reader wants "34.14", not "0:34.14".
describe('msToClock', () => {
  it('leaves off the minutes while there are none', () => {
    expect(msToClock(0)).toBe('0')
    expect(msToClock(7_400)).toBe('7')
    expect(msToClock(28_000)).toBe('28')
    expect(msToClock(59_999)).toBe('59')
  })

  it('pads the seconds once minutes are on', () => {
    expect(msToClock(60_000)).toBe('1:00')
    expect(msToClock(62_000)).toBe('1:02')
    expect(msToClock(600_000)).toBe('10:00')
  })

  it('adds hours only once there are any', () => {
    expect(msToClock(3_599_000)).toBe('59:59')
    expect(msToClock(3_600_000)).toBe('1:00:00')
    expect(msToClock(3_723_000)).toBe('1:02:03')
  })

  it('appends hundredths when the exact total matters', () => {
    expect(msToClock(0, true)).toBe('0.00')
    expect(msToClock(34_140, true)).toBe('34.14')
    expect(msToClock(56_129, true)).toBe('56.12') // truncated, never rounded up
    expect(msToClock(59_999, true)).toBe('59.99')
    expect(msToClock(62_450, true)).toBe('1:02.45')
    expect(msToClock(3_723_450, true)).toBe('1:02:03.45')
  })

  it('treats nonsense as zero rather than printing NaN', () => {
    expect(msToClock(-5)).toBe('0')
    expect(msToClock(NaN)).toBe('0')
    expect(msToClock(Infinity)).toBe('0')
    expect(msToClock(NaN, true)).toBe('0.00')
  })
})
