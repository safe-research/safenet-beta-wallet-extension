import { describe, expect, it } from 'vitest'
import { UI_IDS } from './constants'
import { ensureUi, getChainIdFromUrl, getCurrentSafeTxHashFromUrl } from './content-helpers'

describe('getCurrentSafeTxHashFromUrl', () => {
  it('parses a direct safeTxHash from the id query param', () => {
    const hash = '0x' + 'a'.repeat(64)
    expect(getCurrentSafeTxHashFromUrl(`https://app.safe.global/transactions/tx?id=${hash}`)).toBe(hash)
  })

  it('parses Safe Wallet multisig_<safe>_<safeTxHash> format', () => {
    const hash = '0x' + 'b'.repeat(64)
    const safe = '0x' + '1'.repeat(40)
    expect(getCurrentSafeTxHashFromUrl(`https://app.safe.global/transactions/tx?id=multisig_${safe}_${hash}`)).toBe(hash)
  })

  it('returns null for missing or invalid ids', () => {
    expect(getCurrentSafeTxHashFromUrl('https://app.safe.global/transactions/tx')).toBeNull()
    expect(getCurrentSafeTxHashFromUrl('https://app.safe.global/transactions/tx?id=abc')).toBeNull()
  })
})

describe('getChainIdFromUrl', () => {
  it('maps known Safe prefixes correctly', () => {
    expect(getChainIdFromUrl('https://app.safe.global/home?safe=eth:0x123')).toBe(1n)
    expect(getChainIdFromUrl('https://app.safe.global/home?safe=gno:0x123')).toBe(100n)
    expect(getChainIdFromUrl('https://app.safe.global/home?safe=base:0x123')).toBe(8453n)
  })

  it('falls back to Sepolia for unknown or missing prefixes', () => {
    expect(getChainIdFromUrl('https://app.safe.global/home?safe=unknown:0x123')).toBe(11155111n)
    expect(getChainIdFromUrl('https://app.safe.global/home')).toBe(11155111n)
  })
})

describe('ensureUi', () => {
  it('creates the UI once and reuses it on repeated calls', () => {
    document.body.innerHTML = ''

    const first = ensureUi(document)
    const second = ensureUi(document)

    expect(first).toBe(second)
    expect(document.querySelectorAll(`#${UI_IDS.container}`)).toHaveLength(1)
    expect(document.getElementById(UI_IDS.button)?.textContent).toBe('Run check')
    expect(document.getElementById(UI_IDS.status)?.textContent).toBe('Idle')
  })
})
