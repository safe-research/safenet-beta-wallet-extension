import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  http,
  isAddress,
  pad,
  parseAbi,
  parseAbiItem,
  type Hex,
} from 'viem'
import { CONSENSUS_DEPLOYMENT_BLOCK } from './constants'
import type { ExtensionSettings, ProposalLookupResult, SafeTransactionPayload } from './types'

type LookupProposalDeps = {
  createClient?: typeof createPublicClient
  decodeLog?: typeof decodeEventLog
  normalizeAddress?: typeof getAddress
  padAddress?: typeof pad
}

export const consensusAbi = parseAbi([
  'function proposeTransaction((uint256 chainId, address safe, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) transaction) external returns (bytes32 safeTxHash)',
])

const transactionProposedEvent = parseAbiItem(
  'event TransactionProposed(bytes32 indexed safeTxHash, uint256 indexed chainId, address indexed safe, uint64 epoch, (uint256 chainId, address safe, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) transaction)',
)

const transactionAttestedEvent = parseAbiItem(
  'event TransactionAttested(bytes32 indexed safeTxHash, uint256 indexed chainId, address indexed safe, uint64 epoch, bytes32 signatureId, ((uint256 x, uint256 y) r, uint256 z) attestation)',
)

export function isModuleTransaction(payload: SafeTransactionPayload) {
  return payload.operation !== 0 && payload.operation !== 1
}

export function computeSafeTxHash(payload: SafeTransactionPayload): `0x${string}` {
  return hashTypedData({
    domain: {
      chainId: payload.chainId,
      verifyingContract: payload.safe,
    },
    types: {
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'SafeTx',
    message: {
      to: payload.to,
      value: payload.value,
      data: payload.data,
      operation: payload.operation,
      safeTxGas: payload.safeTxGas,
      baseGas: payload.baseGas,
      gasPrice: payload.gasPrice,
      gasToken: payload.gasToken,
      refundReceiver: payload.refundReceiver,
      nonce: payload.nonce,
    },
  })
}

export function explorerUrl(chainId: bigint, safeTxHash: `0x${string}`) {
  const url = new URL('https://explorer.safenet-beta.eth.limo/safeTx')
  url.searchParams.set('chainId', chainId.toString())
  url.searchParams.set('safeTxHash', safeTxHash)
  return url.toString()
}

export async function lookupProposal(
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
  chainId: bigint,
  safe?: `0x${string}`,
  deps: LookupProposalDeps = {},
): Promise<ProposalLookupResult> {
  const createClient = deps.createClient ?? createPublicClient
  const decodeLog = deps.decodeLog ?? decodeEventLog
  const normalizeAddress = deps.normalizeAddress ?? getAddress
  const padAddress = deps.padAddress ?? pad

  const client = createClient({ transport: http(settings.rpc) })
  const topics = [null, safeTxHash, null, safe ? padAddress(safe) : null] as (Hex | null)[]

  const rawLogs = await client.request({
    method: 'eth_getLogs',
    params: [
      {
        address: normalizeAddress(settings.consensus),
        fromBlock: CONSENSUS_DEPLOYMENT_BLOCK,
        toBlock: 'latest',
        topics,
      },
    ],
  })

  let proposed = false
  let attested = false

  for (const log of rawLogs as Array<{ data: Hex; topics: [Hex, ...Hex[]] }>) {
    try {
      const proposedDecoded = decodeLog({
        abi: [transactionProposedEvent],
        data: log.data,
        topics: log.topics,
      })
      if (proposedDecoded.eventName === 'TransactionProposed') proposed = true
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
      if (attestedDecoded.eventName === 'TransactionAttested') attested = true
    } catch {
      // not a TransactionAttested log; skip
    }
  }

  return {
    exists: proposed || attested,
    attested,
    explorerUrl: proposed || attested ? explorerUrl(chainId, safeTxHash) : undefined,
  }
}

export async function loadSafeTransactionFromService(chainId: bigint, safeTxHash: `0x${string}`) {
  const url = `https://safe-client.safe.global/v1/chains/${chainId.toString()}/transactions/${safeTxHash}`
  const response = await fetch(url)
  if (!response.ok) return null
  const json = await response.json()
  const tx = json?.txInfo ?? json
  const detailed = json?.txData ?? json?.detailedExecutionInfo ?? json
  const safeAddress = tx?.safeAddress ?? json?.safeAddress
  const toValue = detailed?.to?.value ?? detailed?.to ?? json?.to
  const data = detailed?.dataHex ?? detailed?.data ?? json?.data ?? '0x'
  const value = detailed?.value ?? json?.value ?? '0'
  const nonce = detailed?.nonce ?? json?.nonce
  if (!safeAddress || !toValue || nonce == null) return null

  return {
    chainId,
    safe: getAddress(safeAddress),
    to: getAddress(typeof toValue === 'string' ? toValue : toValue.value),
    value: BigInt(value),
    data: data || '0x',
    operation: Number(detailed?.operation ?? json?.operation ?? 0) as 0 | 1,
    safeTxGas: BigInt(detailed?.safeTxGas ?? json?.safeTxGas ?? 0),
    baseGas: BigInt(detailed?.baseGas ?? json?.baseGas ?? 0),
    gasPrice: BigInt(detailed?.gasPrice ?? json?.gasPrice ?? 0),
    gasToken: getAddress(detailed?.gasToken ?? json?.gasToken ?? '0x0000000000000000000000000000000000000000'),
    refundReceiver: getAddress(detailed?.refundReceiver ?? json?.refundReceiver ?? '0x0000000000000000000000000000000000000000'),
    nonce: BigInt(nonce),
  } satisfies SafeTransactionPayload
}

export function encodeProposalTransactionData(
  settings: ExtensionSettings,
  payload: SafeTransactionPayload,
): Hex {
  if (!isAddress(settings.consensus)) throw new Error('Invalid consensus address')

  return encodeFunctionData({
    abi: consensusAbi,
    functionName: 'proposeTransaction',
    args: [
      {
        chainId: payload.chainId,
        safe: payload.safe,
        to: payload.to,
        value: payload.value,
        data: payload.data,
        operation: payload.operation,
        safeTxGas: payload.safeTxGas,
        baseGas: payload.baseGas,
        gasPrice: payload.gasPrice,
        gasToken: payload.gasToken,
        refundReceiver: payload.refundReceiver,
        nonce: payload.nonce,
      },
    ],
  })
}
