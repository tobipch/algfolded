import { describe, it, expect, beforeEach, vi } from 'vitest'
import { copyToClipboard } from '@/helpers/helpers'

// The async Clipboard API needs a secure context, which self-hosted / LAN
// setups over plain http don't get, so the helper has to fall back rather than
// silently do nothing.

beforeEach(() => {
  vi.restoreAllMocks()
  // start each test with no clipboard API at all
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})

describe('copyToClipboard', () => {
  it('uses the Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await expect(copyToClipboard("R U R'")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("R U R'")
  })

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('insecure', 'NotAllowedError'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const exec = vi.fn().mockReturnValue(true)
    Object.assign(document, { execCommand: exec })

    await expect(copyToClipboard("R U R'")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalled()
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('falls back when there is no Clipboard API at all', async () => {
    const exec = vi.fn().mockReturnValue(true)
    Object.assign(document, { execCommand: exec })
    await expect(copyToClipboard('abc')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('leaves no textarea behind after the fallback', async () => {
    Object.assign(document, { execCommand: vi.fn().mockReturnValue(true) })
    await copyToClipboard('abc')
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('reports failure instead of throwing when nothing works', async () => {
    Object.assign(document, { execCommand: vi.fn(() => { throw new Error('nope') }) })
    await expect(copyToClipboard('abc')).resolves.toBe(false)
  })
})
