# AGENTS.md

## Repo purpose

This repository contains the Safenet Beta Wallet Extension, a browser extension that adds a Safenet Beta check into Safe Wallet transaction flows.

## Developer workflow

- Install dependencies with `npm install`.
- Build with `npx tsc -b && npx vite build && node scripts/postbuild.mjs`.
- The unpacked extension artifact is the `dist/` directory.
- Chrome and Brave should load `dist/` as an unpacked extension.
- Firefox should load `dist/manifest.json` as a temporary add-on.

## Important implementation notes

- SafeTxHash logic must stay aligned with Safenet explorer and consensus contract behavior.
- Proposal lookup always runs first (check consensus logs by SafeTxHash); only submit via relayer if not yet proposed.
- Widget is an inline row below the SafeShield widget, not a floating overlay. It only renders on review/confirm screens detected via `[data-testid="continue-sign-btn"]` and `[data-testid="sign-btn"]` — not on the new-transaction form.
- Draft transaction data is extracted from the React fiber tree via `page-bridge.js` (injected into page context) and via direct fiber walking from known anchor elements.
- Status flow: Polling → Submitted (once TransactionProposed seen on-chain) → Attested (green) or Failed to attest (red, with explorer link) or Failed to submit (yellow, retriable).
- Explorer URL: `https://explorer.safenet-beta.eth.limo/#/safeTx?chainId=...&safeTxHash=...`
- Supported transaction scope: any Safe transaction except module transactions (operation != 0 and != 1).
- Configuration (consensus address, RPC, relayer URL) lives in the popup, not a separate options surface.

## When editing this repo

- Prefer small, reviewable commits.
- Preserve browser-extension compatibility across Chrome, Brave, and Firefox.
- If you change manifest structure or build output paths, verify `npm run build` and extension loading assumptions in README.
- If you improve Safe Wallet DOM integration, document the exact selectors or runtime assumptions in the PR or README.
