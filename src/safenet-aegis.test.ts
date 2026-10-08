import { describe, expect, it, vi } from 'vitest'
import { decodeEventLog, encodeAbiParameters, parseAbiItem, toEventSelector } from 'viem'
import { checkOracleResult, explorerUrlAegis, getSentinelRequestId, lookupProposalAegis } from './safenet-aegis'
import { AEGIS_LOGS_FROM_BLOCK, AEGIS_PROD_SETTINGS, AEGIS_TESTNET_SETTINGS } from './constants'

const SETTINGS = AEGIS_TESTNET_SETTINGS
const SENTINEL_ORACLE = AEGIS_TESTNET_SETTINGS.sentinelOracle

describe('explorerUrlAegis', () => {
  it('builds testnet explorer links under the safe.dev/safenet base', () => {
    expect(explorerUrlAegis(SETTINGS, 100n, ('0x' + '1'.repeat(64)) as `0x${string}`)).toBe(
      `https://www.safe.dev/safenet/#/safeTx?chainId=100&safeTxHash=0x${'1'.repeat(64)}`,
    )
  })

  it('builds prod explorer links under the safenet-explorer.eth.limo base', () => {
    expect(explorerUrlAegis(AEGIS_PROD_SETTINGS, 1n, ('0x' + '1'.repeat(64)) as `0x${string}`)).toBe(
      `https://safenet-explorer.eth.limo/#/safeTx?chainId=1&safeTxHash=0x${'1'.repeat(64)}`,
    )
  })

  it('uses a user-edited explorer URL', () => {
    expect(
      explorerUrlAegis({ ...SETTINGS, explorerUrl: 'https://example.com/#/safeTx' }, 1n, ('0x' + '1'.repeat(64)) as `0x${string}`),
    ).toBe(`https://example.com/#/safeTx?chainId=1&safeTxHash=0x${'1'.repeat(64)}`)
  })
})

describe('lookupProposalAegis', () => {
  const makeClient = (logs: Array<{ data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] }>) =>
    ({ request: vi.fn().mockResolvedValue(logs) })

  it('returns no proposal when no logs are found', async () => {
    const result = await lookupProposalAegis(
      SETTINGS,
      ('0x' + 'a'.repeat(64)) as `0x${string}`,
      100n,
      { createClient: () => makeClient([]) as never },
    )

    expect(result).toEqual({ exists: false, attested: false, explorerUrl: undefined })
  })

  it('filters eth_getLogs on safeTxHash only, with no third topic', async () => {
    const request = vi.fn().mockResolvedValue([])

    await lookupProposalAegis(
      SETTINGS,
      ('0x' + 'b'.repeat(64)) as `0x${string}`,
      100n,
      { createClient: () => ({ request }) as never },
    )

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        {
          address: expect.any(String),
          fromBlock: AEGIS_LOGS_FROM_BLOCK,
          toBlock: 'latest',
          topics: [null, ('0x' + 'b'.repeat(64))],
        },
      ],
    })
  })

  it('returns proposed=true attested=false when only a proposal log decodes', async () => {
    const decodeLog = vi.fn().mockReturnValueOnce({ eventName: 'TransactionProposed' })

    const result = await lookupProposalAegis(
      SETTINGS,
      ('0x' + 'c'.repeat(64)) as `0x${string}`,
      100n,
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

    const result = await lookupProposalAegis(
      SETTINGS,
      ('0x' + 'd'.repeat(64)) as `0x${string}`,
      100n,
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
    const result = await getSentinelRequestId(SETTINGS, proposalTxHash, {
      createClient: () => ({ request: vi.fn().mockResolvedValue(null) }) as never,
    })
    expect(result).toBeNull()
  })

  it('returns null when no log at the Sentinel Oracle address decodes as NewRequest', async () => {
    const result = await getSentinelRequestId(SETTINGS, proposalTxHash, {
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

    const result = await getSentinelRequestId(SETTINGS, proposalTxHash, {
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

    const result = await getSentinelRequestId(SETTINGS, proposalTxHash, {
      createClient: () =>
        ({
          request: vi.fn().mockResolvedValue({
            logs: [{ address: SENTINEL_ORACLE, data: '0x1234', topics: ['0xaaa'] }],
          }),
        }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toBe(requestId)
  })

  it('uses a custom sentinelOracle address from settings instead of the default', async () => {
    const customOracle = '0x2222222222222222222222222222222222222222'
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'NewRequest', args: { requestId } })

    const resultAtDefault = await getSentinelRequestId(
      { ...SETTINGS, sentinelOracle: customOracle },
      proposalTxHash,
      {
        createClient: () =>
          ({
            request: vi.fn().mockResolvedValue({
              logs: [{ address: SENTINEL_ORACLE, data: '0x1234', topics: ['0xaaa'] }],
            }),
          }) as never,
        decodeLog: decodeLog as never,
      },
    )
    expect(resultAtDefault).toBeNull() // the preset address is no longer the configured oracle

    const resultAtCustom = await getSentinelRequestId(
      { ...SETTINGS, sentinelOracle: customOracle },
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

describe('getSentinelRequestId with the real NewRequest ABI', () => {
  it('decodes a NewRequest log that includes daoFeeShare', async () => {
    const event = parseAbiItem(
      'event NewRequest(bytes32 indexed requestId, address indexed sponsor, uint96 fee, uint96 bondTarget, uint24 daoFeeShare, uint96 slashAmount, uint64 commitDeadline, uint64 revealDeadline)',
    )
    const requestId = ('0x' + '9'.repeat(64)) as `0x${string}`
    const sponsor = ('0x' + '0'.repeat(24) + '1'.repeat(40)) as `0x${string}`
    const data = encodeAbiParameters(
      [{ type: 'uint96' }, { type: 'uint96' }, { type: 'uint24' }, { type: 'uint96' }, { type: 'uint64' }, { type: 'uint64' }],
      [1n, 2n, 3, 4n, 5n, 6n],
    )

    const result = await getSentinelRequestId(SETTINGS, ('0x' + 'e'.repeat(64)) as `0x${string}`, {
      createClient: () =>
        ({
          request: vi.fn().mockResolvedValue({
            logs: [{ address: SENTINEL_ORACLE, data, topics: [toEventSelector(event), requestId, sponsor] }],
          }),
        }) as never,
      decodeLog: decodeEventLog,
    })

    expect(result).toBe(requestId)
  })
})

describe('checkOracleResult', () => {
  const requestId = ('0x' + 'f'.repeat(64)) as `0x${string}`

  it('returns not concluded when no logs are found', async () => {
    const result = await checkOracleResult(SETTINGS, requestId, {
      createClient: () => ({ request: vi.fn().mockResolvedValue([]) }) as never,
    })
    expect(result).toEqual({ concluded: false })
  })

  it('scans from the Aegis logs start block, filtered by requestId', async () => {
    const request = vi.fn().mockResolvedValue([])

    await checkOracleResult(SETTINGS, requestId, {
      createClient: () => ({ request }) as never,
    })

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        expect.objectContaining({
          fromBlock: AEGIS_LOGS_FROM_BLOCK,
          topics: [null, requestId],
        }),
      ],
    })
  })

  it('returns concluded=true approved=true on an approving OracleResult', async () => {
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'OracleResult', args: { approved: true } })

    const result = await checkOracleResult(SETTINGS, requestId, {
      createClient: () => ({ request: vi.fn().mockResolvedValue([{ data: '0x1234', topics: ['0xaaa'] }]) }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toEqual({ concluded: true, approved: true })
  })

  it('returns concluded=true approved=false on a denying OracleResult', async () => {
    const decodeLog = vi.fn().mockReturnValue({ eventName: 'OracleResult', args: { approved: false } })

    const result = await checkOracleResult(SETTINGS, requestId, {
      createClient: () => ({ request: vi.fn().mockResolvedValue([{ data: '0x1234', topics: ['0xaaa'] }]) }) as never,
      decodeLog: decodeLog as never,
    })

    expect(result).toEqual({ concluded: true, approved: false })
  })

  it('queries a custom sentinelOracle address from settings instead of the default', async () => {
    const customOracle = '0x3333333333333333333333333333333333333333'
    const request = vi.fn().mockResolvedValue([])

    await checkOracleResult({ ...SETTINGS, sentinelOracle: customOracle }, requestId, {
      createClient: () => ({ request }) as never,
    })

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [expect.objectContaining({ address: customOracle })],
    })
  })
})
