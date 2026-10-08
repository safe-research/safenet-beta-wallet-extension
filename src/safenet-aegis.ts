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

// `Consensus.proposeTransaction()` calls `SentinelOracle.postRequest()` in the same transaction
// that emits `TransactionProposed`, and `postRequest` emits `NewRequest(requestId, ...)`
// synchronously. Reading `requestId` off that log (rather than recomputing the EIP-712-style hash
// `ConsensusMessages.transactionProposal` uses internally) avoids reimplementing an undocumented
// low-level assembly encoding client-side.
export async function getSentinelRequestId(
  settings: ExtensionSettings,
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
  })) as { logs: Array<{ address: `0x${string}`; data: Hex; topics: [Hex, ...Hex[]] }> } | null

  if (!receipt) return null

  const sentinelOracle = normalizeAddress(settings.sentinelOracle)
  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== sentinelOracle) continue
    try {
      const decoded = decodeLog({ abi: [newRequestEvent], data: log.data, topics: log.topics })
      if (decoded.eventName === 'NewRequest') {
        return decoded.args.requestId
      }
    } catch {
      // not a NewRequest log; keep scanning this receipt's other logs
    }
  }

  return null
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
