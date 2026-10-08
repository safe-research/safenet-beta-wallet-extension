import type { ExtensionSettings, NetworkConfig, NetworkId } from './types'

// Safenet Aegis testnet on Gnosis Chain.
// Consensus (block 48632757): https://gnosisscan.io/address/0x73b4BDc3112Dfb86085cDD84f26Ab908B20A4A84
// Sentinel Oracle (block 48617821): https://gnosisscan.io/address/0xB83c4b66e752D947c1F55fd703b7937e21e401E4
// Fee token (reference only, paid by the relayer): 0x3b1cFcfa89A19F6CDf8995ee8AE35D7D585e7025
export const AEGIS_TESTNET_SETTINGS: ExtensionSettings = {
  consensus: '0x73b4BDc3112Dfb86085cDD84f26Ab908B20A4A84',
  sentinelOracle: '0xB83c4b66e752D947c1F55fd703b7937e21e401E4',
  rpc: 'https://gnosis.gateway.tenderly.co',
  relayerUrl: 'https://safenet-proxy-v2.cc0x.workers.dev/tx',
  explorerUrl: 'https://www.safe.dev/safenet/#/safeTx',
}

// Safenet Aegis prod on Gnosis Chain.
// Consensus (block 48635843): https://gnosisscan.io/address/0xc855761D619f6002923507cE68B84d7689C2aa96
// Sentinel Oracle (block 48635850): https://gnosisscan.io/address/0x4F61B8832978e83b80D69551AEf07557DBE41d03
// Fee token (reference only, paid by the relayer): 0x2a22F9c3b484c3629090FeED35F17Ff8F88f76F0
export const AEGIS_PROD_SETTINGS: ExtensionSettings = {
  consensus: '0xc855761D619f6002923507cE68B84d7689C2aa96',
  sentinelOracle: '0x4F61B8832978e83b80D69551AEf07557DBE41d03',
  rpc: 'https://gnosis.gateway.tenderly.co',
  relayerUrl: 'https://safenet-proxy-v2.cc0x.workers.dev/tx',
  explorerUrl: 'https://safenet-explorer.eth.limo/#/safeTx',
}

export type AegisPreset = 'testnet' | 'prod'

export const AEGIS_PRESETS: Record<AegisPreset, ExtensionSettings> = {
  testnet: AEGIS_TESTNET_SETTINGS,
  prod: AEGIS_PROD_SETTINGS,
}

// fromBlock for eth_getLogs on both the consensus and the Sentinel Oracle. Earliest of the four
// Aegis deployments (testnet Sentinel Oracle, block 48617821), so it covers either preset without
// scanning from genesis.
export const AEGIS_LOGS_FROM_BLOCK = '0x2e5d95d'

export const AEGIS_UI_IDS = {
  container: 'safenet-aegis-check-container',
  icon: 'safenet-aegis-check-icon',
  button: 'safenet-aegis-check-button',
  status: 'safenet-aegis-check-status',
  progress: 'safenet-aegis-check-progress',
} as const

export const AEGIS_NETWORK: NetworkConfig = {
  id: 'aegis',
  label: 'Safenet Aegis',
  // New key (not the old `safenet-q3-settings`) so stale Sepolia settings can't override defaults.
  storageKey: 'safenet-aegis-settings',
  defaultSettings: AEGIS_TESTNET_SETTINGS,
  settlementChainId: 100n, // Gnosis Chain
  ui: AEGIS_UI_IDS,
}

export const NETWORKS: readonly NetworkConfig[] = [AEGIS_NETWORK]

export const NETWORKS_BY_ID: Record<NetworkId, NetworkConfig> = {
  aegis: AEGIS_NETWORK,
}
