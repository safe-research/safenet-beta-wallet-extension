import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computeSafeTxHash, encodeProposalTransactionData, explorerUrl, isModuleTransaction, loadSafeTransactionFromService, lookupProposal } from './safenet'
import { CONSENSUS_DEPLOYMENT_BLOCK, DEFAULT_SETTINGS } from './constants'
import { settingsSchema } from './schema'

describe('settings schema', () => {
  it('accepts default settings', () => {
    const parsed = settingsSchema.parse(DEFAULT_SETTINGS)
    expect(parsed.autoRun).toBe(false)
  })
})

describe('computeSafeTxHash', () => {
  const BASE = {
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
    nonce: 1n,
  }

  it('returns a 32-byte hash', () => {
    expect(computeSafeTxHash(BASE)).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('matches known EIP-712 hash vector', () => {
    // Reference value computed with viem hashTypedData using Safe's EIP-712 domain
    // (EIP712Domain(uint256 chainId,address verifyingContract)) and SafeTx struct.
    expect(computeSafeTxHash(BASE)).toBe(
      '0xb052c839ae51877946132cdc9ec02f953c47c2fe57dba223f423d7d59876ae59',
    )
  })

  it('produces different hashes for different nonces', () => {
    const h0 = computeSafeTxHash({ ...BASE, nonce: 0n })
    const h1 = computeSafeTxHash({ ...BASE, nonce: 1n })
    expect(h0).not.toBe(h1)
  })

  it('produces different hashes for different safes (domain isolation)', () => {
    const h1 = computeSafeTxHash({ ...BASE, safe: '0x1111111111111111111111111111111111111111' })
    const h2 = computeSafeTxHash({ ...BASE, safe: '0x3333333333333333333333333333333333333333' })
    expect(h1).not.toBe(h2)
  })
})

describe('encodeProposalTransactionData', () => {
  const payload = {
    chainId: 1n,
    safe: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    value: 3n,
    data: '0xdeadbeef' as `0x${string}`,
    operation: 0 as 0 | 1,
    safeTxGas: 4n,
    baseGas: 5n,
    gasPrice: 6n,
    gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    nonce: 7n,
  }

  it('encodes proposeTransaction calldata', () => {
    const data = encodeProposalTransactionData(DEFAULT_SETTINGS, payload)
    expect(data.startsWith('0x')).toBe(true)
    expect(data.length).toBeGreaterThan(10)
  })

  it('builds explorer links for a safe tx hash', () => {
    expect(explorerUrl(1n, ('0x' + '1'.repeat(64)) as `0x${string}`)).toBe(
      'https://explorer.safenet-beta.eth.limo/safeTx?chainId=1&safeTxHash=0x1111111111111111111111111111111111111111111111111111111111111111',
    )
  })
})

describe('isModuleTransaction', () => {
  const BASE = {
    chainId: 1n,
    safe: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    value: 0n, data: '0x' as `0x${string}`,
    safeTxGas: 0n, baseGas: 0n, gasPrice: 0n,
    gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    nonce: 0n,
  }

  it('returns false for call (operation 0)', () => {
    expect(isModuleTransaction({ ...BASE, operation: 0 })).toBe(false)
  })

  it('returns false for delegatecall (operation 1)', () => {
    expect(isModuleTransaction({ ...BASE, operation: 1 })).toBe(false)
  })

  it('returns true for module transaction (operation 2)', () => {
    // operation is typed 0|1 but can arrive as any number from external data
    expect(isModuleTransaction({ ...BASE, operation: 2 as 0 | 1 })).toBe(true)
  })
})

describe('loadSafeTransactionFromService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await loadSafeTransactionFromService(11155111n, '0xdeadbeef00000000000000000000000000000000000000000000000000000000')
    expect(result).toBeNull()
  })

  it('returns null when required fields are missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ txInfo: {}, txData: {} }),
    }))
    const result = await loadSafeTransactionFromService(11155111n, '0xdeadbeef00000000000000000000000000000000000000000000000000000000')
    expect(result).toBeNull()
  })

  it('parses a flat transaction response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        safeAddress: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        value: '1000000000000000000',
        data: '0xdeadbeef',
        operation: 0,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 5,
      }),
    }))
    const result = await loadSafeTransactionFromService(1n, '0xdeadbeef00000000000000000000000000000000000000000000000000000000')
    expect(result).not.toBeNull()
    expect(result!.nonce).toBe(5n)
    expect(result!.value).toBe(1000000000000000000n)
    expect(result!.chainId).toBe(1n)
  })

  it('parses a nested txInfo/txData response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        txInfo: { safeAddress: '0x1111111111111111111111111111111111111111' },
        txData: {
          to: { value: '0x2222222222222222222222222222222222222222' },
          dataHex: '0xabcd',
          value: '0',
          operation: 1,
          safeTxGas: '0',
          baseGas: '0',
          gasPrice: '0',
          gasToken: '0x0000000000000000000000000000000000000000',
          refundReceiver: '0x0000000000000000000000000000000000000000',
          nonce: 3,
        },
      }),
    }))
    const result = await loadSafeTransactionFromService(100n, '0xdeadbeef00000000000000000000000000000000000000000000000000000000')
    expect(result).not.toBeNull()
    expect(result!.operation).toBe(1)
    expect(result!.data).toBe('0xabcd')
    expect(result!.nonce).toBe(3n)
  })
})


describe('lookupProposal', () => {
  const makeClient = (logs: Array<{ data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] }>) =>
    ({ request: vi.fn().mockResolvedValue(logs) })

  it('returns no proposal when no logs are found', async () => {
    const result = await lookupProposal(
      DEFAULT_SETTINGS,
      ('0x' + 'a'.repeat(64)) as `0x${string}`,
      100n,
      '0x1111111111111111111111111111111111111111',
      {
        createClient: () => makeClient([]) as never,
      },
    )

    expect(result).toEqual({ exists: false, attested: false, explorerUrl: undefined })
  })

  it('uses the consensus deployment block in eth_getLogs', async () => {
    const request = vi.fn().mockResolvedValue([])

    await lookupProposal(
      DEFAULT_SETTINGS,
      ('0x' + 'b'.repeat(64)) as `0x${string}`,
      100n,
      '0x1111111111111111111111111111111111111111',
      {
        createClient: () => ({ request }) as never,
      },
    )

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        expect.objectContaining({
          fromBlock: CONSENSUS_DEPLOYMENT_BLOCK,
          toBlock: 'latest',
        }),
      ],
    })
  })

  it('returns proposed=true attested=false when only a proposal log decodes', async () => {
    const decodeLog = vi
      .fn()
      .mockReturnValueOnce({ eventName: 'TransactionProposed' })

    const result = await lookupProposal(
      DEFAULT_SETTINGS,
      ('0x' + 'c'.repeat(64)) as `0x${string}`,
      100n,
      '0x1111111111111111111111111111111111111111',
      {
        createClient: () => makeClient([{ data: '0x1234', topics: ['0xaaa'] as [`0x${string}`, ...`0x${string}`[]] }]) as never,
        decodeLog: decodeLog as never,
      },
    )

    expect(result.exists).toBe(true)
    expect(result.attested).toBe(false)
    expect(result.explorerUrl).toContain('safeTxHash=0x' + 'c'.repeat(64))
  })

  it('returns attested=true when an attestation log decodes after proposal decode fails', async () => {
    const decodeLog = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('not proposed')
      })
      .mockReturnValueOnce({ eventName: 'TransactionAttested' })

    const result = await lookupProposal(
      DEFAULT_SETTINGS,
      ('0x' + 'd'.repeat(64)) as `0x${string}`,
      100n,
      '0x1111111111111111111111111111111111111111',
      {
        createClient: () => makeClient([{ data: '0x1234', topics: ['0xbbb'] as [`0x${string}`, ...`0x${string}`[]] }]) as never,
        decodeLog: decodeLog as never,
      },
    )

    expect(result.exists).toBe(true)
    expect(result.attested).toBe(true)
  })
})
