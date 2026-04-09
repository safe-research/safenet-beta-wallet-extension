import { createPublicClient, getAddress, http, isAddress, keccak256, encodePacked } from 'viem'
import type { ExtensionSettings, ProposalLookupResult, SafeTransactionPayload } from './types'

function toHexBigInt(value: bigint) {
  return `0x${value.toString(16)}`
}

export function isModuleTransaction(payload: SafeTransactionPayload) {
  return payload.operation !== 0 && payload.operation !== 1
}

export function computeSafeTxHash(payload: SafeTransactionPayload): `0x${string}` {
  return keccak256(
    encodePacked(
      ['uint256', 'address', 'address', 'uint256', 'bytes', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
      [
        payload.chainId,
        payload.safe,
        payload.to,
        payload.value,
        payload.data,
        payload.operation,
        payload.safeTxGas,
        payload.baseGas,
        payload.gasPrice,
        payload.gasToken,
        payload.refundReceiver,
        payload.nonce,
      ],
    ),
  )
}

export async function lookupProposal(
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
): Promise<ProposalLookupResult> {
  const url = new URL('https://explorer.safenet-beta.eth.limo/safeTx')
  url.searchParams.set('safeTxHash', safeTxHash)
  url.searchParams.set('chainId', '11155111')

  try {
    const client = createPublicClient({ transport: http(settings.rpc) })
    const logs = await client.getLogs({
      address: getAddress(settings.consensus),
      fromBlock: 'earliest',
      toBlock: 'latest',
    })

    const serialized = JSON.stringify(logs)
    const exists = serialized.toLowerCase().includes(safeTxHash.toLowerCase())
    return {
      exists,
      attested: exists,
      explorerUrl: exists ? url.toString() : undefined,
    }
  } catch {
    return { exists: false, attested: false }
  }
}

export async function submitProposal(settings: ExtensionSettings, payload: SafeTransactionPayload) {
  if (!isAddress(settings.consensus)) throw new Error('Invalid consensus address')
  const response = await fetch(settings.relayerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: toHexBigInt(payload.chainId),
      safe: payload.safe,
      to: payload.to,
      value: toHexBigInt(payload.value),
      data: payload.data,
      operation: payload.operation,
      safeTxGas: toHexBigInt(payload.safeTxGas),
      baseGas: toHexBigInt(payload.baseGas),
      gasPrice: toHexBigInt(payload.gasPrice),
      gasToken: payload.gasToken,
      refundReceiver: payload.refundReceiver,
      nonce: toHexBigInt(payload.nonce),
    }),
  })

  if (!response.ok) throw new Error('Proposal submission failed')
}
