# AGENTS.md

## Repo purpose

This repository contains the Safenet Aegis Wallet Extension, a browser extension that adds Safenet Aegis checks into Safe Wallet transaction flows. Safenet Aegis runs on Gnosis Chain with two deployments (testnet and prod), selectable as presets in the popup. (Safenet Beta was shut down and removed; the former "Safenet Q3" Sepolia deployment became Aegis.)

## Developer workflow

- Install dependencies with `npm install`.
- Build with `npx tsc -b && npx vite build && node scripts/postbuild.mjs`.
- The unpacked extension artifact is the `dist/` directory.
- Chrome and Brave should load `dist/` as an unpacked extension.
- Firefox should load `dist/manifest.json` as a temporary add-on.

## Important implementation notes

- SafeTxHash logic must stay aligned with the Safenet explorer and consensus contract behavior.
- Proposal lookup always runs first (check consensus logs by SafeTxHash); only submit via relayer if not yet proposed.
- The widget is mounted inline, not as a floating overlay, on two kinds of screens (`isWidgetScreen` in `content-helpers.ts`):
  - Review/confirm screens, detected via `[data-testid="continue-sign-btn"]` and `[data-testid="sign-btn"]` (not the new-transaction form): mounted below the SafeShield widget.
  - The tx details page (`/transactions/tx` with a safeTxHash in `id`; not the queue/history lists, which render the same components for expanded rows), detected via `[data-testid="reject-btn"]` or the audit log `[data-testid="transaction-actions-list"]`: mounted directly above the Confirm/Execute + Reject row. Only Reject has a test id; each button is wrapped in a `Track` element (`data-track`), so the row is the nearest ancestor of Reject containing 2+ buttons. If Reject is the only action it mounts directly above Reject; with no actions (executed tx) it mounts below the audit log.
  - Review anchors take precedence, so opening Confirm from the details page moves the widget into the signing modal.
- On the details page the tx comes from the Safe client gateway (`loadSafeTransactionFromService`). Its response splits the SafeTx fields between `txData` (`to`, `value`, `operation`, `hexData`) and `detailedExecutionInfo` (`nonce`, gas fields, `gasToken`, `refundReceiver` as `{ value }`). `content.ts` only uses the loaded payload if it recomputes to the URL's safeTxHash, so a parsing drift can never submit a different transaction.
- Draft transaction data is extracted from the React fiber tree via `page-bridge.js` (injected into page context) and via direct fiber walking from known anchor elements. The `safenet-beta-*` page-bridge message ids are shared with `public/page-bridge.js` — keep both in sync if renaming.
- `src/constants.ts` holds `AEGIS_TESTNET_SETTINGS`/`AEGIS_PROD_SETTINGS` (`AEGIS_PRESETS`), `AEGIS_NETWORK` (storage key `safenet-aegis-settings`, widget DOM ids, settlement chain 100), and `AEGIS_LOGS_FROM_BLOCK` — the earliest of the four Aegis deployment blocks, used as `fromBlock` for every consensus/oracle `eth_getLogs` so it covers both presets. The `NETWORKS` array/`NetworkConfig` abstraction is kept with a single entry.
- Every per-deployment value is a user-editable setting (`ExtensionSettings`: `consensus`, `sentinelOracle`, `rpc`, `relayerUrl`, `explorerUrl`); nothing in `src/safenet-aegis.ts` hardcodes an address or explorer. Presets only fill the popup form; the user still clicks Save.
- `src/safenet.ts` holds network-agnostic helpers (`computeSafeTxHash`, `isModuleTransaction`, `loadSafeTransactionFromService`, `submitProposal`); Aegis event parsing and lookups live in `src/safenet-aegis.ts`. `submitProposal` also sends `consensus` and `sentinelOracle` so a relayer can route to the matching deployment.
- The Aegis `NewRequest` event includes `uint24 daoFeeShare` (see `safenet/contracts/src/libraries/SentinelOracleRequests.sol`). If the ABI drifts, `getSentinelRequestId` silently returns null and the sentinel step never shows.
- Status flow: Polling → Submitted → Sentinels reviewing (violet) → Sentinels approved → Attested (green) **or** Rejected by sentinels (red, terminal) **or** Failed to attest (red) **or** Failed to submit (yellow, retriable — the relayer accepted the request but no `TransactionProposed` appeared on the configured consensus, e.g. relayer targeting a different deployment). The sentinel conclusion is correlated to a safeTxHash by reading the `NewRequest` event's `requestId` off the same transaction receipt that emitted `TransactionProposed` (not by recomputing Consensus's internal EIP-712-style hash), then polling the Sentinel Oracle contract for `OracleResult` with that `requestId`.
- `pollForAttestationAegis` in `content.ts` runs two sequential, independently-timed poll phases: up to 120s waiting for the sentinels to reach a verdict, then — only once approved — up to an additional 120s waiting for the validator attestation. A denial short-circuits immediately.
- Explorer URLs: testnet `https://www.safe.dev/safenet/#/safeTx?chainId=...&safeTxHash=...`, prod `https://safenet-explorer.eth.limo/#/safeTx?chainId=...&safeTxHash=...`.
- Supported transaction scope: any Safe transaction except module transactions (operation != 0 and != 1).
- Configuration lives in the popup, not a separate options surface.

## When editing this repo

- Prefer small, reviewable commits.
- Preserve browser-extension compatibility across Chrome, Brave, and Firefox.
- If you change manifest structure or build output paths, verify `npm run build` and extension loading assumptions in README.
- If you improve Safe Wallet DOM integration, document the exact selectors or runtime assumptions in the PR or README.
