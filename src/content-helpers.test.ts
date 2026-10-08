import { describe, expect, it } from 'vitest'
import { AEGIS_NETWORK, AEGIS_UI_IDS as UI_IDS } from './constants'
import {
  ensureUi,
  getChainIdFromUrl,
  getCurrentSafeTxHashFromUrl,
  getDraftTransactionFromPage,
  getSafeAddressFromUrl,
  isReviewScreen,
  isTxDetailsPage,
  isWidgetScreen,
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
    expect(document.getElementById(UI_IDS.button)?.textContent).toBe('Run')
    expect(document.getElementById(UI_IDS.icon)?.textContent).toBe('↻')
    expect(document.getElementById(UI_IDS.status)?.textContent).toBe('')
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

  it('labels the widget as Safenet Aegis', () => {
    document.body.innerHTML = ''

    const container = ensureUi(document, AEGIS_NETWORK)

    expect(container.id).toBe(AEGIS_NETWORK.ui.container)
    expect(container.textContent).toContain('Safenet Aegis')
  })
})

const TX_DETAILS_URL =
  'https://app.safe.global/transactions/tx?id=multisig_0x888614448Eb7c766864faFb1Dd20ff0b47988a87_0xe3e7ee18f1338608d5f6090c49b19395f4aa0b35123918afd1c37ee203eccda0&safe=eth:0x888614448eb7c766864fafb1dd20ff0b47988a87'

// Mirrors Safe Wallet's TxDetails right-hand column: audit log, then (for queued txs) a buttons row
// where each button is wrapped in a Track element.
function txDetailsColumn(actions: string) {
  return `
    <div id="signers">
      <div data-testid="transaction-actions-list">
        <button data-testid="copy-tx-hash-btn">#</button>
        <button data-testid="share-tx-link-btn">Share</button>
      </div>
      ${actions}
    </div>
  `
}
const CONFIRM_REJECT_ROW = `
  <div id="buttons">
    <span data-track="tx-list: Confirm"><button>Confirm</button></span>
    <span data-track="tx-list: Reject"><button data-testid="reject-btn">Reject</button></span>
  </div>
`

describe('isTxDetailsPage', () => {
  it('returns true on a multisig tx details page with Safe Wallet actions rendered', () => {
    document.body.innerHTML = txDetailsColumn(CONFIRM_REJECT_ROW)
    expect(isTxDetailsPage(document, TX_DETAILS_URL)).toBe(true)
    expect(isWidgetScreen(document, TX_DETAILS_URL)).toBe(true)
  })

  it('returns true for an executed tx with only the audit log', () => {
    document.body.innerHTML = txDetailsColumn('')
    expect(isTxDetailsPage(document, TX_DETAILS_URL)).toBe(true)
  })

  it('returns false before the details have rendered', () => {
    document.body.innerHTML = '<div>Loading...</div>'
    expect(isTxDetailsPage(document, TX_DETAILS_URL)).toBe(false)
  })

  it('returns false on the queue list, even with expanded tx actions', () => {
    document.body.innerHTML = txDetailsColumn(CONFIRM_REJECT_ROW)
    expect(isTxDetailsPage(document, 'https://app.safe.global/transactions/queue?safe=eth:0x888614448eb7c766864fafb1dd20ff0b47988a87')).toBe(false)
    expect(isWidgetScreen(document, 'https://app.safe.global/transactions/queue?safe=eth:0x888614448eb7c766864fafb1dd20ff0b47988a87')).toBe(false)
  })

  it('returns false without a safeTxHash in the id param', () => {
    document.body.innerHTML = txDetailsColumn(CONFIRM_REJECT_ROW)
    expect(isTxDetailsPage(document, 'https://app.safe.global/transactions/tx?safe=eth:0x888614448eb7c766864fafb1dd20ff0b47988a87')).toBe(false)
  })
})

describe('ensureUi on the tx details page', () => {
  it('mounts directly above the Confirm/Reject row', () => {
    document.body.innerHTML = txDetailsColumn(CONFIRM_REJECT_ROW)

    const container = ensureUi(document)

    expect(container.nextElementSibling?.id).toBe('buttons')
    expect(container.parentElement?.id).toBe('signers')
    expect(container.style.position).toBe('relative')
  })

  it('stays in place on repeated calls', () => {
    document.body.innerHTML = txDetailsColumn(CONFIRM_REJECT_ROW)

    const first = ensureUi(document)
    const second = ensureUi(document)

    expect(first).toBe(second)
    expect(document.querySelectorAll(`#${UI_IDS.container}`)).toHaveLength(1)
    expect(second.nextElementSibling?.id).toBe('buttons')
  })

  it('mounts directly above Reject when it is the only action', () => {
    document.body.innerHTML = txDetailsColumn(
      '<span data-track="tx-list: Reject"><button data-testid="reject-btn">Reject</button></span>',
    )

    const container = ensureUi(document)

    expect(container.nextElementSibling?.getAttribute('data-track')).toBe('tx-list: Reject')
  })

  it('mounts below the audit log when there are no actions (executed tx)', () => {
    document.body.innerHTML = txDetailsColumn('')

    const container = ensureUi(document)

    expect(container.previousElementSibling?.getAttribute('data-testid')).toBe('transaction-actions-list')
  })

  it('moves into the signing modal when it opens, and back when it closes', () => {
    document.body.innerHTML = `${txDetailsColumn(CONFIRM_REJECT_ROW)}<div id="modal"></div>`
    const container = ensureUi(document)

    document.getElementById('modal')!.innerHTML = `
      <div data-testid="safe-shield-widget">Safe Shield</div>
      <button data-testid="sign-btn">Sign</button>
    `
    ensureUi(document)
    expect(container.previousElementSibling?.getAttribute('data-testid')).toBe('safe-shield-widget')

    // Closing the modal unmounts its subtree, our widget included; it is recreated on the page.
    document.getElementById('modal')!.innerHTML = ''
    const remounted = ensureUi(document)
    expect(remounted.nextElementSibling?.id).toBe('buttons')
    expect(document.querySelectorAll(`#${UI_IDS.container}`)).toHaveLength(1)
  })
})
