import type { ExtensionSettings } from './types'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  consensus: '0x223624cBF099e5a8f8cD5aF22aFa424a1d1acEE9',
  rpc: 'https://gnosis.gateway.tenderly.co',
  relayerUrl: 'https://safenet-proxy.cc0x.workers.dev/tx',
}

// Deployment block of the consensus contract on Gnosis Chain (block 45210396).
// Used as fromBlock in eth_getLogs to avoid scanning from genesis.
// https://gnosisscan.io/address/0x223624cBF099e5a8f8cD5aF22aFa424a1d1acEE9
export const CONSENSUS_DEPLOYMENT_BLOCK = '0x2B1DB1C'

export const SAFE_APP_MATCH = /^https:\/\/(app\.)?safe\.global\//

export const UI_IDS = {
  container: 'safenet-beta-check-container',
  button: 'safenet-beta-check-button',
  status: 'safenet-beta-check-status',
} as const
