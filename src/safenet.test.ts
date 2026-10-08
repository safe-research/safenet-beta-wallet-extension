import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computeSafeTxHash, isModuleTransaction, loadSafeTransactionFromService, submitProposal } from './safenet'
import { AEGIS_PROD_SETTINGS, AEGIS_TESTNET_SETTINGS } from './constants'
import { settingsSchema } from './schema'
import safeClientMultisigTx from './test/fixtures/safe-client-multisig-tx.json'

describe('settings schema', () => {
  it.each([AEGIS_TESTNET_SETTINGS, AEGIS_PROD_SETTINGS])('accepts preset settings', (preset) => {
    const parsed = settingsSchema.parse(preset)
    expect(parsed).toEqual(preset)
  })

  it('rejects settings without a sentinel oracle or explorer URL', () => {
    expect(() => settingsSchema.parse({ ...AEGIS_TESTNET_SETTINGS, sentinelOracle: undefined })).toThrow()
    expect(() => settingsSchema.parse({ ...AEGIS_TESTNET_SETTINGS, explorerUrl: undefined })).toThrow()
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

describe('submitProposal', () => {
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

  it('posts the transaction payload to the relayer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await submitProposal(AEGIS_TESTNET_SETTINGS, payload)

    expect(fetchMock).toHaveBeenCalledWith(
      AEGIS_TESTNET_SETTINGS.relayerUrl,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('returns the relayer response body for callers to log', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '{"txHash":"0xabc"}' }))

    const result = await submitProposal(AEGIS_TESTNET_SETTINGS, payload)

    expect(result).toBe('{"txHash":"0xabc"}')
  })

  it('returns null when the response body cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => { throw new Error('boom') } }))

    const result = await submitProposal(AEGIS_TESTNET_SETTINGS, payload)

    expect(result).toBeNull()
  })

  it('sends the consensus and sentinel oracle so the relayer can route to the deployment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await submitProposal(AEGIS_PROD_SETTINGS, payload)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      consensus: AEGIS_PROD_SETTINGS.consensus,
      sentinelOracle: AEGIS_PROD_SETTINGS.sentinelOracle,
      safe: payload.safe,
      nonce: '7',
    })
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

  // Trimmed real response for https://app.safe.global/transactions/tx?id=multisig_0x8886…8a87_0xe3e7…cda0&safe=eth:…
  it('parses the current client-gateway shape (fields split across txData and detailedExecutionInfo)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => safeClientMultisigTx }))
    const safeTxHash = safeClientMultisigTx.detailedExecutionInfo.safeTxHash as `0x${string}`

    const result = await loadSafeTransactionFromService(1n, safeTxHash)

    expect(result).not.toBeNull()
    expect(result!.nonce).toBe(60n)
    expect(result!.operation).toBe(1)
    expect(result!.data).toBe(safeClientMultisigTx.txData.hexData)
    expect(computeSafeTxHash(result!)).toBe(safeTxHash)
  })
})
