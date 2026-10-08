import browser from 'webextension-polyfill'
import { NETWORKS_BY_ID } from './constants'
import { settingsSchema } from './schema'
import type { ExtensionSettings, NetworkId } from './types'

export async function getSettings(networkId: NetworkId = 'aegis'): Promise<ExtensionSettings> {
  const { storageKey, defaultSettings } = NETWORKS_BY_ID[networkId]
  const stored = await browser.storage.local.get(storageKey)
  return settingsSchema.parse({ ...defaultSettings, ...(stored[storageKey] ?? {}) })
}

export async function setSettings(settings: ExtensionSettings, networkId: NetworkId = 'aegis'): Promise<void> {
  const { storageKey } = NETWORKS_BY_ID[networkId]
  await browser.storage.local.set({ [storageKey]: settingsSchema.parse(settings) })
}
