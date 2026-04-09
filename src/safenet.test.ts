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

  it('matches known EIP-712 hash vector', () => {
    // Reference value computed with viem hashTypedData using Safe's EIP-712 domain
    // (EIP712Domain(uint256 chainId,address verifyingContract)) and SafeTx struct.
    // Verified against Safe contract domain separator definition.
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
    expect(hash).toBe('0xb052c839ae51877946132cdc9ec02f953c47c2fe57dba223f423d7d59876ae59')
  })

  it('produces different hashes for different nonces', () => {
    const base = {
      chainId: 11155111n,
      safe: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
      value: 0n,
      data: '0x' as `0x${string}`,
      operation: 0 as 0 | 1,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    }
    const hash0 = computeSafeTxHash({ ...base, nonce: 0n })
    const hash1 = computeSafeTxHash({ ...base, nonce: 1n })
    expect(hash0).not.toBe(hash1)
  })

  it('produces different hashes for different safes (domain isolation)', () => {
    const base = {
      chainId: 11155111n,
      to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
      value: 0n,
      data: '0x' as `0x${string}`,
      operation: 0 as 0 | 1,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      nonce: 0n,
    }
    const hash1 = computeSafeTxHash({ ...base, safe: '0x1111111111111111111111111111111111111111' })
    const hash2 = computeSafeTxHash({ ...base, safe: '0x3333333333333333333333333333333333333333' })
    expect(hash1).not.toBe(hash2)
  })
})
