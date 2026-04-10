# Safenet Beta Wallet Extension

> **Warning: This is a prototype. Code has not been audited. Use at your own risk.**

Browser extension that adds a Safenet Beta check to Safe Wallet transaction flows.

## Download

The latest build from `main` is always available as a GitHub Release:

**[Download safenet-beta-extension.zip](https://github.com/safe-research/safenet-beta-wallet-extension/releases/latest/download/safenet-beta-extension.zip)**

## Current scope

- Inline Safenet Beta check widget on Safe Wallet review and confirm screens
- Proposal lookup by SafeTxHash; submits via relayer if not yet proposed
- Polls Gnosis Chain for `TransactionProposed` and `TransactionAttested` events
- Explorer link shown as soon as the on-chain proposal tx is confirmed
- Popup settings for consensus contract address, RPC endpoint, and relayer URL
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

The widget appears inline below the SafeShield row on review and confirm screens:

| State | What you see |
|---|---|
| Idle | `↻ Safenet Beta` + **Run** button |
| After clicking Run | **Running...** (disabled) + "Polling..." |
| TransactionProposed seen | "Submitted" + **View ↗** explorer link |
| TransactionAttested seen | `✓` "Attested" + **View ↗** (green) |
| Proposed but timed out | `✗` "Failed to attest" + **View ↗** (red) + **Run** |
| Never proposed | `!` "Failed to submit" (yellow) + **Run** |

## Settings

The popup exposes:

- Consensus contract address
- RPC endpoint (Gnosis Chain)
- Relayer URL
