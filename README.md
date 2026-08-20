# Safenet Beta Wallet Extension

> **Warning: This is a prototype. Code has not been audited. Use at your own risk.**

Browser extension that adds Safenet Beta and Safenet Q3 checks to Safe Wallet transaction flows.

## Download

The latest build from `main` is always available as a GitHub Release:

**[Download safenet-beta-extension.zip](https://github.com/safe-research/safenet-beta-wallet-extension/releases/latest/download/safenet-beta-extension.zip)**

## Current scope

- Two independent inline check widgets on Safe Wallet review and confirm screens: Safenet Beta (Gnosis Chain) and Safenet Q3 (Ethereum Sepolia), stacked one below the other
- Proposal lookup by SafeTxHash; submits via relayer if not yet proposed
- Beta polls Gnosis Chain for `TransactionProposed` and `TransactionAttested` events; Q3 polls Sepolia for the same events plus the Sentinel Oracle's review conclusion
- Explorer link shown as soon as the on-chain proposal tx is confirmed
- Popup settings for consensus contract address, RPC endpoint, and relayer URL — independent per network
- Chrome, Brave, and Firefox support

## Development

```bash
npm install
npm run build
```

## Load in browser

### Chrome / Brave

1. Run `npm run build`
2. Open `chrome://extensions` or `brave://extensions`
3. Enable Developer Mode
4. Load unpacked → select the `dist/` directory

### Firefox

1. Run `npm run build`
2. Open `about:debugging` → This Firefox
3. Load Temporary Add-on → select `dist/manifest.json`

### Installing from the downloaded zip

Extract the zip - `manifest.json` will be at the root of the extracted folder.
Load that folder directly (Chrome/Brave) or select `manifest.json` from it (Firefox).

## Widget behavior

Both widgets appear inline below the SafeShield row on review and confirm screens, Q3 stacked directly below Beta. Each has its own independent Run button, settings, and poll loop.

### Safenet Beta

| State | What you see |
|---|---|
| Idle | `↻ Safenet Beta` + **Run** button |
| After clicking Run | **Running...** (disabled) + "Polling..." |
| TransactionProposed seen | "Submitted" + **View ↗** explorer link |
| TransactionAttested seen | `✓` "Attested" + **View ↗** (green) |
| Proposed but timed out | `✗` "Failed to attest" + **View ↗** (red) + **Run** |
| Never proposed | `!` "Failed to submit" (yellow) + **Run** |

### Safenet Q3

Q3 adds a sentinel-review step between submission and validator attestation:

| State | What you see |
|---|---|
| Idle | `↻ Safenet Q3` + **Run** button |
| After clicking Run | **Running...** (disabled) + "Polling..." |
| TransactionProposed seen | "Submitted" + **View ↗** explorer link |
| Sentinels reviewing | **Running...** (disabled) + "Sentinels reviewing" (violet) |
| Sentinels approved | **Running...** (disabled) + "Sentinels approved" |
| TransactionAttested seen | `✓` "Attested" + **View ↗** (green) |
| Rejected by sentinels | `✗` "Rejected by sentinels" + **View ↗** (red) + **Run** |
| Attested but sentinel review never concluded within the poll window | `✗` "Failed to attest" + **View ↗** (red) + **Run** |
| Never proposed | `!` "Failed to submit" (yellow) + **Run** |

## Settings

The popup exposes independent settings for each network:

- Consensus contract address
- RPC endpoint (Gnosis Chain for Beta, Ethereum Sepolia for Q3)
- Relayer URL
- Sentinel Oracle contract address (Q3 only)
