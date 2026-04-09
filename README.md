# Safenet Beta Wallet Extension

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
4. Load unpacked
5. Select the `dist/` directory

### Firefox

1. Run `npm run build`
2. Open `about:debugging`
3. Choose `This Firefox`
4. Load Temporary Add-on
5. Select `dist/manifest.json`

## Settings

The popup exposes:

- Consensus contract
- RPC endpoint
- Relayer URL
- Auto-run once transaction details are available

## Notes

This repo currently contains an initial implementation scaffold. Depending on the exact Safe Wallet DOM and API integration points, selectors and transaction extraction may need refinement against the live app.
