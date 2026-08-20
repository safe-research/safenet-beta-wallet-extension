const EXPLORERS: Record<string, (txHash: `0x${string}`) => string> = {
  '1': (txHash) => `https://etherscan.io/tx/${txHash}`,
  '100': (txHash) => `https://gnosisscan.io/tx/${txHash}`,
  '11155111': (txHash) => `https://sepolia.etherscan.io/tx/${txHash}`,
}

/** Console-log-only convenience link to the raw settlement-chain tx (not the Safenet explorer). */
export function blockExplorerTxUrl(chainId: bigint, txHash: `0x${string}`): string | null {
  return EXPLORERS[chainId.toString()]?.(txHash) ?? null
}
