import { UI_IDS } from './constants'
import { computeSafeTxHash, isModuleTransaction, lookupProposal, submitProposal } from './safenet'
import { getSettings } from './storage'
import type { ProposalStatus, SafeTransactionPayload } from './types'

function parseBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string' && value.length > 0) {
    try {
      return value.startsWith('0x') ? BigInt(value) : BigInt(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

function readTransactionFromPage(): SafeTransactionPayload | null {
  const script = document.querySelector('[data-testid="transaction-builder"], [data-testid="transaction-checks"]')
  const raw = (window as Window & { __SAFE_TX__?: Record<string, unknown> }).__SAFE_TX__
  const source = raw ?? (script ? undefined : undefined)
  if (!source) return null

  try {
    return {
      chainId: parseBigInt(source.chainId, 11155111n),
      safe: source.safe as `0x${string}`,
      to: source.to as `0x${string}`,
      value: parseBigInt(source.value),
      data: (source.data as `0x${string}`) ?? '0x',
      operation: Number(source.operation ?? 0) as 0 | 1,
      safeTxGas: parseBigInt(source.safeTxGas),
      baseGas: parseBigInt(source.baseGas),
      gasPrice: parseBigInt(source.gasPrice),
      gasToken: ((source.gasToken as `0x${string}`) ?? '0x0000000000000000000000000000000000000000'),
      refundReceiver: ((source.refundReceiver as `0x${string}`) ?? '0x0000000000000000000000000000000000000000'),
      nonce: parseBigInt(source.nonce),
    }
  } catch {
    return null
  }
}

function ensureUi() {
  let container = document.getElementById(UI_IDS.container)
  if (container) return container

  container = document.createElement('div')
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
  container.style.minWidth = '280px'

  const title = document.createElement('div')
  title.textContent = 'Safenet Beta'
  title.style.fontWeight = '700'
  title.style.marginBottom = '8px'

  const button = document.createElement('button')
  button.id = UI_IDS.button
  button.textContent = 'Run check'
  button.style.width = '100%'
  button.style.padding = '8px 10px'
  button.style.border = 'none'
  button.style.borderRadius = '8px'
  button.style.cursor = 'pointer'
  button.style.background = '#10b981'
  button.style.color = '#04130d'

  const status = document.createElement('div')
  status.id = UI_IDS.status
  status.textContent = 'Idle'
  status.style.marginTop = '8px'
  status.style.fontSize = '14px'

  container.append(title, button, status)
  document.body.appendChild(container)
  return container
}

function setStatus(status: ProposalStatus, message: string, link?: string) {
  const statusEl = document.getElementById(UI_IDS.status)
  const button = document.getElementById(UI_IDS.button) as HTMLButtonElement | null
  if (!statusEl) return

  statusEl.innerHTML = ''
  const text = document.createElement('span')
  text.textContent = message
  text.style.color = status === 'passed' ? '#34d399' : status === 'failed' ? '#f87171' : '#f9fafb'
  statusEl.appendChild(text)

  if (link) {
    const anchor = document.createElement('a')
    anchor.href = link
    anchor.textContent = ' Open explorer'
    anchor.target = '_blank'
    anchor.rel = 'noreferrer'
    anchor.style.color = '#93c5fd'
    statusEl.appendChild(anchor)
  }

  if (button) button.disabled = status === 'loading'
}

async function runCheck() {
  const settings = await getSettings()
  const payload = readTransactionFromPage()
  if (!payload) {
    setStatus('failed', 'Transaction details not available yet')
    return
  }
  if (isModuleTransaction(payload)) {
    setStatus('unsupported', 'Module transactions are not supported')
    return
  }

  setStatus('loading', 'Checking Safenet Beta...')
  const safeTxHash = computeSafeTxHash(payload)
  const existing = await lookupProposal(settings, safeTxHash)
  if (existing.exists) {
    setStatus(existing.attested ? 'passed' : 'failed', existing.attested ? 'Passed' : 'failed check', existing.explorerUrl)
    return
  }

  try {
    await submitProposal(settings, payload)
    const afterSubmit = await lookupProposal(settings, safeTxHash)
    setStatus(afterSubmit.attested ? 'passed' : 'failed', afterSubmit.attested ? 'Passed' : 'failed check', afterSubmit.explorerUrl)
  } catch {
    setStatus('failed', 'failed check')
  }
}

async function init() {
  ensureUi()
  const button = document.getElementById(UI_IDS.button)
  button?.addEventListener('click', () => {
    void runCheck()
  })

  const settings = await getSettings()
  if (settings.autoRun) {
    setTimeout(() => {
      void runCheck()
    }, 1500)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init(), { once: true })
} else {
  void init()
}
