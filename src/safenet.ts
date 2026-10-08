import { getAddress, hashTypedData, isAddress } from 'viem'
import type { ExtensionSettings, SafeTransactionPayload } from './types'

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

/** `consensus`/`sentinelOracle` are sent alongside the Safe tx so the relayer can route to the
 *  matching Aegis deployment (testnet or prod); relayers that don't need them ignore them.
 *  Returns the relayer's raw response body (e.g. it may echo back the submission tx hash), or
 *  null if the body can't be read -- purely a best-effort diagnostic for callers to log. */
export async function submitProposal(
  settings: ExtensionSettings,
  payload: SafeTransactionPayload,
): Promise<string | null> {
  if (!isAddress(settings.consensus)) throw new Error('Invalid consensus address')
  const response = await fetch(settings.relayerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consensus: settings.consensus,
      sentinelOracle: settings.sentinelOracle,
      chainId: payload.chainId.toString(),
      safe: payload.safe,
      to: payload.to,
      value: payload.value.toString(),
      data: payload.data,
      operation: payload.operation,
      safeTxGas: payload.safeTxGas.toString(),
      baseGas: payload.baseGas.toString(),
      gasPrice: payload.gasPrice.toString(),
      gasToken: payload.gasToken,
      refundReceiver: payload.refundReceiver,
      nonce: payload.nonce.toString(),
    }),
  })

  if (!response.ok) throw new Error('Proposal submission failed')
  return response.text().catch(() => null)
}
