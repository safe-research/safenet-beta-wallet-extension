# Safenet Aegis Wallet Extension

> **Warning: This is a prototype. Code has not been audited. Use at your own risk.**

Browser extension that adds Safenet Aegis checks to Safe Wallet transaction flows. (Safenet Beta has been shut down; Safenet Q3 is now Safenet Aegis.)

## Download

The latest build from `main` is always available as a GitHub Release:

**[Download safenet-aegis-extension.zip](https://github.com/safe-research/safenet-beta-wallet-extension/releases/latest/download/safenet-aegis-extension.zip)**

## Current scope

- An inline Safenet Aegis check widget on Safe Wallet review and confirm screens, and on the transaction details page
- Proposal lookup by SafeTxHash; submits via relayer if not yet proposed
- Polls Gnosis Chain for `TransactionProposed` and `TransactionAttested` events on the Aegis Consensus contract, plus the Sentinel Oracle's review conclusion
- Explorer link shown as soon as the on-chain proposal tx is confirmed
- Popup settings with one-click testnet / prod presets; every field stays manually editable
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

The widget appears inline:

- **Review and confirm screens:** below the SafeShield row.
- **Transaction details page** (`/transactions/tx?id=multisig_<safe>_<safeTxHash>`): in the audit-log column, directly above the Confirm/Execute + Reject buttons. For executed transactions, which have no buttons, it sits below the audit log. The transaction is loaded from the Safe client gateway using the safeTxHash in the URL.

Opening Confirm from the details page moves the widget into the signing modal, and it returns when the modal closes.

The check has a sentinel-review step between submission and validator attestation:

| State | What you see |
|---|---|
| Idle | `↻ Safenet Aegis` + **Run** button |
| After clicking Run | **Running...** (disabled) + "Polling..." |
| TransactionProposed seen | "Submitted" + **View ↗** explorer link |
| Sentinels reviewing | **Running...** (disabled) + "Sentinels reviewing" (violet) |
| Sentinels approved | **Running...** (disabled) + "Sentinels approved" |
| TransactionAttested seen | `✓` "Attested" + **View ↗** (green) |
| Rejected by sentinels | `✗` "Rejected by sentinels" + **View ↗** (red) |
| Proposed, but no sentinel verdict or attestation within the poll window | `✗` "Failed to attest" + **View ↗** (red) |
| Relayer accepted the request but no `TransactionProposed` appeared on the configured consensus | `!` "Failed to submit" (yellow) + **Run** |

## Settings

The popup has one Safenet Aegis section. **Load testnet defaults** and **Load prod defaults** fill in the form from a preset. Every field can still be edited by hand, and nothing is stored until you click **Save**. A hint shows whether the current values match a preset or are custom. Settings are stored under `safenet-aegis-settings`; when nothing is stored, the testnet preset applies.

| Field | Testnet | Prod |
|---|---|---|
| Consensus contract | [`0x73b4BDc3112Dfb86085cDD84f26Ab908B20A4A84`](https://gnosisscan.io/address/0x73b4BDc3112Dfb86085cDD84f26Ab908B20A4A84) | [`0xc855761D619f6002923507cE68B84d7689C2aa96`](https://gnosisscan.io/address/0xc855761D619f6002923507cE68B84d7689C2aa96) |
| Sentinel Oracle contract | [`0xB83c4b66e752D947c1F55fd703b7937e21e401E4`](https://gnosisscan.io/address/0xB83c4b66e752D947c1F55fd703b7937e21e401E4) | [`0x4F61B8832978e83b80D69551AEf07557DBE41d03`](https://gnosisscan.io/address/0x4F61B8832978e83b80D69551AEf07557DBE41d03) |
| RPC endpoint (Gnosis Chain) | `https://gnosis.gateway.tenderly.co` | same |
| Relayer URL | `https://safenet-proxy-v2.cc0x.workers.dev/tx` | same |
| Explorer URL | `https://www.safe.dev/safenet/#/safeTx` | `https://safenet-explorer.eth.limo/#/safeTx` |

Both deployments are on Gnosis Chain. The relayer submits `Consensus.proposeTransaction` from its own wallet, which pays the Sentinel Oracle fee in that deployment's fee token (testnet [`0x3b1cFcfa89A19F6CDf8995ee8AE35D7D585e7025`](https://gnosisscan.io/address/0x3b1cFcfa89A19F6CDf8995ee8AE35D7D585e7025), prod [`0x2a22F9c3b484c3629090FeED35F17Ff8F88f76F0`](https://gnosisscan.io/address/0x2a22F9c3b484c3629090FeED35F17Ff8F88f76F0)). The extension includes `consensus` and `sentinelOracle` in the relayer request body so a relayer can route to the matching deployment. Both presets point at the same relayer URL. Until the proxy validates and routes on these fields, submissions go to whichever deployment the proxy itself is configured for, so the prod preset is not yet verified end to end.
