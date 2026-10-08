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
  rpc: 'https://rpc.safenet-beta.eth.limo',
  relayerUrl: 'https://relayer.safenet-beta.eth.limo/api/proposals',
  consensus: '0x223624cBF099e5a8f8cD5aF22aFa424a1d1acEE9',
}

describe('storage helpers', () => {
  beforeEach(() => {
    getMock.mockReset()
    setMock.mockReset()
  })

  it('merges defaults with stored settings', async () => {
    const customRpc = 'https://custom.rpc.example.com'
    getMock.mockResolvedValue({ 'safenet-beta-settings': { ...VALID_SETTINGS, rpc: customRpc } })
    const { getSettings } = await import('./storage')
    const settings = await getSettings()
    expect(settings.rpc).toBe(customRpc)
  })

  it('returns defaults when storage is empty', async () => {
    getMock.mockResolvedValue({})
    const { getSettings } = await import('./storage')
    const { DEFAULT_SETTINGS } = await import('./constants')
    const settings = await getSettings()
    expect(settings.consensus).toBe(DEFAULT_SETTINGS.consensus)
    expect(settings.rpc).toBe(DEFAULT_SETTINGS.rpc)
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

  describe('q3 network', () => {
    const VALID_Q3_SETTINGS = {
      rpc: 'https://sepolia.rpc.example.com',
      relayerUrl: 'https://safenet-proxy-v2.cc0x.workers.dev/tx',
      consensus: '0x23561B7209C0fCa401B4F6DabEDE9d3685de5020',
      sentinelOracle: '0xB2C7711b887Cc1f867768bE224f85ad30bB6da68',
    }

    it('merges q3 defaults with q3-keyed stored settings', async () => {
      const customRpc = 'https://custom-sepolia.example.com'
      getMock.mockResolvedValue({ 'safenet-q3-settings': { ...VALID_Q3_SETTINGS, rpc: customRpc } })
      const { getSettings } = await import('./storage')
      const settings = await getSettings('q3')
      expect(settings.rpc).toBe(customRpc)
      expect(getMock).toHaveBeenCalledWith('safenet-q3-settings')
    })

    it('returns q3 defaults when storage is empty, independent of beta defaults', async () => {
      getMock.mockResolvedValue({})
      const { getSettings } = await import('./storage')
      const { Q3_DEFAULT_SETTINGS } = await import('./constants')
      const settings = await getSettings('q3')
      expect(settings.consensus).toBe(Q3_DEFAULT_SETTINGS.consensus)
      expect(settings.rpc).toBe(Q3_DEFAULT_SETTINGS.rpc)
      expect(settings.relayerUrl).toBe(Q3_DEFAULT_SETTINGS.relayerUrl)
      expect(settings.sentinelOracle).toBe(Q3_DEFAULT_SETTINGS.sentinelOracle)
    })

    it('validates and saves under the q3-specific storage key', async () => {
      const { setSettings } = await import('./storage')
      await setSettings(VALID_Q3_SETTINGS, 'q3')
      expect(setMock).toHaveBeenCalledWith({ 'safenet-q3-settings': expect.any(Object) })
    })

    it('does not touch beta settings when saving q3 settings', async () => {
      const { setSettings } = await import('./storage')
      await setSettings(VALID_Q3_SETTINGS, 'q3')
      const savedArg = setMock.mock.calls[0][0]
      expect(savedArg).not.toHaveProperty('safenet-beta-settings')
    })
  })
})
