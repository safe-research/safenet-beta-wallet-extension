# Test Case Reference

**68 automated tests across 4 files:** [`src/safenet.test.ts`](../src/safenet.test.ts) (19 tests, shared tx helpers), [`src/safenet-aegis.test.ts`](../src/safenet-aegis.test.ts) (18 tests, Safenet Aegis), [`src/content-helpers.test.ts`](../src/content-helpers.test.ts) (25 tests), [`src/storage.test.ts`](../src/storage.test.ts) (6 tests). The automated suite covers core transaction hashing, relayer calls, Aegis on-chain lookups, URL/DOM parsing, widget mounting (review screens and the tx details page), and settings persistence. End-to-end browser behaviour and interactions with the live Safe Wallet UI require manual QA - see the "Not covered / manual QA" notes throughout.

This document covers all automated test cases in the project. It is intended for:
- **QA engineers** who want to understand what is already covered and what requires manual verification
- **Developers** who want a quick orientation to each module's behaviour and edge cases

Tests are written with [Vitest](https://vitest.dev/) and live alongside source files as `*.test.ts`.

---

## Module: `safenet.ts`

Shared logic for hashing Safe transactions, loading them from the Safe client service, and submitting them to the Safenet relayer.

---

### `settings schema` (3 tests)

Validates the Zod schema used for extension settings.

- Both built-in presets (`AEGIS_TESTNET_SETTINGS`, `AEGIS_PROD_SETTINGS` in `constants.ts`) parse successfully and unchanged.
- Settings missing `sentinelOracle` or `explorerUrl` are rejected (both are required).

**Not covered / manual QA:** Schema rejection of invalid field combinations (e.g., mismatched chain and RPC). Covered for individual fields in `storage.test.ts`.

---

### `computeSafeTxHash` (4 tests)

Produces an EIP-712 typed-data hash for a Safe transaction. The hash is used as the canonical identifier when querying the consensus contract.

- Returns a 32-byte hex string (`0x` followed by 64 lowercase hex characters).
- Produces a specific known value for a fixed set of inputs - this acts as a regression guard against accidental changes to the hashing logic.
- Changing the nonce produces a different hash (nonce is part of the SafeTx struct).
- Changing the Safe address produces a different hash (the Safe address is the EIP-712 `verifyingContract`, so different Safes have isolated domain hashes).

**Not covered / manual QA:** Behaviour with very large `value` or `nonce` values; cross-chain hash isolation (same tx, different `chainId`).

---

### `submitProposal` (4 tests)

Verifies the extension calls the relayer with the correct payload when proposing a transaction.

- Confirms the extension sends the transaction to the configured `relayerUrl` with the right HTTP method and content type, ensuring the relayer receives exactly what it needs to process the proposal.
- Returns the relayer's response body for logging, or `null` if the body can't be read.
- Sends the configured `consensus` and `sentinelOracle` addresses alongside the Safe tx fields, so a relayer can route to the matching Aegis deployment (testnet or prod).

**Not covered / manual QA:** Relayer error responses (4xx/5xx); network failures; serialisation of BigInt fields in the JSON body.

---

### `isModuleTransaction` (3 tests)

Identifies whether a transaction is a module-initiated transaction based on the `operation` field. Module transactions (operation = 2) are not supported by the extension and are filtered out.

- `operation: 0` (regular call) returns `false`.
- `operation: 1` (delegatecall) returns `false`.
- `operation: 2` (module transaction) returns `true`.

**Not covered / manual QA:** Handling of `operation` values outside 0-2 (e.g., negative numbers or very large integers from malformed API responses).

---

### `loadSafeTransactionFromService` (5 tests)

Fetches a Safe transaction from the Safe Transaction Service REST API and normalises it into the internal `SafeTransactionPayload` shape (with BigInt fields for numeric values).

- Returns `null` when the HTTP response is not OK (e.g., 404 or 500).
- Returns `null` when required fields (`to`, `value`, `nonce`, etc.) are missing from the response body.
- Parses the **flat response format**: all transaction fields are top-level properties on the response object (`to`, `value`, `data`, `operation`, ...). Numeric string fields are converted to `BigInt`.
- Parses the **nested txInfo/txData response format**: transaction fields are split between a `txInfo` object (contains `safeAddress`) and a `txData` object (contains `to.value`, `dataHex`, `value`, etc.). This is the shape returned by the newer Safe Transaction Service `/transactions` endpoint.
- Parses the **current client-gateway shape**, using a trimmed real response (fixture `src/test/fixtures/safe-client-multisig-tx.json`). Here `to`/`value`/`operation`/`hexData` are in `txData`, and `nonce`, the gas fields, `gasToken` and `refundReceiver` (`{ value }`) are in `detailedExecutionInfo`. The parsed payload must recompute to the response's `safeTxHash`.

**Not covered / manual QA:** Partial responses where only some nested fields exist; network timeouts; non-JSON response bodies; chains other than Sepolia (1n) and Gnosis Chain (100n).

---

## Module: `safenet-aegis.ts`

Safenet Aegis logic: reading proposal/attestation state from the Aegis Consensus contract on Gnosis Chain, plus correlating a proposed transaction to its Sentinel Oracle review outcome. All addresses, the RPC and the explorer base come from the user's settings (testnet or prod preset, or custom).

---

### `explorerUrlAegis` (3 tests)

Builds a Safenet explorer URL for a given chain and safe tx hash from `settings.explorerUrl`.

- Testnet preset: `https://www.safe.dev/safenet/#/safeTx?chainId=<id>&safeTxHash=<hash>`.
- Prod preset: `https://safenet-explorer.eth.limo/#/safeTx?chainId=<id>&safeTxHash=<hash>`.
- A user-edited explorer URL is used as-is as the base.

---

### `lookupProposalAegis` (4 tests)

Queries Gnosis Chain for `TransactionProposed` and `TransactionAttested` events emitted by the configured Aegis consensus contract, given a `safeTxHash`.

- Returns `{ exists: false, attested: false, explorerUrl: undefined }` when no matching logs are found on-chain.
- Filters `eth_getLogs` on `topics: [null, safeTxHash]` only, with no third topic — the indexed `safeId`/`oracle` params are intentionally not filtered on, since `safeTxHash` alone is already a unique 32-byte hash.
- Returns `exists: true, attested: false` when a log decodes as `TransactionProposed` but no attestation log is present.
- Returns `attested: true` when a log decodes as `TransactionAttested` (even if decoding as `TransactionProposed` throws first).

**Not covered / manual QA:** RPC connection failures; logs from unrelated contracts leaking through the filter; very large log sets.

---

### `getSentinelRequestId` (6 tests)

Reads the Sentinel Oracle's `requestId` off the same transaction receipt that emitted `TransactionProposed`, by finding the `NewRequest` log emitted by the Sentinel Oracle's address in that receipt — this avoids reimplementing Consensus's internal EIP-712-style `requestId` hash client-side.

- Returns `null` when the transaction has no receipt.
- Returns `null` when no log in the receipt decodes as `NewRequest`, and ignores a `NewRequest`-shaped log emitted by an address other than the configured Sentinel Oracle.
- Returns the `requestId` from a `NewRequest` log at the Sentinel Oracle's address.
- Uses the `sentinelOracle` address from settings (a log at the preset address is ignored once a custom address is configured).
- Decodes a real ABI-encoded `NewRequest` log including the `uint24 daoFeeShare` field (regression guard: the pre-Aegis ABI lacked it, so the sentinel step silently never showed).

**Not covered / manual QA:** A receipt containing multiple `NewRequest` logs (e.g., from other in-flight requests) — the current implementation returns the first match.

---

### `checkOracleResult` (5 tests)

Polls the Sentinel Oracle for an `OracleResult` event matching a given `requestId`, to determine whether sentinels have approved or denied a proposed transaction.

- Returns `{ concluded: false }` when no matching logs are found (sentinels haven't concluded yet — could still be committing/revealing, disputed, or timed out without ever emitting a result).
- Passes `fromBlock: AEGIS_LOGS_FROM_BLOCK` and filters `topics: [null, requestId]`.
- Returns `{ concluded: true, approved: true }` / `{ concluded: true, approved: false }` on an approving/denying `OracleResult`.
- Queries the `sentinelOracle` address from settings.

**Not covered / manual QA:** A disputed request that later resolves via arbitration (`DisputeResolved`) rather than emitting a fresh `OracleResult`; a request that times out without any sentinels ever committing.

---

## Module: `content-helpers.ts`

Helpers used by the content script that runs inside `app.safe.global`. Responsible for reading state from the page URL and React component tree, detecting the transaction review screen, and managing the extension's status widget in the DOM.

---

### `getCurrentSafeTxHashFromUrl` (3 tests)

Extracts the `safeTxHash` from the current page URL. Safe Wallet encodes the hash in the `id` query parameter, either directly or prefixed with `multisig_<safeAddress>_`.

- Parses a bare hash directly in the `id` param (e.g., `?id=0xaaa...`).
- Parses the `multisig_<safe>_<safeTxHash>` compound format used by Safe Wallet (e.g., `?id=multisig_0x111..._0xbbb...`).
- Returns `null` for a missing `id` param or for an `id` value that does not contain a valid 32-byte hex hash.

---

### `getSafeAddressFromUrl` (2 tests)

Extracts the Safe address from the `safe` query parameter (format: `<chain-prefix>:<address>`).

- Parses the address from `?safe=gno:0x1111...` and returns just the `0x...` address portion.
- Returns `null` when the `safe` param is absent or when the address portion fails the checksum/format validation.

---

### `getChainIdFromUrl` (2 tests)

Maps the chain prefix from the `safe` query parameter to an EVM chain ID (returned as `BigInt`).

- Known prefixes map correctly: `eth` -> `1n`, `gno` -> `100n`, `base` -> `8453n`.
- Unknown or missing prefixes fall back to Sepolia (`11155111n`).

**Not covered / manual QA:** All other chains supported by Safe Wallet (e.g., `arb`, `matic`, `bnb`). On an unsupported chain, the extension will silently compute the wrong transaction hash (this is known behavior). QA should verify the extension is only used on supported chains (Ethereum mainnet, Gnosis Chain, Base, Sepolia).

---

### `getDraftTransactionFromPage` (1 test)

Simulates a Safe Wallet review page with transaction data embedded in the browser's React state, and verifies the extension correctly extracts and normalizes all transaction fields.

- Verifies that the function returns the correct `SafeTransactionPayload` with all numeric fields (`value`, `safeTxGas`, `baseGas`, `gasPrice`, `nonce`) converted to `BigInt`, `chainId` and `safe` resolved from the URL, and all address/data fields preserved as-is.

**Not covered / manual QA:** The extension reads transaction data from Safe Wallet's internal page state. If Safe Wallet updates its UI framework, the extension may stop reading data correctly — verify on the real Safe Wallet UI after Safe Wallet updates.

---

### `isReviewScreen` (3 tests)

Determines whether the DOM currently shows the Safe transaction review/sign step (as opposed to the new-transaction form or any other page). The extension only activates on this screen.

- Returns `true` when the `[data-testid="continue-sign-btn"]` or `[data-testid="sign-btn"]` element is present (`data-testid` are HTML markers Safe Wallet uses to identify its UI elements).
- Returns `false` when only `[data-testid="safe-shield-widget"]` is present. This element also appears on the new-transaction form, so its presence alone is not sufficient to identify the review screen.
- Returns `false` when neither element is present.

**Not covered / manual QA:** Safe Wallet UI changes that rename or remove `data-testid` attributes; the review screen for rejection transactions.

---

### `isTxDetailsPage` / `isWidgetScreen` (5 tests)

Detects the transaction details page (`/transactions/tx?id=multisig_<safe>_<safeTxHash>`), where the widget is also shown.

- Returns `true` when the URL is a details page with a safeTxHash and either `[data-testid="reject-btn"]` (queued tx) or the audit log `[data-testid="transaction-actions-list"]` (executed tx) has rendered. `isWidgetScreen` is `true` there too.
- Returns `false` while the details haven't rendered yet.
- Returns `false` on the queue list, even though expanded rows render the same buttons.
- Returns `false` when the `id` param has no safeTxHash.

**Not covered / manual QA:** The real Safe Wallet details page. The DOM in the tests mirrors `TxDetails`/`TxSigners` in safe-wallet-monorepo; verify placement visually after Safe Wallet updates.

---

### `ensureUi` and `removeUi` (4 tests)

Manages the extension's status widget in the DOM. `ensureUi` takes a `NetworkConfig` (defaulting to Aegis) and creates the widget on first call, returning it on subsequent calls without duplicating it. `removeUi` removes it.

- Calling `ensureUi` twice returns the exact same DOM element and leaves only one widget in the document. The widget contains a "Run" button, a `↻` icon element, and an empty status element.
- When the Safe Shield widget (`[data-testid="safe-shield-widget"]`) is present, the extension widget is inserted immediately after it (as the next sibling) and given `position: relative` styling.
- `removeUi` removes the widget from the DOM so that `getElementById` returns `null` afterwards.
- The widget is labeled "Safenet Aegis" and uses the `safenet-aegis-check-*` element ids.

### `ensureUi on the tx details page` (5 tests)

- Mounts directly above the Confirm/Reject row, inside the same column. The row is found as the nearest ancestor of `reject-btn` with 2+ buttons, since each button is wrapped in a `data-track` element.
- Stays in place on repeated calls; there is never more than one widget.
- When Reject is the only action, mounts directly above Reject's wrapper rather than above the whole column.
- With no actions (executed tx), mounts below the audit log.
- When the signing modal opens, moves below its Safe Shield widget. When the modal closes and unmounts it, it's recreated above the Confirm/Reject row.

**Not covered / manual QA:** Widget behaviour when Safe Shield widget is removed from the DOM after the extension widget has been mounted; accessibility of the widget (keyboard navigation, screen readers); visual appearance and CSS.

---

## Module: `storage.ts`

Reads and writes extension settings using `browser.storage.local`. Settings are validated through the Zod schema on both read and write. `getSettings(networkId)`/`setSettings(settings, networkId)` default `networkId` to `'aegis'`, resolving the storage key and defaults for that network from `NETWORKS_BY_ID`.

---

### `storage helpers` (6 tests)

- **Stored value wins on merge:** When `browser.storage.local` contains valid settings under `safenet-aegis-settings` with a custom `rpc` URL, `getSettings()` returns that custom URL rather than the default.
- **Falls back to testnet defaults when empty:** When storage returns an empty object, `getSettings()` returns `AEGIS_TESTNET_SETTINGS` for all fields.
- **Ignores the old `safenet-q3-settings` key:** stale Sepolia settings from the Q3 era never override the Aegis defaults.
- **Validates on save:** Calling `setSettings()` with valid settings triggers exactly one `browser.storage.local.set` call.
- **Throws on invalid save:** Calling `setSettings()` with a `consensus` field that is not a valid Ethereum address throws an error and does not persist to storage.
- **Throws on corrupt stored data:** If the stored `rpc` field is not a valid URL (e.g., the value `"not-a-url"`), `getSettings()` throws rather than silently returning garbage data.

**Not covered / manual QA:** Concurrent read/write races; storage quota exceeded errors; behaviour when `browser.storage.local` itself throws (e.g., in a restricted extension context); migration of settings from older extension versions with a different schema shape.
