import { getAddress, isAddress } from 'viem'
import { AEGIS_NETWORK, NETWORKS } from './constants'
import type { NetworkConfig, SafeTransactionPayload } from './types'

const CHAIN_PREFIX_MAP: Record<string, bigint> = {
  eth: 1n,
  matic: 137n,
  oeth: 10n,
  arb1: 42161n,
  sep: 11155111n,
  base: 8453n,
  gno: 100n,
  bnb: 56n,
  avax: 43114n,
  celo: 42220n,
  zkevm: 1101n,
  zksync: 324n,
  scroll: 534352n,
  aurora: 1313161554n,
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const SAFE_TX_KEYS = [
  'to',
  'value',
  'data',
  'operation',
  'safeTxGas',
  'baseGas',
  'gasPrice',
  'gasToken',
  'refundReceiver',
  'nonce',
] as const
const REVIEW_ACTION_SELECTORS = [
  '[data-testid="continue-sign-btn"]',
  '[data-testid="sign-btn"]',
]
const UI_ANCHOR_SELECTORS = [
  '[data-testid="safe-shield-widget"]',
  ...REVIEW_ACTION_SELECTORS,
]
// Tx details page (/transactions/tx?id=multisig_<safe>_<safeTxHash>): the right-hand column holds
// the audit log and, for queued txs, a row with Confirm/Execute + Reject. Only Reject has a test id;
// each button is wrapped in a Track element, so the row is the nearest ancestor with 2+ buttons.
const TX_DETAILS_REJECT_SELECTOR = '[data-testid="reject-btn"]'
const TX_DETAILS_AUDIT_LOG_SELECTOR = '[data-testid="transaction-actions-list"]'

type ReactFiberNode = {
  return?: ReactFiberNode | null
  memoizedProps?: unknown
  pendingProps?: unknown
  memoizedState?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function looksLikeSafeTxData(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && SAFE_TX_KEYS.every((key) => key in value)
}

function getReactFiberNode(element: Element): ReactFiberNode | null {
  const reactElement = element as unknown as Record<string, unknown>
  const key = Object.keys(reactElement).find(
    (entry) => entry.startsWith('__reactFiber$') || entry.startsWith('__reactContainer$'),
  )
  if (!key) return null
  return reactElement[key] as ReactFiberNode
}

function findSafeTxData(value: unknown, seen = new Set<object>(), depth = 0): Record<string, unknown> | null {
  if (!isRecord(value) || seen.has(value) || depth > 5) return null
  seen.add(value)

  if ('safeTx' in value && isRecord(value.safeTx) && looksLikeSafeTxData(value.safeTx.data)) {
    return value.safeTx.data
  }

  if ('data' in value && looksLikeSafeTxData(value.data)) {
    return value.data
  }

  if (looksLikeSafeTxData(value)) {
    return value
  }

  for (const nested of Object.values(value).slice(0, 24)) {
    const found = findSafeTxData(nested, seen, depth + 1)
    if (found) return found
  }

  return null
}

function getSafeAddressFromValue(value: unknown): `0x${string}` | null {
  const candidate = typeof value === 'string' ? value : isRecord(value) && typeof value.value === 'string' ? value.value : null
  if (!candidate || !isAddress(candidate)) return null
  return getAddress(candidate)
}

function toBigIntValue(value: unknown, fallback = 0n): bigint {
  try {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number') return BigInt(value)
    if (typeof value === 'string' && value !== '') return BigInt(value)
  } catch {
    // ignore parse failures and fall through to fallback
  }
  return fallback
}

function toDataHex(value: unknown): `0x${string}` {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)) {
    return value as `0x${string}`
  }
  return '0x'
}

export function getCurrentSafeTxHashFromUrl(urlString: string): `0x${string}` | null {
  const url = new URL(urlString)
  const id = url.searchParams.get('id')
  if (!id) return null

  if (id.startsWith('0x') && id.length === 66) {
    return id as `0x${string}`
  }

  const lastPart = id.split('_').at(-1)
  if (lastPart?.startsWith('0x') && lastPart.length === 66) {
    return lastPart as `0x${string}`
  }

  return null
}

export function getSafeAddressFromUrl(urlString: string): `0x${string}` | null {
  const url = new URL(urlString)
  const safeParam = url.searchParams.get('safe')
  if (!safeParam) return null

  const safe = safeParam.split(':')[1]
  if (!safe || !isAddress(safe)) return null
  return getAddress(safe)
}

export function getChainIdFromUrl(urlString: string): bigint {
  const url = new URL(urlString)
  const safeParam = url.searchParams.get('safe')
  if (!safeParam) return 11155111n
  const prefix = safeParam.split(':')[0]
  return CHAIN_PREFIX_MAP[prefix] ?? 11155111n
}

export function normalizeDraftTransactionData(
  raw: unknown,
  urlString: string,
): SafeTransactionPayload | null {
  if (!looksLikeSafeTxData(raw)) return null

  const safe = getSafeAddressFromUrl(urlString)
  if (!safe) return null

  const to = getSafeAddressFromValue(raw.to)
  if (!to) return null

  return {
    chainId: getChainIdFromUrl(urlString),
    safe,
    to,
    value: toBigIntValue(raw.value),
    data: toDataHex(raw.data),
    operation: Number(toBigIntValue(raw.operation)) as 0 | 1,
    safeTxGas: toBigIntValue(raw.safeTxGas),
    baseGas: toBigIntValue(raw.baseGas),
    gasPrice: toBigIntValue(raw.gasPrice),
    gasToken: getSafeAddressFromValue(raw.gasToken) ?? ZERO_ADDRESS,
    refundReceiver: getSafeAddressFromValue(raw.refundReceiver) ?? ZERO_ADDRESS,
    nonce: toBigIntValue(raw.nonce),
  }
}

export function getDraftTransactionFromPage(
  documentRef: Document,
  urlString: string,
): SafeTransactionPayload | null {
  const candidates = documentRef.querySelectorAll(UI_ANCHOR_SELECTORS.join(', '))
  for (const element of candidates) {
    let fiber = getReactFiberNode(element)
    let hops = 0
    while (fiber && hops < 40) {
      const raw =
        findSafeTxData(fiber.memoizedProps) ??
        findSafeTxData(fiber.pendingProps) ??
        findSafeTxData(fiber.memoizedState)
      const normalized = normalizeDraftTransactionData(raw, urlString)
      if (normalized) return normalized

      fiber = fiber.return ?? null
      hops += 1
    }
  }

  return null
}

export function isReviewScreen(documentRef: Document): boolean {
  // The SafeShield widget ([data-testid="safe-shield-widget"]) is present on
  // ALL steps of the new-transaction flow (including the "New transaction"
  // form), so it cannot be used to distinguish the review/confirm steps.
  // Only the action buttons are specific to confirm ("Continue") and review
  // ("Sign"), so we rely solely on those.
  return documentRef.querySelector(REVIEW_ACTION_SELECTORS.join(', ')) !== null
}

export function isTxDetailsPage(documentRef: Document, urlString: string): boolean {
  let pathname: string
  try {
    pathname = new URL(urlString).pathname
  } catch {
    return false
  }
  if (!pathname.replace(/\/+$/, '').endsWith('/transactions/tx')) return false
  if (!getCurrentSafeTxHashFromUrl(urlString)) return false
  return documentRef.querySelector(`${TX_DETAILS_REJECT_SELECTOR}, ${TX_DETAILS_AUDIT_LOG_SELECTOR}`) !== null
}

/** Whether the widget should be shown: a review/confirm step, or a multisig tx details page. */
export function isWidgetScreen(documentRef: Document, urlString: string): boolean {
  return isReviewScreen(documentRef) || isTxDetailsPage(documentRef, urlString)
}

function getTxDetailsActionRow(documentRef: Document): Element | null {
  const reject = documentRef.querySelector(TX_DETAILS_REJECT_SELECTOR)
  if (!reject) return null
  let element = reject.parentElement
  while (element && element !== documentRef.body) {
    // Reached the whole column (Reject is the only action, e.g. an expired swap): sit right above Reject.
    if (element.querySelector(TX_DETAILS_AUDIT_LOG_SELECTOR)) break
    if (element.querySelectorAll('button').length > 1) return element
    element = element.parentElement
  }
  return reject.closest('[data-track]') ?? reject
}

function setInlineStyles(container: HTMLElement) {
  container.style.position = 'relative'
  container.style.right = 'auto'
  container.style.bottom = 'auto'
  container.style.zIndex = '1'
  container.style.width = '100%'
  container.style.minWidth = '0'
}

/** Mounts on the tx details page: above the Confirm/Reject row, else below the audit log. */
function mountOnTxDetails(container: HTMLElement, documentRef: Document): boolean {
  const actionRow = getTxDetailsActionRow(documentRef)
  if (actionRow?.parentElement) {
    if (actionRow.previousElementSibling !== container) actionRow.insertAdjacentElement('beforebegin', container)
    setInlineStyles(container)
    container.style.marginTop = '0'
    container.style.marginBottom = '16px'
    return true
  }

  const auditLog = documentRef.querySelector(TX_DETAILS_AUDIT_LOG_SELECTOR)
  if (auditLog?.parentElement) {
    if (auditLog.nextElementSibling !== container) auditLog.insertAdjacentElement('afterend', container)
    setInlineStyles(container)
    container.style.marginTop = '16px'
    container.style.marginBottom = '0'
    return true
  }

  return false
}

function getUiAnchor(documentRef: Document): Element | null {
  for (const selector of UI_ANCHOR_SELECTORS) {
    const element = documentRef.querySelector(selector)
    if (element) return element
  }
  return null
}

function mountUi(container: HTMLElement, documentRef: Document, precedingContainerId?: string) {
  const precedingContainer = precedingContainerId ? documentRef.getElementById(precedingContainerId) : null
  if (precedingContainer?.parentElement) {
    if (precedingContainer.nextElementSibling !== container) {
      precedingContainer.insertAdjacentElement('afterend', container)
    }

    setInlineStyles(container)
    container.style.marginTop = '16px'
    container.style.marginBottom = '0'
    return
  }

  // Review/confirm anchors win: opening Confirm from the tx details page moves the widget into the
  // signing modal, and it moves back once the modal closes.
  const anchor = getUiAnchor(documentRef)
  if (!anchor && mountOnTxDetails(container, documentRef)) return
  if (anchor?.parentElement) {
    const host = anchor.matches('[data-testid="safe-shield-widget"]')
      ? anchor
      : anchor.closest('form, section, article, [role="dialog"]') ?? anchor.parentElement

    if (host.parentElement && container.parentElement !== host.parentElement) {
      host.insertAdjacentElement('afterend', container)
    } else if (host.parentElement && host.nextElementSibling !== container) {
      host.insertAdjacentElement('afterend', container)
    }

    setInlineStyles(container)
    container.style.marginTop = '16px'
    container.style.marginBottom = '0'
    return
  }

  documentRef.body.appendChild(container)
  container.style.position = 'fixed'
  container.style.right = '16px'
  container.style.bottom = '16px'
  container.style.zIndex = '999999'
  container.style.marginTop = '0'
  container.style.marginBottom = '0'
  container.style.width = 'min(360px, calc(100vw - 32px))'
  container.style.minWidth = '300px'
}

export function removeUi(documentRef: Document, network: NetworkConfig = AEGIS_NETWORK) {
  documentRef.getElementById(network.ui.container)?.remove()
}

/** The container each network's widget mounts directly below, per NETWORKS' order. */
function precedingContainerId(network: NetworkConfig): string | undefined {
  const index = NETWORKS.findIndex((n) => n.id === network.id)
  return index > 0 ? NETWORKS[index - 1].ui.container : undefined
}

export function ensureUi(documentRef: Document, network: NetworkConfig = AEGIS_NETWORK) {
  let container = documentRef.getElementById(network.ui.container) as HTMLDivElement | null
  if (!container) {
    container = documentRef.createElement('div')
    container.id = network.ui.container
    container.style.boxSizing = 'border-box'
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
    container.style.gap = '6px'
    container.style.padding = '10px 16px'
    container.style.background = '#1C1C1C'
    container.style.color = '#ffffff'
    container.style.border = '1px solid rgba(255, 255, 255, 0.12)'
    container.style.borderRadius = '8px'
    container.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)'
    container.style.fontFamily = "'DM Sans', Inter, system-ui, sans-serif"

    const row = documentRef.createElement('div')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '10px'

    const icon = documentRef.createElement('span')
    icon.id = network.ui.icon
    icon.textContent = '↻'
    icon.style.fontSize = '16px'
    icon.style.lineHeight = '1'
    icon.style.color = 'rgba(255, 255, 255, 0.6)'
    icon.style.flexShrink = '0'

    const label = documentRef.createElement('span')
    label.textContent = network.label
    label.style.fontWeight = '700'
    label.style.fontSize = '14px'
    label.style.color = '#ffffff'
    label.style.flex = '1'

    const status = documentRef.createElement('span')
    status.id = network.ui.status
    status.style.fontSize = '13px'
    status.style.color = 'rgba(255, 255, 255, 0.6)'

    const button = documentRef.createElement('button')
    button.id = network.ui.button
    button.textContent = 'Run'
    button.style.flexShrink = '0'
    button.style.padding = '4px 10px'
    button.style.border = '1px solid rgba(255, 255, 255, 0.4)'
    button.style.borderRadius = '4px'
    button.style.cursor = 'pointer'
    button.style.background = 'transparent'
    button.style.color = '#ffffff'
    button.style.fontWeight = '600'
    button.style.fontSize = '13px'
    button.style.fontFamily = 'inherit'

    row.append(icon, label, status, button)

    // Fills over a known duration while a timed poll is in flight (see startProgress/stopProgress
    // in content.ts); hidden the rest of the time. Purely a visual estimate of time-to-timeout --
    // the actual result (attested/rejected/concluded) always short-circuits it, whether or not it
    // has visually finished filling.
    const progressTrack = documentRef.createElement('div')
    progressTrack.id = network.ui.progress
    progressTrack.style.display = 'none'
    progressTrack.style.height = '3px'
    progressTrack.style.width = '100%'
    progressTrack.style.borderRadius = '2px'
    progressTrack.style.background = 'rgba(255, 255, 255, 0.08)'
    progressTrack.style.overflow = 'hidden'

    const progressFill = documentRef.createElement('div')
    progressFill.style.height = '100%'
    progressFill.style.width = '0%'
    progressFill.style.background = 'rgba(255, 255, 255, 0.45)'
    progressTrack.appendChild(progressFill)

    container.append(row, progressTrack)
  }

  mountUi(container, documentRef, precedingContainerId(network))
  return container
}
