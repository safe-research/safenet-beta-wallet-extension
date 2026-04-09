export type ExtensionSettings = {
  consensus: string
  rpc: string
  relayerUrl: string
  autoRun: boolean
}

export type SafeTransactionPayload = {
  chainId: bigint
  safe: `0x${string}`
  to: `0x${string}`
  value: bigint
  data: `0x${string}`
  operation: 0 | 1
  safeTxGas: bigint
  baseGas: bigint
  gasPrice: bigint
  gasToken: `0x${string}`
  refundReceiver: `0x${string}`
  nonce: bigint
}

export type ProposalStatus = 'idle' | 'loading' | 'passed' | 'failed' | 'unsupported'

export type ProposalLookupResult = {
  exists: boolean
  attested: boolean
  explorerUrl?: string
}
