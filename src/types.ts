export type ExtensionSettings = {
  consensus: string
  rpc: string
  relayerUrl: string
  /** Q3-only: the Sentinel Oracle contract address, editable in the popup for Q3. */
  sentinelOracle?: string
}

export type NetworkId = 'beta' | 'q3'

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
  consensusDeploymentBlock: `0x${string}`
  explorerBaseUrl: string
  ui: NetworkUiIds
  /** Q3-only: the Sentinel Oracle contract used for the sentinel-review status step. */
  sentinelOracleAddress?: `0x${string}`
  /** Q3-only: fromBlock used when scanning the Sentinel Oracle's own logs. */
  sentinelOracleDeploymentBlock?: `0x${string}`
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

/** Q3-only: outcome of the Sentinel Oracle's commit/reveal review for a proposed transaction. */
export type SentinelResult = {
  concluded: boolean
  approved?: boolean
}
