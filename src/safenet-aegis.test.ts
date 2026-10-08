import { describe, expect, it, vi } from 'vitest'
import { decodeEventLog, encodeAbiParameters, encodeEventTopics, parseAbiItem } from 'viem'
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

const CONSENSUS = AEGIS_TESTNET_SETTINGS.consensus as `0x${string}`
const OTHER_ORACLE = '0x2222222222222222222222222222222222222222'

const transactionProposedEvent = parseAbiItem(
  'event TransactionProposed(bytes32 indexed safeTxHash, bytes32 indexed safeId, address indexed oracle, uint64 epoch, bytes oracleData, (uint256 chainId, address safe, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) transaction)',
)
const newRequestEvent = parseAbiItem(
  'event NewRequest(bytes32 indexed requestId, address indexed sponsor, uint96 fee, uint96 bondTarget, uint24 daoFeeShare, uint96 slashAmount, uint64 commitDeadline, uint64 revealDeadline)',
)
const oracleResultEvent = parseAbiItem(
  'event OracleResult(bytes32 indexed requestId, address indexed sponsor, bytes result, bool approved)',
)
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

type ReceiptLog = {
  address: `0x${string}`
  data: `0x${string}`
  topics: [`0x${string}`, ...`0x${string}`[]]
  logIndex?: `0x${string}`
}

const hash = (c: string) => ('0x' + c.repeat(64)) as `0x${string}`
const SPONSOR = '0x1111111111111111111111111111111111111111'

function proposedLog(safeTxHash: `0x${string}`, oracle: `0x${string}`, address: `0x${string}` = CONSENSUS): ReceiptLog {
  return {
    address,
    topics: encodeEventTopics({
      abi: [transactionProposedEvent],
      args: { safeTxHash, safeId: hash('5'), oracle },
    }) as ReceiptLog['topics'],
    data: encodeAbiParameters(transactionProposedEvent.inputs.filter((input) => !('indexed' in input)), [
      7n,
      '0x',
      {
        chainId: 100n,
        safe: SPONSOR,
        to: SPONSOR,
        value: 0n,
        data: '0x',
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 1n,
      },
    ]),
  }
}

function newRequestLog(requestId: `0x${string}`, address: `0x${string}` = SENTINEL_ORACLE as `0x${string}`): ReceiptLog {
  return {
    address,
    topics: encodeEventTopics({ abi: [newRequestEvent], args: { requestId, sponsor: SPONSOR } }) as ReceiptLog['topics'],
    data: encodeAbiParameters(newRequestEvent.inputs.filter((input) => !('indexed' in input)), [1n, 2n, 3, 4n, 5n, 6n]),
  }
}

function oracleResultLog(requestId: `0x${string}`, approved: boolean): ReceiptLog {
  return {
    address: SENTINEL_ORACLE as `0x${string}`,
    topics: encodeEventTopics({ abi: [oracleResultEvent], args: { requestId, sponsor: SPONSOR } }) as ReceiptLog['topics'],
    data: encodeAbiParameters(oracleResultEvent.inputs.filter((input) => !('indexed' in input)), ['0x', approved]),
  }
}

function transferLog(): ReceiptLog {
  return {
    address: '0x3b1cFcfa89A19F6CDf8995ee8AE35D7D585e7025',
    topics: encodeEventTopics({ abi: [transferEvent], args: { from: SPONSOR, to: CONSENSUS } }) as ReceiptLog['topics'],
    data: encodeAbiParameters([{ type: 'uint256' }], [10n]),
  }
}

const receiptClient = (logs: ReceiptLog[] | null) => () => ({ request: vi.fn().mockResolvedValue(logs && { logs }) }) as never

describe('getSentinelRequestId', () => {
  const proposalTxHash = hash('e')
  const safeTxHashA = hash('a')
  const safeTxHashB = hash('b')
  const requestA = hash('c')
  const requestB = hash('d')
  const oracle = SENTINEL_ORACLE as `0x${string}`

  it('returns null when the transaction has no receipt', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, { createClient: receiptClient(null) })
    expect(result).toBeNull()
  })

  it('returns the requestId of the NewRequest following the matching proposal', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle), transferLog(), newRequestLog(requestA)]),
    })
    expect(result).toBe(requestA)
  })

  it('returns null when the target safeTxHash was not proposed in the receipt', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashB, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle), newRequestLog(requestA)]),
    })
    expect(result).toBeNull()
  })

  it('returns null when the target was proposed with a different oracle', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, OTHER_ORACLE), newRequestLog(requestA)]),
    })
    expect(result).toBeNull()
  })

  it('ignores TransactionProposed from an address other than the configured consensus', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle, OTHER_ORACLE), newRequestLog(requestA)]),
    })
    expect(result).toBeNull()
  })

  it('ignores NewRequest from an address other than the configured oracle', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle), newRequestLog(requestA, OTHER_ORACLE)]),
    })
    expect(result).toBeNull()
  })

  it("does not take the next proposal's request when the target's segment has none", async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle), proposedLog(safeTxHashB, oracle), newRequestLog(requestB)]),
    })
    expect(result).toBeNull()
  })

  it("treats a proposal with another oracle as a boundary", async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle), proposedLog(safeTxHashB, OTHER_ORACLE), newRequestLog(requestB)]),
    })
    expect(result).toBeNull()
  })

  it("returns null when the target's segment has two NewRequests", async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([proposedLog(safeTxHashA, oracle), newRequestLog(requestA), newRequestLog(requestB)]),
    })
    expect(result).toBeNull()
  })

  it('returns null when the target is proposed twice in the receipt', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([
        proposedLog(safeTxHashA, oracle),
        newRequestLog(requestA),
        proposedLog(safeTxHashA, oracle),
        newRequestLog(requestB),
      ]),
    })
    expect(result).toBeNull()
  })

  it('does not attribute a NewRequest that precedes every proposal', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([newRequestLog(requestA), proposedLog(safeTxHashA, oracle)]),
    })
    expect(result).toBeNull()
  })

  it('orders logs by logIndex when present', async () => {
    const result = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, {
      createClient: receiptClient([
        { ...newRequestLog(requestA), logIndex: '0x1' },
        { ...proposedLog(safeTxHashA, oracle), logIndex: '0x0' },
      ]),
    })
    expect(result).toBe(requestA)
  })

  it('uses custom consensus and sentinelOracle addresses from settings', async () => {
    const customConsensus = '0x4444444444444444444444444444444444444444'
    const customOracle = '0x3333333333333333333333333333333333333333'
    const custom = { ...SETTINGS, consensus: customConsensus, sentinelOracle: customOracle }

    expect(
      await getSentinelRequestId(custom, safeTxHashA, proposalTxHash, {
        createClient: receiptClient([proposedLog(safeTxHashA, oracle), newRequestLog(requestA)]),
      }),
    ).toBeNull()
    expect(
      await getSentinelRequestId(custom, safeTxHashA, proposalTxHash, {
        createClient: receiptClient([
          proposedLog(safeTxHashA, customOracle, customConsensus),
          newRequestLog(requestA, customOracle),
        ]),
      }),
    ).toBe(requestA)
  })
})

describe('sentinel correlation for batched proposals (real ABI)', () => {
  it('gives each transaction in a batch its own request and verdict', async () => {
    const proposalTxHash = hash('e')
    const safeTxHashA = hash('a')
    const safeTxHashB = hash('b')
    const requestA = hash('c')
    const requestB = hash('d')
    const oracle = SENTINEL_ORACLE as `0x${string}`

    const receipt = {
      logs: [
        proposedLog(safeTxHashA, oracle),
        transferLog(),
        newRequestLog(requestA),
        proposedLog(safeTxHashB, oracle),
        transferLog(),
        newRequestLog(requestB),
      ],
    }
    const oracleResults = [oracleResultLog(requestA, false), oracleResultLog(requestB, true)]
    const request = vi.fn(async ({ method, params }: { method: string; params: [unknown] }) => {
      if (method === 'eth_getTransactionReceipt') return params[0] === proposalTxHash ? receipt : null
      if (method === 'eth_getLogs') return oracleResults.filter((log) => log.topics[1] === (params[0] as { topics: `0x${string}`[] }).topics[1])
      throw new Error(`unexpected ${method}`)
    })
    const deps = { createClient: () => ({ request }) as never, decodeLog: decodeEventLog }

    const idA = await getSentinelRequestId(SETTINGS, safeTxHashA, proposalTxHash, deps)
    const idB = await getSentinelRequestId(SETTINGS, safeTxHashB, proposalTxHash, deps)
    expect(idA).toBe(requestA)
    expect(idB).toBe(requestB)

    expect(await checkOracleResult(SETTINGS, idA!, deps)).toEqual({ concluded: true, approved: false })
    expect(await checkOracleResult(SETTINGS, idB!, deps)).toEqual({ concluded: true, approved: true })
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
