# Test Case Reference

**58 automated tests across 4 files:** [`src/safenet.test.ts`](../src/safenet.test.ts) (18 tests, Safenet Beta), [`src/safenet-q3.test.ts`](../src/safenet-q3.test.ts) (13 tests, Safenet Q3), [`src/content-helpers.test.ts`](../src/content-helpers.test.ts) (18 tests), [`src/storage.test.ts`](../src/storage.test.ts) (9 tests). The automated suite covers core transaction hashing, relayer calls, on-chain lookups (for both networks' ABIs), URL/DOM parsing, dual-widget mounting, and per-network settings persistence. End-to-end browser behaviour and interactions with the live Safe Wallet UI require manual QA - see the "Not covered / manual QA" notes throughout.

This document covers all automated test cases in the project. It is intended for:
- **QA engineers** who want to understand what is already covered and what requires manual verification
- **Developers** who want a quick orientation to each module's behaviour and edge cases

Tests are written with [Vitest](https://vitest.dev/) and live alongside source files as `*.test.ts`.

---

## Module: `safenet.ts`

Core logic for hashing Safe transactions, submitting them to the Safenet relayer, and reading attestation state from the consensus contract on Gnosis Chain.

---

### `settings schema` (1 test)

Validates that the Zod schema used for extension settings accepts the built-in default values without throwing.

- Default settings (hardcoded in `constants.ts`) parse successfully through the schema.

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

### `submitProposal` (1 test)

Verifies the extension calls the relayer with the correct payload when proposing a transaction.

- Confirms the extension sends the transaction to the configured `relayerUrl` with the right HTTP method and content type, ensuring the relayer receives exactly what it needs to process the proposal.

**Not covered / manual QA:** Relayer error responses (4xx/5xx); network failures; serialisation of BigInt fields in the JSON body.

---

### `explorerUrl` (1 test)

Builds a URL pointing to the Safenet explorer for a given chain and safe tx hash.

- Produces the correct explorer URL format: `https://explorer.safenet-beta.eth.limo/#/safeTx?chainId=<id>&safeTxHash=<hash>`.

---

### `isModuleTransaction` (3 tests)

Identifies whether a transaction is a module-initiated transaction based on the `operation` field. Module transactions (operation = 2) are not supported by the extension and are filtered out.

- `operation: 0` (regular call) returns `false`.
- `operation: 1` (delegatecall) returns `false`.
- `operation: 2` (module transaction) returns `true`.

**Not covered / manual QA:** Handling of `operation` values outside 0-2 (e.g., negative numbers or very large integers from malformed API responses).

---

### `loadSafeTransactionFromService` (4 tests)

Fetches a Safe transaction from the Safe Transaction Service REST API and normalises it into the internal `SafeTransactionPayload` shape (with BigInt fields for numeric values).

- Returns `null` when the HTTP response is not OK (e.g., 404 or 500).
- Returns `null` when required fields (`to`, `value`, `nonce`, etc.) are missing from the response body.
- Parses the **flat response format**: all transaction fields are top-level properties on the response object (`to`, `value`, `data`, `operation`, ...). Numeric string fields are converted to `BigInt`.
- Parses the **nested txInfo/txData response format**: transaction fields are split between a `txInfo` object (contains `safeAddress`) and a `txData` object (contains `to.value`, `dataHex`, `value`, etc.). This is the shape returned by the newer Safe Transaction Service `/transactions` endpoint.

**Not covered / manual QA:** Partial responses where only some nested fields exist; network timeouts; non-JSON response bodies; chains other than Sepolia (1n) and Gnosis Chain (100n).

---

### `lookupProposal` (4 tests)

Queries Gnosis Chain for `TransactionProposed` and `TransactionAttested` events emitted by the consensus contract, given a `safeTxHash`.

- Returns `{ exists: false, attested: false, explorerUrl: undefined }` when no matching logs are found on-chain.
- Passes `fromBlock: CONSENSUS_DEPLOYMENT_BLOCK` to `eth_getLogs` so the query always starts from the block the consensus contract was deployed (avoids scanning the entire chain history).
- Returns `exists: true, attested: false` when a log decodes as `TransactionProposed` but no attestation log is present. Also includes an `explorerUrl` containing the safe tx hash.
- Returns `attested: true` when a log decodes as `TransactionAttested` (even if decoding as `TransactionProposed` throws first - the decoder tries both event signatures per log).

**Not covered / manual QA:** RPC connection failures; logs from unrelated contracts leaking through the filter; a transaction that has both proposal and attestation logs present at the same time; very large log sets.

---

## Module: `safenet-q3.ts`

Q3-specific logic mirroring `safenet.ts`, but against the newer, ABI-incompatible Q3 Consensus contract on Ethereum Sepolia, plus correlating a proposed transaction to its Sentinel Oracle review outcome.

---

### `explorerUrlQ3` (1 test)

Builds a URL pointing to the Q3 Safenet explorer for a given chain and safe tx hash.

- Produces the correct explorer URL format: `https://www.safe.dev/safenet/#/safeTx?chainId=<id>&safeTxHash=<hash>`.

---

### `lookupProposalQ3` (4 tests)

Queries Ethereum Sepolia for `TransactionProposed` and `TransactionAttested` events emitted by the Q3 consensus contract, given a `safeTxHash`.

- Returns `{ exists: false, attested: false, explorerUrl: undefined }` when no matching logs are found on-chain.
- Filters `eth_getLogs` on `topics: [null, safeTxHash]` only, with no third topic — unlike Beta's ABI, Q3's indexed `safeId`/`oracle` params are intentionally not filtered on, since `safeTxHash` alone is already a unique 32-byte hash.
- Returns `exists: true, attested: false` when a log decodes as `TransactionProposed` but no attestation log is present.
- Returns `attested: true` when a log decodes as `TransactionAttested` (even if decoding as `TransactionProposed` throws first).

**Not covered / manual QA:** RPC connection failures; logs from unrelated contracts leaking through the filter; very large log sets.

---

### `getSentinelRequestId` (3 tests)

Reads the Sentinel Oracle's `requestId` off the same transaction receipt that emitted `TransactionProposed`, by finding the `NewRequest` log emitted by the Sentinel Oracle's address in that receipt — this avoids reimplementing Consensus's internal EIP-712-style `requestId` hash client-side.

- Returns `null` when the transaction has no receipt.
- Returns `null` when no log in the receipt decodes as `NewRequest`, and ignores a `NewRequest`-shaped log emitted by an address other than the configured Sentinel Oracle.
- Returns the `requestId` from a `NewRequest` log at the Sentinel Oracle's address.

**Not covered / manual QA:** A receipt containing multiple `NewRequest` logs (e.g., from other in-flight requests) — the current implementation returns the first match.

---

### `checkOracleResult` (4 tests)

Polls the Sentinel Oracle for an `OracleResult` event matching a given `requestId`, to determine whether sentinels have approved or denied a proposed transaction.

- Returns `{ concluded: false }` when no matching logs are found (sentinels haven't concluded yet — could still be committing/revealing, disputed, or timed out without ever emitting a result).
- Passes `fromBlock: Q3_SENTINEL_ORACLE_DEPLOYMENT_BLOCK` and filters `topics: [null, requestId]`.
- Returns `{ concluded: true, approved: true }` / `{ concluded: true, approved: false }` on an approving/denying `OracleResult`.

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

### `ensureUi` and `removeUi` (7 tests)

Manages the extension's status widgets in the DOM. `ensureUi` takes a `NetworkConfig` (defaulting to Beta) and creates that network's widget on first call, returning it on subsequent calls without duplicating it. `removeUi` removes only the targeted network's widget.

- Calling `ensureUi` twice returns the exact same DOM element and leaves only one widget in the document. The widget contains a "Run" button, a `↻` icon element, and an empty status element.
- When the Safe Shield widget (`[data-testid="safe-shield-widget"]`) is present, the extension widget is inserted immediately after it (as the next sibling) and given `position: relative` styling.
- `removeUi` removes the widget from the DOM so that `getElementById` returns `null` afterwards.
- Calling `ensureUi` with the Q3 network config creates a distinctly-labeled, distinctly-IDed widget from Beta's.
- Mounting order is stable regardless of call order: Q3's widget always ends up directly below Beta's — whether Beta mounts first (Q3 anchors after Beta's existing container) or Q3 mounts first (Q3 falls back to the raw anchor since Beta's container doesn't exist yet, then Beta's own mount inserts itself directly after the anchor, pushing Q3 below it).
- `removeUi(document, Q3_NETWORK)` removes only Q3's container, leaving Beta's intact.

**Not covered / manual QA:** Widget behaviour when Safe Shield widget is removed from the DOM after the extension widget has been mounted; accessibility of the widget (keyboard navigation, screen readers); visual appearance and CSS; three or more stacked networks (only two are currently defined).

---

## Module: `storage.ts`

Reads and writes extension settings using `browser.storage.local`. Settings are validated through the Zod schema on both read and write. `getSettings(networkId)`/`setSettings(settings, networkId)` default `networkId` to `'beta'`, resolving the storage key and defaults for that network from `NETWORKS_BY_ID`.

---

### `storage helpers` (5 tests, Beta / default network)

- **Stored value wins on merge:** When `browser.storage.local` contains valid settings with a custom `rpc` URL, `getSettings()` returns that custom URL rather than the default.
- **Falls back to defaults when empty:** When storage returns an empty object, `getSettings()` returns the built-in `DEFAULT_SETTINGS` values for all fields.
- **Validates on save:** Calling `setSettings()` with valid settings triggers exactly one `browser.storage.local.set` call.
- **Throws on invalid save:** Calling `setSettings()` with a `consensus` field that is not a valid Ethereum address throws an error and does not persist to storage.
- **Throws on corrupt stored data:** If the stored `rpc` field is not a valid URL (e.g., the value `"not-a-url"`), `getSettings()` throws rather than silently returning garbage data.

### `storage helpers > q3 network` (4 tests)

- **Reads/writes under the `safenet-q3-settings` key:** `getSettings('q3')`/`setSettings(settings, 'q3')` read from and write to a storage key entirely separate from Beta's.
- **Falls back to `Q3_DEFAULT_SETTINGS`** (not Beta's defaults) when storage is empty for the `q3` key.
- **Saving Q3 settings never touches the `safenet-beta-settings` key** — verified by inspecting the actual object passed to `browser.storage.local.set`.

**Not covered / manual QA:** Concurrent read/write races; storage quota exceeded errors; behaviour when `browser.storage.local` itself throws (e.g., in a restricted extension context); migration of settings from older extension versions with a different schema shape.
