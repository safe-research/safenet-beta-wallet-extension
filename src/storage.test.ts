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

describe('storage helpers', () => {
  beforeEach(() => {
    getMock.mockReset()
    setMock.mockReset()
  })

  it('merges defaults with stored settings', async () => {
    getMock.mockResolvedValue({
      'safenet-beta-settings': {
        autoRun: true,
        rpc: 'https://rpc.safenet-beta.eth.limo',
        relayerUrl: 'https://explorer.safenet-beta.eth.limo/api/proposals',
        consensus: '0x49Db717Adec0D22235A73C3a9c2ea57AB0bC2353',
      },
    })

    const { getSettings } = await import('./storage')
    const settings = await getSettings()
    expect(settings.autoRun).toBe(true)
  })

  it('validates on save', async () => {
    const { setSettings } = await import('./storage')
    await setSettings({
      autoRun: false,
      rpc: 'https://rpc.safenet-beta.eth.limo',
      relayerUrl: 'https://explorer.safenet-beta.eth.limo/api/proposals',
      consensus: '0x49Db717Adec0D22235A73C3a9c2ea57AB0bC2353',
    })
    expect(setMock).toHaveBeenCalledTimes(1)
  })
})
