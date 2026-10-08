import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbiItem,
  type Hex,
} from 'viem'
import { AEGIS_LOGS_FROM_BLOCK } from './constants'
import type { ExtensionSettings, ProposalLookupResult, SentinelResult } from './types'

type LookupProposalAegisDeps = {
  createClient?: typeof createPublicClient
  decodeLog?: typeof decodeEventLog
  normalizeAddress?: typeof getAddress
}

// `safeId` is a packed chainId+address value, and `oracle` is the indexed oracle address. `safeTxHash` alone (indexed, topic1) is already a unique
// 32-byte hash, so callers don't need to filter on `safeId`/`oracle` at all.
const transactionProposedEvent = parseAbiItem(
  'event TransactionProposed(bytes32 indexed safeTxHash, bytes32 indexed safeId, address indexed oracle, uint64 epoch, bytes oracleData, (uint256 chainId, address safe, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) transaction)',
)

const transactionAttestedEvent = parseAbiItem(
  'event TransactionAttested(bytes32 indexed safeTxHash, bytes32 indexed safeId, address indexed oracle, uint64 epoch, bytes32 oracleDataHash, bytes32 signatureId, ((uint256 x, uint256 y) r, uint256 z) attestation)',
)

const newRequestEvent = parseAbiItem(
  'event NewRequest(bytes32 indexed requestId, address indexed sponsor, uint96 fee, uint96 bondTarget, uint24 daoFeeShare, uint96 slashAmount, uint64 commitDeadline, uint64 revealDeadline)',
)

const oracleResultEvent = parseAbiItem(
  'event OracleResult(bytes32 indexed requestId, address indexed sponsor, bytes result, bool approved)',
)

export function explorerUrlAegis(settings: ExtensionSettings, chainId: bigint, safeTxHash: `0x${string}`) {
  const params = new URLSearchParams({ chainId: chainId.toString(), safeTxHash })
  return `${settings.explorerUrl}?${params.toString()}`
}

export async function lookupProposalAegis(
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
  chainId: bigint,
  deps: LookupProposalAegisDeps = {},
): Promise<ProposalLookupResult> {
  const createClient = deps.createClient ?? createPublicClient
  const decodeLog = deps.decodeLog ?? decodeEventLog
  const normalizeAddress = deps.normalizeAddress ?? getAddress

  const client = createClient({ transport: http(settings.rpc) })

  const rawLogs = await client.request({
    method: 'eth_getLogs',
    params: [
      {
        address: normalizeAddress(settings.consensus),
        fromBlock: AEGIS_LOGS_FROM_BLOCK,
        toBlock: 'latest',
        topics: [null, safeTxHash],
      },
    ],
  })

  let proposed = false
  let attested = false
  let txHash: `0x${string}` | undefined

  for (const log of rawLogs as Array<{ data: Hex; topics: [Hex, ...Hex[]]; transactionHash: `0x${string}` }>) {
    try {
      const proposedDecoded = decodeLog({
        abi: [transactionProposedEvent],
        data: log.data,
        topics: log.topics,
      })
      if (proposedDecoded.eventName === 'TransactionProposed') {
        proposed = true
        txHash = txHash ?? log.transactionHash
      }
      continue
    } catch {
      // not a TransactionProposed log; try next ABI
    }

    try {
      const attestedDecoded = decodeLog({
        abi: [transactionAttestedEvent],
        data: log.data,
        topics: log.topics,
      })
      if (attestedDecoded.eventName === 'TransactionAttested') {
        attested = true
        txHash = log.transactionHash // prefer the attestation tx hash
      }
    } catch {
      // not a TransactionAttested log; skip
    }
  }

  return {
    exists: proposed || attested,
    attested,
    txHash,
    explorerUrl: proposed || attested ? explorerUrlAegis(settings, chainId, safeTxHash) : undefined,
  }
}

type SentinelDeps = {
  createClient?: typeof createPublicClient
  decodeLog?: typeof decodeEventLog
  normalizeAddress?: typeof getAddress
}

// `Consensus.proposeTransaction()` emits `TransactionProposed` and then calls
// `SentinelOracle.postRequest()`, which emits `NewRequest(requestId, ...)` synchronously. Reading
// `requestId` off that log (rather than recomputing the EIP-712-style hash
// `ConsensusMessages.transactionProposal` uses internally) avoids reimplementing an undocumented
// low-level assembly encoding client-side.
//
// A relayer may batch several proposals into one transaction, so the receipt is split into
// segments: each `TransactionProposed` from the configured consensus opens a segment that runs
// until the next one, and `NewRequest` logs from the configured oracle belong to the segment they
// fall in. The target's segment (matching safeTxHash and oracle) must be unique and contain exactly
// one `NewRequest`; anything else is missing or ambiguous and returns null.
export async function getSentinelRequestId(
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
  proposalTxHash: `0x${string}`,
  deps: SentinelDeps = {},
): Promise<`0x${string}` | null> {
  const createClient = deps.createClient ?? createPublicClient
  const decodeLog = deps.decodeLog ?? decodeEventLog
  const normalizeAddress = deps.normalizeAddress ?? getAddress

  const client = createClient({ transport: http(settings.rpc) })
  const receipt = (await client.request({
    method: 'eth_getTransactionReceipt',
    params: [proposalTxHash],
  })) as { logs: Array<{ address: `0x${string}`; data: Hex; topics: [Hex, ...Hex[]]; logIndex?: Hex }> } | null

  if (!receipt) return null

  const consensus = normalizeAddress(settings.consensus)
  const sentinelOracle = normalizeAddress(settings.sentinelOracle)
  const logs = receipt.logs.every((log) => log.logIndex !== undefined)
    ? [...receipt.logs].sort((a, b) => Number(BigInt(a.logIndex!) - BigInt(b.logIndex!)))
    : receipt.logs

  const segments: Array<{ safeTxHash: Hex; oracle: `0x${string}`; requestIds: `0x${string}`[] }> = []
  for (const log of logs) {
    const address = normalizeAddress(log.address)
    if (address === consensus) {
      try {
        const decoded = decodeLog({ abi: [transactionProposedEvent], data: log.data, topics: log.topics })
        if (decoded.eventName === 'TransactionProposed') {
          segments.push({ safeTxHash: decoded.args.safeTxHash, oracle: decoded.args.oracle, requestIds: [] })
        }
      } catch {
        // not a TransactionProposed log; not a segment boundary
      }
    } else if (address === sentinelOracle) {
      try {
        const decoded = decodeLog({ abi: [newRequestEvent], data: log.data, topics: log.topics })
        // A NewRequest before any proposal can't be attributed to one, so it is dropped.
        if (decoded.eventName === 'NewRequest') segments.at(-1)?.requestIds.push(decoded.args.requestId)
      } catch {
        // not a NewRequest log; keep scanning this receipt's other logs
      }
    }
  }

  const matches = segments.filter(
    (segment) =>
      segment.safeTxHash.toLowerCase() === safeTxHash.toLowerCase() &&
      normalizeAddress(segment.oracle) === sentinelOracle,
  )
  if (matches.length !== 1 || matches[0].requestIds.length !== 1) return null
  return matches[0].requestIds[0]
}

export async function checkOracleResult(
  settings: ExtensionSettings,
  requestId: `0x${string}`,
  deps: SentinelDeps = {},
): Promise<SentinelResult> {
  const createClient = deps.createClient ?? createPublicClient
  const decodeLog = deps.decodeLog ?? decodeEventLog
  const normalizeAddress = deps.normalizeAddress ?? getAddress

  const client = createClient({ transport: http(settings.rpc) })
  const rawLogs = await client.request({
    method: 'eth_getLogs',
    params: [
      {
        address: normalizeAddress(settings.sentinelOracle),
        fromBlock: AEGIS_LOGS_FROM_BLOCK,
        toBlock: 'latest',
        topics: [null, requestId],
      },
    ],
  })

  for (const log of rawLogs as Array<{ data: Hex; topics: [Hex, ...Hex[]] }>) {
    try {
      const decoded = decodeLog({ abi: [oracleResultEvent], data: log.data, topics: log.topics })
      if (decoded.eventName === 'OracleResult') {
        return { concluded: true, approved: decoded.args.approved }
      }
    } catch {
      // not an OracleResult log; keep scanning
    }
  }

  return { concluded: false }
}
