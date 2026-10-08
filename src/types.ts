export type ExtensionSettings = {
  consensus: string
  rpc: string
  relayerUrl: string
  /** The Sentinel Oracle contract used for the sentinel-review status step. */
  sentinelOracle: string
  /** Safenet explorer safeTx page; `chainId` and `safeTxHash` are appended as query params. */
  explorerUrl: string
}

export type NetworkId = 'aegis'

export type NetworkUiIds = {
  container: string
  icon: string
  button: string
  status: string
  progress: string
}

export type NetworkConfig = {
  id: NetworkId
  label: string
  storageKey: string
  defaultSettings: ExtensionSettings
  /** The chain the consensus contract itself lives on -- not necessarily the chain of the Safe
   *  being tracked (a single consensus deployment attests transactions for Safes on any chain). */
  settlementChainId: bigint
  ui: NetworkUiIds
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

export type ProposalStatus = 'idle' | 'loading' | 'reviewing' | 'passed' | 'failed' | 'warning' | 'unsupported'

export type ProposalLookupResult = {
  exists: boolean
  attested: boolean
  explorerUrl?: string
  /** Settlement-chain tx hash of the TransactionProposed or TransactionAttested event */
  txHash?: `0x${string}`
}

/** Outcome of the Sentinel Oracle's commit/reveal review for a proposed transaction. */
export type SentinelResult = {
  concluded: boolean
  approved?: boolean
}
