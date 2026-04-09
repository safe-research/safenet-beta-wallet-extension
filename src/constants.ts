import type { ExtensionSettings } from './types'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  consensus: '0x49Db717Adec0D22235A73C3a9c2ea57AB0bC2353',
  rpc: 'https://rpc.safenet-beta.eth.limo',
  relayerUrl: 'https://explorer.safenet-beta.eth.limo/api/proposals',
  autoRun: false,
}

export const SAFE_APP_MATCH = /^https:\/\/(app\.)?safe\.global\//

export const UI_IDS = {
  container: 'safenet-beta-check-container',
  button: 'safenet-beta-check-button',
  status: 'safenet-beta-check-status',
} as const
