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

- SafeTxHash logic should stay aligned with Safenet explorer behavior.
- Proposal lookup should prefer the explorer pattern: check consensus logs by SafeTxHash before submitting.
- User-facing failure text for missing attestation should remain exactly `failed check` unless product requirements change.
- Supported transaction scope for v1 is any Safe transaction except module transactions.
- Configuration overrides live in the popup, not a separate options surface.

## When editing this repo

- Prefer small, reviewable commits.
- Preserve browser-extension compatibility across Chrome, Brave, and Firefox.
- If you change manifest structure or build output paths, verify `npm run build` and extension loading assumptions in README.
- If you improve Safe Wallet DOM integration, document the exact selectors or runtime assumptions in the PR or README.
