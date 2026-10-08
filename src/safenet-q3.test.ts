import { describe, expect, it, vi } from 'vitest'
import { checkOracleResult, explorerUrlQ3, getSentinelRequestId, lookupProposalQ3 } from './safenet-q3'
import { Q3_DEFAULT_SETTINGS, Q3_NETWORK, Q3_SENTINEL_ORACLE, Q3_SENTINEL_ORACLE_DEPLOYMENT_BLOCK } from './constants'

describe('explorerUrlQ3', () => {
  it('builds explorer links under the safe.dev/safenet base', () => {
    expect(explorerUrlQ3(11155111n, ('0x' + '1'.repeat(64)) as `0x${string}`)).toBe(
      `${Q3_NETWORK.explorerBaseUrl}?chainId=11155111&safeTxHash=0x${'1'.repeat(64)}`,
    )
  })
})

describe('lookupProposalQ3', () => {
  const makeClient = (logs: Array<{ data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] }>) =>
    ({ request: vi.fn().mockResolvedValue(logs) })

  it('returns no proposal when no logs are found', async () => {
    const result = await lookupProposalQ3(
      Q3_DEFAULT_SETTINGS,
      ('0x' + 'a'.repeat(64)) as `0x${string}`,
      11155111n,
      { createClient: () => makeClient([]) as never },
    )

    expect(result).toEqual({ exists: false, attested: false, explorerUrl: undefined })
  })

  it('filters eth_getLogs on safeTxHash only, with no third topic', async () => {
    const request = vi.fn().mockResolvedValue([])

    await lookupProposalQ3(
      Q3_DEFAULT_SETTINGS,
      ('0x' + 'b'.repeat(64)) as `0x${string}`,
      11155111n,
      { createClient: () => ({ request }) as never },
    )

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        {
          address: expect.any(String),
          fromBlock: Q3_NETWORK.consensusDeploymentBlock,
          toBlock: 'latest',
          topics: [null, ('0x' + 'b'.repeat(64))],
        },
      ],
    })
  })

  it('returns proposed=true attested=false when only a proposal log decodes', async () => {
    const decodeLog = vi.fn().mockReturnValueOnce({ eventName: 'TransactionProposed' })

    const result = await lookupProposalQ3(
      Q3_DEFAULT_SETTINGS,
      ('0x' + 'c'.repeat(64)) as `0x${string}`,
      11155111n,
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

    const result = await lookupProposalQ3(
      Q3_DEFAULT_SETTINGS,
      ('0x' + 'd'.repeat(64)) as `0x${string}`,
      11155111n,
      {
        createClient: () => makeClient([{ data: '0x1234', topics: ['0xbbb'] as [`0x${string}`, ...`0x${string}`[]] }]) as never,
        decodeLog: decodeLog as never,
      },
    )

    expect(result.exists).toBe(true)
    expect(result.attested).toBe(true)
  })
})

describe('getSentinelRequestId', () => {
  const proposalTxHash = ('0x' + 'e'.repeat(64)) as `0x${string}`
  const requestId = ('0x' + 'f'.repeat(64)) as `0x${string}`

  it('returns null when the transaction has no receipt', async () => {
    const result = await getSentinelRequestId(Q3_DEFAULT_SETTINGS, proposalTxHash, {
      createClient: () => ({ request: vi.fn().mockResolvedValue(null) }) as never,
    })
    expect(result).toBeNull()
  })

  it('returns null when no log at the Sentinel Oracle address decodes as NewRequest', async () => {
    const result = await getSentinelRequestId(Q3_DEFAULT_SETTINGS, proposalTxHash, {
      createClient: () =>
        ({
          request: vi.fn().mockResolvedValue({
            logs: [{ address: '0x1111111111111111111111111111111111111111', data: '0x', topics: ['0xaaa'] }],
          }),
        }) as never,
      decodeLog: vi.fn(() => {
        throw new Error('nope')
      }) as never,
    })
    expect(result).toBeNull()
  })

  it('ignores a NewRequest-shaped log from an address other than the Sentinel Oracle', async () => {
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'NewRequest', args: { requestId } })

    const result = await getSentinelRequestId(Q3_DEFAULT_SETTINGS, proposalTxHash, {
      createClient: () =>
        ({
          request: vi.fn().mockResolvedValue({
            logs: [{ address: '0x1111111111111111111111111111111111111111', data: '0x', topics: ['0xaaa'] }],
          }),
        }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toBeNull()
    expect(decodeLog).not.toHaveBeenCalled()
  })

  it('returns the requestId from a NewRequest log at the Sentinel Oracle address', async () => {
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'NewRequest', args: { requestId } })

    const result = await getSentinelRequestId(Q3_DEFAULT_SETTINGS, proposalTxHash, {
      createClient: () =>
        ({
          request: vi.fn().mockResolvedValue({
            logs: [{ address: Q3_SENTINEL_ORACLE, data: '0x1234', topics: ['0xaaa'] }],
          }),
        }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toBe(requestId)
  })

  it('uses a custom sentinelOracle address from settings instead of the default constant', async () => {
    const customOracle = '0x2222222222222222222222222222222222222222'
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'NewRequest', args: { requestId } })

    const resultAtDefault = await getSentinelRequestId(
      { ...Q3_DEFAULT_SETTINGS, sentinelOracle: customOracle },
      proposalTxHash,
      {
        createClient: () =>
          ({
            request: vi.fn().mockResolvedValue({
              logs: [{ address: Q3_SENTINEL_ORACLE, data: '0x1234', topics: ['0xaaa'] }],
            }),
          }) as never,
        decodeLog: decodeLog as never,
      },
    )
    expect(resultAtDefault).toBeNull() // default address is no longer the configured oracle

    const resultAtCustom = await getSentinelRequestId(
      { ...Q3_DEFAULT_SETTINGS, sentinelOracle: customOracle },
      proposalTxHash,
      {
        createClient: () =>
          ({
            request: vi.fn().mockResolvedValue({
              logs: [{ address: customOracle, data: '0x1234', topics: ['0xaaa'] }],
            }),
          }) as never,
        decodeLog: decodeLog as never,
      },
    )
    expect(resultAtCustom).toBe(requestId)
  })
})

describe('checkOracleResult', () => {
  const requestId = ('0x' + 'f'.repeat(64)) as `0x${string}`

  it('returns not concluded when no logs are found', async () => {
    const result = await checkOracleResult(Q3_DEFAULT_SETTINGS, requestId, {
      createClient: () => ({ request: vi.fn().mockResolvedValue([]) }) as never,
    })
    expect(result).toEqual({ concluded: false })
  })

  it('scans from the Sentinel Oracle deployment block, filtered by requestId', async () => {
    const request = vi.fn().mockResolvedValue([])

    await checkOracleResult(Q3_DEFAULT_SETTINGS, requestId, {
      createClient: () => ({ request }) as never,
    })

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        expect.objectContaining({
          fromBlock: Q3_SENTINEL_ORACLE_DEPLOYMENT_BLOCK,
          topics: [null, requestId],
        }),
      ],
    })
  })

  it('returns concluded=true approved=true on an approving OracleResult', async () => {
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'OracleResult', args: { approved: true } })

    const result = await checkOracleResult(Q3_DEFAULT_SETTINGS, requestId, {
      createClient: () => ({ request: vi.fn().mockResolvedValue([{ data: '0x1234', topics: ['0xaaa'] }]) }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toEqual({ concluded: true, approved: true })
  })

  it('returns concluded=true approved=false on a denying OracleResult', async () => {
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'OracleResult', args: { approved: false } })

    const result = await checkOracleResult(Q3_DEFAULT_SETTINGS, requestId, {
      createClient: () => ({ request: vi.fn().mockResolvedValue([{ data: '0x1234', topics: ['0xaaa'] }]) }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toEqual({ concluded: true, approved: false })
  })

  it('queries a custom sentinelOracle address from settings instead of the default constant', async () => {
    const customOracle = '0x3333333333333333333333333333333333333333'
    const request = vi.fn().mockResolvedValue([])

    await checkOracleResult({ ...Q3_DEFAULT_SETTINGS, sentinelOracle: customOracle }, requestId, {
      createClient: () => ({ request }) as never,
    })

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [expect.objectContaining({ address: customOracle })],
    })
  })
})
