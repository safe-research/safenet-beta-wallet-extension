import browser from 'webextension-polyfill'
import { DEFAULT_SETTINGS } from './constants'
import { settingsSchema } from './schema'
import type { ExtensionSettings } from './types'

const KEY = 'safenet-beta-settings'

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(KEY)
  return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...(stored[KEY] ?? {}) })
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settingsSchema.parse(settings) })
}
