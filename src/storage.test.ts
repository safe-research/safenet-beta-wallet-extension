import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const setMock = vi.fn()

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: getMock,
        set: setMock,
      },
    },
  },
}))

const VALID_SETTINGS = {
  autoRun: false,
  rpc: 'https://rpc.safenet-beta.eth.limo',
  relayerUrl: 'https://explorer.safenet-beta.eth.limo/api/proposals',
  consensus: '0x223624cBF099e5a8f8cD5aF22aFa424a1d1acEE9',
}

describe('storage helpers', () => {
  beforeEach(() => {
    getMock.mockReset()
    setMock.mockReset()
  })

  it('merges defaults with stored settings', async () => {
    getMock.mockResolvedValue({ 'safenet-beta-settings': { ...VALID_SETTINGS, autoRun: true } })
    const { getSettings } = await import('./storage')
    const settings = await getSettings()
    expect(settings.autoRun).toBe(true)
  })

  it('returns defaults when storage is empty', async () => {
    getMock.mockResolvedValue({})
    const { getSettings } = await import('./storage')
    const { DEFAULT_SETTINGS } = await import('./constants')
    const settings = await getSettings()
    expect(settings.consensus).toBe(DEFAULT_SETTINGS.consensus)
    expect(settings.autoRun).toBe(false)
  })

  it('validates on save', async () => {
    const { setSettings } = await import('./storage')
    await setSettings(VALID_SETTINGS)
    expect(setMock).toHaveBeenCalledTimes(1)
  })

  it('throws when saving invalid settings', async () => {
    const { setSettings } = await import('./storage')
    await expect(
      setSettings({ ...VALID_SETTINGS, consensus: 'not-an-address' }),
    ).rejects.toThrow()
  })

  it('throws when loading corrupt stored settings', async () => {
    getMock.mockResolvedValue({
      'safenet-beta-settings': { ...VALID_SETTINGS, rpc: 'not-a-url' },
    })
    const { getSettings } = await import('./storage')
    await expect(getSettings()).rejects.toThrow()
  })
})
