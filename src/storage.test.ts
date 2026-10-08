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
  rpc: 'https://rpc.example.com',
  relayerUrl: 'https://relayer.example.com/tx',
  consensus: '0x73b4BDc3112Dfb86085cDD84f26Ab908B20A4A84',
  sentinelOracle: '0xB83c4b66e752D947c1F55fd703b7937e21e401E4',
  explorerUrl: 'https://www.safe.dev/safenet/#/safeTx',
}

describe('storage helpers', () => {
  beforeEach(() => {
    getMock.mockReset()
    setMock.mockReset()
  })

  it('merges defaults with stored settings', async () => {
    const customRpc = 'https://custom.rpc.example.com'
    getMock.mockResolvedValue({ 'safenet-aegis-settings': { ...VALID_SETTINGS, rpc: customRpc } })
    const { getSettings } = await import('./storage')
    const settings = await getSettings()
    expect(settings.rpc).toBe(customRpc)
  })

  it('returns testnet defaults when storage is empty', async () => {
    getMock.mockResolvedValue({})
    const { getSettings } = await import('./storage')
    const { AEGIS_TESTNET_SETTINGS } = await import('./constants')
    const settings = await getSettings()
    expect(settings).toEqual(AEGIS_TESTNET_SETTINGS)
    expect(getMock).toHaveBeenCalledWith('safenet-aegis-settings')
  })

  it('ignores settings left over under the old q3 key', async () => {
    getMock.mockImplementation(async (key: string) =>
      key === 'safenet-q3-settings' ? { 'safenet-q3-settings': { rpc: 'https://sepolia.example.com' } } : {},
    )
    const { getSettings } = await import('./storage')
    const settings = await getSettings()
    expect(settings.rpc).toBe('https://gnosis.gateway.tenderly.co')
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
      'safenet-aegis-settings': { ...VALID_SETTINGS, rpc: 'not-a-url' },
    })
    const { getSettings } = await import('./storage')
    await expect(getSettings()).rejects.toThrow()
  })
})
