# AGENTS.md

## Repo purpose

This repository contains the Safenet Beta Wallet Extension, a browser extension that adds Safenet Beta and Safenet Q3 checks into Safe Wallet transaction flows. The two networks run independent, ABI-incompatible contract deployments (Beta on Gnosis Chain, Q3 on Ethereum Sepolia) and are surfaced as two separate, independently-driven widgets that can appear on the same review screen.

## Developer workflow

- Install dependencies with `npm install`.
- Build with `npx tsc -b && npx vite build && node scripts/postbuild.mjs`.
- The unpacked extension artifact is the `dist/` directory.
- Chrome and Brave should load `dist/` as an unpacked extension.
- Firefox should load `dist/manifest.json` as a temporary add-on.

## Important implementation notes

- SafeTxHash logic must stay aligned with each network's Safenet explorer and consensus contract behavior.
- Proposal lookup always runs first (check consensus logs by SafeTxHash); only submit via relayer if not yet proposed.
- Each network gets its own widget, mounted as an inline row below the SafeShield widget (Q3 stacks directly below Beta), not a floating overlay. Widgets only render on review/confirm screens detected via `[data-testid="continue-sign-btn"]` and `[data-testid="sign-btn"]` — not on the new-transaction form.
- Draft transaction data is extracted from the React fiber tree via `page-bridge.js` (injected into page context) and via direct fiber walking from known anchor elements. This resolution is shared — done once per check, then used by both networks' independent lookups.
- The `NetworkConfig`/`NETWORKS` abstraction (`src/constants.ts`, `src/types.ts`) holds everything that varies per network: storage key, default settings, consensus deployment block, explorer base URL, and widget DOM ids. Settings are stored under separate keys (`safenet-beta-settings`, `safenet-q3-settings`) via `getSettings(networkId)`/`setSettings(settings, networkId)` in `storage.ts`.
- Q3's Consensus contract is a newer, ABI-incompatible deployment from Beta's — different indexed event params (a packed `safeId` instead of separate `chainId`/`safe` topics). Q3-specific event parsing and lookups live in `src/safenet-q3.ts`, separate from Beta's `src/safenet.ts` (left untouched).
- The Sentinel Oracle address is a user-editable Q3 setting (`ExtensionSettings.sentinelOracle`), not a hardcoded constant — `getSentinelRequestId`/`checkOracleResult` in `safenet-q3.ts` read `settings.sentinelOracle`, falling back to the `Q3_SENTINEL_ORACLE` constant only if unset. Beta has no equivalent field.
- Beta status flow: Polling → Submitted (once TransactionProposed seen on-chain) → Attested (green) or Failed to attest (red, with explorer link) or Failed to submit (yellow, retriable).
- Q3 status flow adds a sentinel-review step before attestation: Polling → Submitted → Sentinels reviewing (violet) → Sentinels approved → Attested (green) **or** Rejected by sentinels (red, terminal) **or** Failed to attest (red) **or** Failed to submit (yellow). The sentinel conclusion is correlated to a safeTxHash by reading the `NewRequest` event's `requestId` off the same transaction receipt that emitted `TransactionProposed` (not by recomputing Consensus's internal EIP-712-style hash), then polling the Sentinel Oracle contract for `OracleResult` with that `requestId`.
- `pollForAttestationQ3` in `content.ts` runs two sequential, independently-timed poll phases: up to 120s waiting for the sentinels to reach a verdict, then — only once approved — up to an additional 120s waiting for the validator attestation. Either phase timing out (or a sentinel denial) surfaces as "Failed to attest" / "Rejected by sentinels" respectively; a denial short-circuits immediately rather than waiting out its phase's full timeout.
- Beta explorer URL: `https://explorer.safenet-beta.eth.limo/#/safeTx?chainId=...&safeTxHash=...`
- Q3 explorer URL: `https://www.safe.dev/safenet/#/safeTx?chainId=...&safeTxHash=...`
- Supported transaction scope: any Safe transaction except module transactions (operation != 0 and != 1).
- Configuration (consensus address, RPC, relayer URL, and — Q3 only — Sentinel Oracle address) for both networks lives in the popup, not a separate options surface — each network has its own independent settings section and Save action.

## When editing this repo

- Prefer small, reviewable commits.
- Preserve browser-extension compatibility across Chrome, Brave, and Firefox.
- If you change manifest structure or build output paths, verify `npm run build` and extension loading assumptions in README.
- If you improve Safe Wallet DOM integration, document the exact selectors or runtime assumptions in the PR or README.
