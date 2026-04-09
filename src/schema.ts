import { getAddress } from 'viem'
import { z } from 'zod'

const hexString = z.string().regex(/^0x[0-9a-fA-F]*$/)
const addressString = z.string().transform((value, ctx) => {
  try {
    return getAddress(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid address' })
    return z.NEVER
  }
})

const bigintLike = z.union([z.bigint(), z.number(), z.string()]).transform((value, ctx) => {
  try {
    return typeof value === 'bigint' ? value : BigInt(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid bigint-like value' })
    return z.NEVER
  }
})

export const settingsSchema = z.object({
  consensus: addressString,
  rpc: z.url(),
  relayerUrl: z.url(),
  autoRun: z.boolean(),
})

export const safeTransactionSchema = z.object({
  chainId: bigintLike,
  safe: addressString,
  to: addressString,
  value: bigintLike,
  data: hexString,
  operation: z.union([z.literal(0), z.literal(1)]),
  safeTxGas: bigintLike,
  baseGas: bigintLike,
  gasPrice: bigintLike,
  gasToken: addressString,
  refundReceiver: addressString,
  nonce: bigintLike,
})

export const safeServiceTransactionSchema = z.object({
  txInfo: z.object({
    safeAddress: z.string().optional(),
  }).optional(),
  txData: z.object({
    to: z.union([z.string(), z.object({ value: z.string() })]).optional(),
    dataHex: z.string().optional(),
    data: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    operation: z.number().optional(),
    safeTxGas: z.union([z.string(), z.number()]).optional(),
    baseGas: z.union([z.string(), z.number()]).optional(),
    gasPrice: z.union([z.string(), z.number()]).optional(),
    gasToken: z.string().optional(),
    refundReceiver: z.string().optional(),
    nonce: z.union([z.string(), z.number()]).optional(),
  }).optional(),
  safeAddress: z.string().optional(),
  to: z.string().optional(),
  data: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  operation: z.number().optional(),
  safeTxGas: z.union([z.string(), z.number()]).optional(),
  baseGas: z.union([z.string(), z.number()]).optional(),
  gasPrice: z.union([z.string(), z.number()]).optional(),
  gasToken: z.string().optional(),
  refundReceiver: z.string().optional(),
  nonce: z.union([z.string(), z.number()]).optional(),
  detailedExecutionInfo: z.any().optional(),
})
