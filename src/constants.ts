import type { ExtensionSettings, NetworkConfig, NetworkId } from './types'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  consensus: '0x223624cBF099e5a8f8cD5aF22aFa424a1d1acEE9',
  rpc: 'https://gnosis.gateway.tenderly.co',
  relayerUrl: 'https://safenet-proxy.cc0x.workers.dev/tx',
}

// Deployment block of the consensus contract on Gnosis Chain (block 45210396).
// Used as fromBlock in eth_getLogs to avoid scanning from genesis.
// https://gnosisscan.io/address/0x223624cBF099e5a8f8cD5aF22aFa424a1d1acEE9
export const CONSENSUS_DEPLOYMENT_BLOCK = '0x2B1DB1C'

export const UI_IDS = {
  container: 'safenet-beta-check-container',
  icon: 'safenet-beta-check-icon',
  button: 'safenet-beta-check-button',
  status: 'safenet-beta-check-status',
  progress: 'safenet-beta-check-progress',
} as const

export const Q3_DEFAULT_SETTINGS: ExtensionSettings = {
  consensus: '0x23561B7209C0fCa401B4F6DabEDE9d3685de5020',
  rpc: 'https://sepolia.gateway.tenderly.co',
  relayerUrl: 'https://safenet-proxy-v2.cc0x.workers.dev/tx',
  sentinelOracle: '0xB2C7711b887Cc1f867768bE224f85ad30bB6da68',
}

// Deployment block of the Q3 consensus contract on Ethereum Sepolia (block 11523054).
// https://eth-sepolia.blockscout.com/address/0x23561B7209C0fCa401B4F6DabEDE9d3685de5020
export const Q3_CONSENSUS_DEPLOYMENT_BLOCK = '0xafd3ee'

// Sentinel Oracle used by Q3 consensus for transaction review, deployed at block 11523060.
// Only read by the extension to correlate NewRequest/OracleResult logs for the "sentinels
// reviewing" status step -- never written to.
// https://eth-sepolia.blockscout.com/address/0xB2C7711b887Cc1f867768bE224f85ad30bB6da68
export const Q3_SENTINEL_ORACLE = '0xB2C7711b887Cc1f867768bE224f85ad30bB6da68' as const
export const Q3_SENTINEL_ORACLE_DEPLOYMENT_BLOCK = '0xafd3f4'

// Q3 fee token, documented for reference only. The relayer pays sentinel review fees/bonds from
// its own wallet -- nothing in the extension calls this address.
// https://eth-sepolia.blockscout.com/address/0x1375A61e0d2640b904b844Ae53a7990b3317Ab52
export const Q3_FEE_TOKEN = '0x1375A61e0d2640b904b844Ae53a7990b3317Ab52' as const

export const Q3_UI_IDS = {
  container: 'safenet-q3-check-container',
  icon: 'safenet-q3-check-icon',
  button: 'safenet-q3-check-button',
  status: 'safenet-q3-check-status',
  progress: 'safenet-q3-check-progress',
} as const

export const BETA_NETWORK: NetworkConfig = {
  id: 'beta',
  label: 'Safenet Beta',
  storageKey: 'safenet-beta-settings',
  defaultSettings: DEFAULT_SETTINGS,
  settlementChainId: 100n, // Gnosis Chain
  consensusDeploymentBlock: CONSENSUS_DEPLOYMENT_BLOCK,
  explorerBaseUrl: 'https://explorer.safenet-beta.eth.limo/#/safeTx',
  ui: UI_IDS,
}

export const Q3_NETWORK: NetworkConfig = {
  id: 'q3',
  label: 'Safenet Q3',
  storageKey: 'safenet-q3-settings',
  defaultSettings: Q3_DEFAULT_SETTINGS,
  settlementChainId: 11155111n, // Ethereum Sepolia
  consensusDeploymentBlock: Q3_CONSENSUS_DEPLOYMENT_BLOCK,
  explorerBaseUrl: 'https://www.safe.dev/safenet/#/safeTx',
  ui: Q3_UI_IDS,
  sentinelOracleAddress: Q3_SENTINEL_ORACLE,
  sentinelOracleDeploymentBlock: Q3_SENTINEL_ORACLE_DEPLOYMENT_BLOCK,
}

// Order matters: content-helpers.ts stacks each network's widget directly below the previous
// network's in this array order (Beta above Q3).
export const NETWORKS: readonly NetworkConfig[] = [BETA_NETWORK, Q3_NETWORK]

export const NETWORKS_BY_ID: Record<NetworkId, NetworkConfig> = {
  beta: BETA_NETWORK,
  q3: Q3_NETWORK,
}
