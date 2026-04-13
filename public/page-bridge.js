(() => {
  const PAGE_BRIDGE_SOURCE = 'safenet-beta-page-bridge'
  const CONTENT_SOURCE = 'safenet-beta-content'
  const PAGE_BRIDGE_REQUEST = 'request-draft-tx'
  const PAGE_BRIDGE_RESPONSE = 'draft-tx-response'
  const PAGE_BRIDGE_SUBMIT_REQUEST = 'submit-proposal'
  const PAGE_BRIDGE_SUBMIT_RESPONSE = 'submit-proposal-response'
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
  ]
  const UI_ANCHOR_SELECTORS = [
    '[data-testid="safe-shield-widget"]',
    '[data-testid="continue-sign-btn"]',
    '[data-testid="sign-btn"]',
  ]

  const isRecord = (value) => typeof value === 'object' && value !== null

  const looksLikeSafeTxData = (value) =>
    isRecord(value) && SAFE_TX_KEYS.every((key) => key in value)

  const getReactFiberNode = (element) => {
    const key = Object.keys(element).find(
      (entry) => entry.startsWith('__reactFiber$') || entry.startsWith('__reactContainer$'),
    )
    return key ? element[key] : null
  }

  const findSafeTxData = (value, seen = new Set(), depth = 0) => {
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

  const findDraftTransaction = () => {
    const candidates = document.querySelectorAll(UI_ANCHOR_SELECTORS.join(', '))
    for (const element of candidates) {
      let fiber = getReactFiberNode(element)
      let hops = 0
      while (fiber && hops < 40) {
        const raw =
          findSafeTxData(fiber.memoizedProps) ??
          findSafeTxData(fiber.pendingProps) ??
          findSafeTxData(fiber.memoizedState)
        if (raw) return raw
        fiber = fiber.return ?? null
        hops += 1
      }
    }

    return null
  }

  const getEthereum = () => {
    if (window.ethereum && typeof window.ethereum.request === 'function') {
      return window.ethereum
    }
    throw new Error('No injected wallet provider found on the Safe page')
  }

  const ensureChain = async (ethereum, chainIdHex) => {
    const currentChainId = await ethereum.request({ method: 'eth_chainId' })
    if (currentChainId === chainIdHex) return

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      })
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
      throw new Error(`Failed to switch wallet to consensus chain ${chainIdHex}: ${message}`)
    }
  }

  const submitProposal = async (payload) => {
    const ethereum = getEthereum()
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
    const from = Array.isArray(accounts) ? accounts[0] : undefined
    if (!from) throw new Error('No wallet account available for proposal submission')

    await ensureChain(ethereum, payload.chainIdHex)

    return ethereum.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from,
          to: payload.to,
          data: payload.data,
        },
      ],
    })
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== CONTENT_SOURCE) {
      return
    }

    if (data.type === PAGE_BRIDGE_REQUEST) {
      window.postMessage(
        {
          source: PAGE_BRIDGE_SOURCE,
          type: PAGE_BRIDGE_RESPONSE,
          requestId: data.requestId,
          payload: findDraftTransaction(),
        },
        window.location.origin,
      )
      return
    }

    if (data.type === PAGE_BRIDGE_SUBMIT_REQUEST) {
      submitProposal(data.payload)
        .then((txHash) => {
          window.postMessage(
            {
              source: PAGE_BRIDGE_SOURCE,
              type: PAGE_BRIDGE_SUBMIT_RESPONSE,
              requestId: data.requestId,
              payload: { txHash },
            },
            window.location.origin,
          )
        })
        .catch((error) => {
          const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
          window.postMessage(
            {
              source: PAGE_BRIDGE_SOURCE,
              type: PAGE_BRIDGE_SUBMIT_RESPONSE,
              requestId: data.requestId,
              payload: { error: message },
            },
            window.location.origin,
          )
        })
    }
  })
})()
