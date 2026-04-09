import { getAddress, isAddress } from 'viem'
import { UI_IDS } from './constants'
import type { SafeTransactionPayload } from './types'

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
  if (documentRef.querySelector(REVIEW_ACTION_SELECTORS.join(', '))) {
    return true
  }

  return Array.from(documentRef.querySelectorAll('button')).some((button) => {
    const text = button.textContent?.trim().toLowerCase() ?? ''
    return text === 'continue' || text === 'sign' || text === 'execute'
  })
}

function getUiAnchor(documentRef: Document): Element | null {
  for (const selector of UI_ANCHOR_SELECTORS) {
    const element = documentRef.querySelector(selector)
    if (element) return element
  }
  return null
}

function mountUi(container: HTMLElement, documentRef: Document) {
  const anchor = getUiAnchor(documentRef)
  if (anchor?.parentElement) {
    const host = anchor.matches('[data-testid="safe-shield-widget"]')
      ? anchor
      : anchor.closest('form, section, article, [role="dialog"]') ?? anchor.parentElement

    if (host.parentElement && container.parentElement !== host.parentElement) {
      host.insertAdjacentElement('afterend', container)
    } else if (host.parentElement && host.nextElementSibling !== container) {
      host.insertAdjacentElement('afterend', container)
    }

    container.style.position = 'relative'
    container.style.right = 'auto'
    container.style.bottom = 'auto'
    container.style.zIndex = '1'
    container.style.marginTop = '16px'
    container.style.width = '100%'
    container.style.minWidth = '0'
    return
  }

  documentRef.body.appendChild(container)
  container.style.position = 'fixed'
  container.style.right = '16px'
  container.style.bottom = '16px'
  container.style.zIndex = '999999'
  container.style.marginTop = '0'
  container.style.width = 'min(360px, calc(100vw - 32px))'
  container.style.minWidth = '300px'
}

export function removeUi(documentRef: Document) {
  documentRef.getElementById(UI_IDS.container)?.remove()
}

export function ensureUi(documentRef: Document) {
  let container = documentRef.getElementById(UI_IDS.container) as HTMLDivElement | null
  if (!container) {
    container = documentRef.createElement('div')
    container.id = UI_IDS.container
    container.style.boxSizing = 'border-box'
    container.style.padding = '16px'
    container.style.background = '#ffffff'
    container.style.color = '#121312'
    container.style.border = '1px solid rgba(18, 19, 18, 0.12)'
    container.style.borderRadius = '16px'
    container.style.boxShadow = '0 8px 24px rgba(18, 19, 18, 0.08)'
    container.style.fontFamily = 'Inter, system-ui, sans-serif'

    const title = documentRef.createElement('div')
    title.textContent = 'Safenet Beta'
    title.style.fontWeight = '700'
    title.style.fontSize = '16px'
    title.style.marginBottom = '12px'

    const button = documentRef.createElement('button')
    button.id = UI_IDS.button
    button.textContent = 'Run check'
    button.style.width = '100%'
    button.style.padding = '10px 12px'
    button.style.border = '1px solid #121312'
    button.style.borderRadius = '10px'
    button.style.cursor = 'pointer'
    button.style.background = '#121312'
    button.style.color = '#ffffff'
    button.style.fontWeight = '600'

    const status = documentRef.createElement('div')
    status.id = UI_IDS.status
    status.textContent = 'Idle'
    status.style.marginTop = '12px'
    status.style.fontSize = '14px'
    status.style.lineHeight = '20px'
    status.style.padding = '10px 12px'
    status.style.borderRadius = '12px'
    status.style.background = '#f4f5f7'
    status.style.color = '#3b4248'

    container.append(title, button, status)
  }

  mountUi(container, documentRef)
  return container
}
