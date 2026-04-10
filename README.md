# Safenet Beta Wallet Extension

> **Warning: This is a prototype. Code has not been audited. Use at your own risk.**

Browser extension that adds a Safenet Beta check to Safe Wallet transaction flows.

## Download

The latest build from `main` is always available as a GitHub Release:

**[Download safenet-beta-extension.zip](https://github.com/safe-research/safenet-beta-wallet-extension/releases/latest/download/safenet-beta-extension.zip)**

## Current scope

- Manual Safenet Beta check from Safe Wallet pages
- Optional auto-run once transaction details are available
- Proposal lookup by SafeTxHash before submission
- Popup settings for consensus contract, RPC endpoint, relayer URL, and auto-run
- Chrome, Brave, and Firefox target support

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

## Settings

The popup exposes:

- Consensus contract
- RPC endpoint
- Relayer URL
- Auto-run once transaction details are available

## Notes

This repo currently contains an initial implementation scaffold. Depending on the exact Safe Wallet DOM and API integration points, selectors and transaction extraction may need refinement against the live app.
