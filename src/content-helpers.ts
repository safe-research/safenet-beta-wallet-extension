import { UI_IDS } from './constants'

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

export function getChainIdFromUrl(urlString: string): bigint {
  const url = new URL(urlString)
  const safeParam = url.searchParams.get('safe')
  if (!safeParam) return 11155111n
  const prefix = safeParam.split(':')[0]
  return CHAIN_PREFIX_MAP[prefix] ?? 11155111n
}

export function ensureUi(documentRef: Document) {
  let container = documentRef.getElementById(UI_IDS.container)
  if (container) return container

  container = documentRef.createElement('div')
  container.id = UI_IDS.container
  container.style.position = 'fixed'
  container.style.right = '16px'
  container.style.bottom = '16px'
  container.style.zIndex = '999999'
  container.style.padding = '12px'
  container.style.background = '#111827'
  container.style.color = '#fff'
  container.style.borderRadius = '12px'
  container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)'
  container.style.minWidth = '300px'

  const title = documentRef.createElement('div')
  title.textContent = 'Safenet Beta'
  title.style.fontWeight = '700'
  title.style.marginBottom = '8px'

  const button = documentRef.createElement('button')
  button.id = UI_IDS.button
  button.textContent = 'Run check'
  button.style.width = '100%'
  button.style.padding = '8px 10px'
  button.style.border = 'none'
  button.style.borderRadius = '8px'
  button.style.cursor = 'pointer'
  button.style.background = '#10b981'
  button.style.color = '#04130d'

  const status = documentRef.createElement('div')
  status.id = UI_IDS.status
  status.textContent = 'Idle'
  status.style.marginTop = '8px'
  status.style.fontSize = '14px'

  container.append(title, button, status)
  documentRef.body.appendChild(container)
  return container
}
