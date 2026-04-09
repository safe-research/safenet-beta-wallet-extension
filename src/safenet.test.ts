import { describe, expect, it } from 'vitest'
import { computeSafeTxHash } from './safenet'
import { DEFAULT_SETTINGS } from './constants'
import { settingsSchema } from './schema'

describe('settings schema', () => {
  it('accepts default settings', () => {
    const parsed = settingsSchema.parse(DEFAULT_SETTINGS)
    expect(parsed.autoRun).toBe(false)
  })
})

describe('computeSafeTxHash', () => {
  it('returns a 32-byte hash', () => {
    const hash = computeSafeTxHash({
      chainId: 11155111n,
      safe: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 0n,
      data: '0x',
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: 1n,
    })
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
