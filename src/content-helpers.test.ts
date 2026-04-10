import { describe, expect, it } from 'vitest'
import { UI_IDS } from './constants'
import {
  ensureUi,
  getChainIdFromUrl,
  getCurrentSafeTxHashFromUrl,
  getDraftTransactionFromPage,
  getSafeAddressFromUrl,
  isReviewScreen,
  removeUi,
} from './content-helpers'

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

describe('getSafeAddressFromUrl', () => {
  it('parses the safe address from the safe query param', () => {
    expect(
      getSafeAddressFromUrl(
        'https://app.safe.global/home?safe=gno:0x1111111111111111111111111111111111111111',
      ),
    ).toBe('0x1111111111111111111111111111111111111111')
  })

  it('returns null for missing or invalid safe params', () => {
    expect(getSafeAddressFromUrl('https://app.safe.global/home')).toBeNull()
    expect(getSafeAddressFromUrl('https://app.safe.global/home?safe=gno:not-an-address')).toBeNull()
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

describe('getDraftTransactionFromPage', () => {
  it('extracts draft tx data from React fiber props on the review page', () => {
    document.body.innerHTML = '<button data-testid="continue-sign-btn">Continue</button>'

    const button = document.querySelector('[data-testid="continue-sign-btn"]') as HTMLButtonElement &
      Record<string, unknown>
    button.__reactFiber$test = {
      memoizedProps: { children: 'Continue' },
      return: {
        memoizedProps: {
          safeTx: {
            data: {
              to: '0x2222222222222222222222222222222222222222',
              value: '123',
              data: '0xdeadbeef',
              operation: 1,
              safeTxGas: '45',
              baseGas: '6',
              gasPrice: '7',
              gasToken: '0x3333333333333333333333333333333333333333',
              refundReceiver: '0x4444444444444444444444444444444444444444',
              nonce: 9,
            },
          },
        },
        return: null,
      },
    }

    expect(
      getDraftTransactionFromPage(
        document,
        'https://app.safe.global/transactions/tx?safe=gno:0x1111111111111111111111111111111111111111',
      ),
    ).toEqual({
      chainId: 100n,
      safe: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 123n,
      data: '0xdeadbeef',
      operation: 1,
      safeTxGas: 45n,
      baseGas: 6n,
      gasPrice: 7n,
      gasToken: '0x3333333333333333333333333333333333333333',
      refundReceiver: '0x4444444444444444444444444444444444444444',
      nonce: 9n,
    })
  })
})

describe('isReviewScreen', () => {
  it('returns true when review actions are present', () => {
    document.body.innerHTML = '<button data-testid="continue-sign-btn">Continue</button>'
    expect(isReviewScreen(document)).toBe(true)
  })

  it('returns false when only the Safe Shield widget is present (it appears on the new-transaction form too)', () => {
    document.body.innerHTML = '<div data-testid="safe-shield-widget">Safe Shield</div>'
    expect(isReviewScreen(document)).toBe(false)
  })

  it('returns false outside the review step', () => {
    document.body.innerHTML = '<div>Not a review screen</div>'
    expect(isReviewScreen(document)).toBe(false)
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

  it('mounts the UI directly below the Safe Shield widget when present', () => {
    document.body.innerHTML = `
      <section>
        <div data-testid="safe-shield-widget">Safe Shield</div>
      </section>
    `

    const container = ensureUi(document)
    const safeShield = document.querySelector('[data-testid="safe-shield-widget"]')

    expect(safeShield?.nextElementSibling).toBe(container)
    expect(container.style.position).toBe('relative')
  })

  it('removes the UI when asked', () => {
    document.body.innerHTML = ''
    ensureUi(document)
    removeUi(document)
    expect(document.getElementById(UI_IDS.container)).toBeNull()
  })
})
