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

type AddressLike = string | { value?: string } | null | undefined

function addressValue(value: AddressLike): string | undefined {
  return typeof value === 'string' ? value : value?.value
}

function firstDefined<T>(...values: (T | null | undefined)[]): T | undefined {
  return values.find((value): value is T => value !== undefined && value !== null)
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Loads a multisig tx from the Safe client gateway. The current response splits the SafeTx fields:
 *  `to`/`value`/`operation`/`hexData` live in `txData`, while `nonce`, the gas fields, `gasToken` and
 *  `refundReceiver` (as `{ value }`) live in `detailedExecutionInfo`. Older flat and txInfo/txData
 *  shapes are still accepted. */
export async function loadSafeTransactionFromService(chainId: bigint, safeTxHash: `0x${string}`) {
  const url = `https://safe-client.safe.global/v1/chains/${chainId.toString()}/transactions/${safeTxHash}`
  const response = await fetch(url)
  if (!response.ok) return null
  const json = await response.json()
  const txData = json?.txData ?? {}
  const execution = json?.detailedExecutionInfo ?? {}

  const safeAddress = firstDefined<string>(json?.safeAddress, json?.txInfo?.safeAddress)
  const to = addressValue(firstDefined<AddressLike>(txData.to, json?.to))
  const nonce = firstDefined<string | number>(execution.nonce, txData.nonce, json?.nonce)
  if (!safeAddress || !to || nonce == null) return null

  const field = (key: string) => firstDefined<string | number>(execution[key], txData[key], json?.[key])
  const addressField = (key: string) =>
    addressValue(firstDefined<AddressLike>(execution[key], txData[key], json?.[key])) ?? ZERO_ADDRESS

  return {
    chainId,
    safe: getAddress(safeAddress),
    to: getAddress(to),
    value: BigInt(firstDefined<string | number>(txData.value, json?.value) ?? 0),
    data: firstDefined<`0x${string}`>(txData.hexData, txData.dataHex, txData.data, json?.data) || '0x',
    operation: Number(firstDefined<number>(txData.operation, json?.operation) ?? 0) as 0 | 1,
    safeTxGas: BigInt(field('safeTxGas') ?? 0),
    baseGas: BigInt(field('baseGas') ?? 0),
    gasPrice: BigInt(field('gasPrice') ?? 0),
    gasToken: getAddress(addressField('gasToken')),
    refundReceiver: getAddress(addressField('refundReceiver')),
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
