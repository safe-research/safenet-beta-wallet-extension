import { UI_IDS } from "./constants";
import {
  isModuleTransaction,
  loadSafeTransactionFromService,
  lookupProposal,
  submitProposal,
} from "./safenet";
import { getSettings } from "./storage";
import type {
  ExtensionSettings,
  ProposalLookupResult,
  ProposalStatus,
  SafeTransactionPayload,
} from "./types";

let lastAutoRunKey: string | null = null;

function getCurrentSafeTxHashFromUrl(): `0x${string}` | null {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("id");
  if (!id) return null;

  // Direct 32-byte hash: ?id=0x<64 hex chars>
  if (id.startsWith("0x") && id.length === 66) {
    return id as `0x${string}`;
  }

  // Safe Wallet format: multisig_<safeAddress>_<safeTxHash>
  // e.g. multisig_0xSAFE_0xSAFETXHASH
  const lastPart = id.split("_").at(-1);
  if (lastPart?.startsWith("0x") && lastPart.length === 66) {
    return lastPart as `0x${string}`;
  }

  return null;
}

const CHAIN_PREFIX_MAP: Record<string, bigint> = {
  eth: 1n,
  matic: 137n,
  oeth: 10n,
  arb1: 42161n,
  sep: 11155111n,
  base: 8453n,
  gno: 100n,
  bnb: 56n,
  avax: 43114n,
  celo: 42220n,
  zkevm: 1101n,
  zksync: 324n,
  scroll: 534352n,
  aurora: 1313161554n,
};

function getChainIdFromUrl(): bigint {
  const url = new URL(window.location.href);
  const safeParam = url.searchParams.get("safe");
  if (!safeParam) return 11155111n;
  const prefix = safeParam.split(":")[0];
  return CHAIN_PREFIX_MAP[prefix] ?? 11155111n;
}

async function resolveTransaction(): Promise<{
  payload: SafeTransactionPayload;
  safeTxHash: `0x${string}`;
} | null> {
  const urlHash = getCurrentSafeTxHashFromUrl();
  const chainId = getChainIdFromUrl();

  if (urlHash) {
    const payload = await loadSafeTransactionFromService(chainId, urlHash);
    if (payload) return { payload, safeTxHash: urlHash };
  }

  // Draft transactions (no URL hash) cannot be reliably resolved without
  // deeper Safe Wallet integration. Return null to show a clear message.
  return null;
}

async function waitForTransaction(
  maxWait = 10000,
  interval = 500,
): Promise<{ payload: SafeTransactionPayload; safeTxHash: `0x${string}` } | null> {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const resolved = await resolveTransaction();
    if (resolved) return resolved;
    await new Promise<void>((r) => setTimeout(r, interval));
  }
  return null;
}

function ensureUi() {
  let container = document.getElementById(UI_IDS.container);
  if (container) return container;

  container = document.createElement("div");
  container.id = UI_IDS.container;
  container.style.position = "fixed";
  container.style.right = "16px";
  container.style.bottom = "16px";
  container.style.zIndex = "999999";
  container.style.padding = "12px";
  container.style.background = "#111827";
  container.style.color = "#fff";
  container.style.borderRadius = "12px";
  container.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
  container.style.minWidth = "300px";

  const title = document.createElement("div");
  title.textContent = "Safenet Beta";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";

  const button = document.createElement("button");
  button.id = UI_IDS.button;
  button.textContent = "Run check";
  button.style.width = "100%";
  button.style.padding = "8px 10px";
  button.style.border = "none";
  button.style.borderRadius = "8px";
  button.style.cursor = "pointer";
  button.style.background = "#10b981";
  button.style.color = "#04130d";

  const status = document.createElement("div");
  status.id = UI_IDS.status;
  status.textContent = "Idle";
  status.style.marginTop = "8px";
  status.style.fontSize = "14px";

  container.append(title, button, status);
  document.body.appendChild(container);
  return container;
}

function setStatus(status: ProposalStatus, message: string, link?: string) {
  const statusEl = document.getElementById(UI_IDS.status);
  const button = document.getElementById(
    UI_IDS.button,
  ) as HTMLButtonElement | null;
  if (!statusEl) return;

  statusEl.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = message;
  text.style.color =
    status === "passed"
      ? "#34d399"
      : status === "failed"
        ? "#f87171"
        : status === "unsupported"
          ? "#fbbf24"
          : "#f9fafb";
  statusEl.appendChild(text);

  if (link) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.textContent = " Open explorer";
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.style.color = "#93c5fd";
    statusEl.appendChild(anchor);
  }

  if (button) button.disabled = status === "loading";
}

async function pollForAttestation(
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
  chainId: bigint,
  safe: `0x${string}`,
  maxWait = 15000,
  interval = 4000,
): Promise<ProposalLookupResult> {
  const deadline = Date.now() + maxWait;
  let last: ProposalLookupResult = { exists: false, attested: false };
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, interval));
    last = await lookupProposal(settings, safeTxHash, chainId, safe);
    if (last.attested) return last;
  }
  return last;
}

async function runCheck(mode: "manual" | "auto" = "manual") {
  const settings = await getSettings();
  const resolved = await resolveTransaction();
  if (!resolved) {
    if (mode === "manual") {
      setStatus("failed", "No transaction found on this page");
    }
    return;
  }

  const { payload, safeTxHash } = resolved;
  if (isModuleTransaction(payload)) {
    setStatus("unsupported", "Module transactions are not supported");
    return;
  }

  const dedupeKey = `${payload.chainId}:${safeTxHash}`;
  if (mode === "auto" && lastAutoRunKey === dedupeKey) return;
  if (mode === "auto") lastAutoRunKey = dedupeKey;

  setStatus("loading", "Checking Safenet Beta...");

  try {
    const existing = await lookupProposal(
      settings,
      safeTxHash,
      payload.chainId,
      payload.safe,
    );
    if (existing.attested) {
      setStatus("passed", "Passed", existing.explorerUrl);
      return;
    }
    if (existing.exists) {
      // Already proposed but not yet attested - poll for attestation
      setStatus("loading", "Proposed, waiting for attestation...");
      const result = await pollForAttestation(
        settings,
        safeTxHash,
        payload.chainId,
        payload.safe,
      );
      setStatus(
        result.attested ? "passed" : "failed",
        result.attested ? "Passed" : "failed check",
        result.explorerUrl,
      );
      return;
    }

    // No proposal found - submit, then poll
    await submitProposal(settings, payload);
    setStatus("loading", "Submitted, waiting for attestation...");
    const afterSubmit = await pollForAttestation(
      settings,
      safeTxHash,
      payload.chainId,
      payload.safe,
    );
    setStatus(
      afterSubmit.attested ? "passed" : "failed",
      afterSubmit.attested ? "Passed" : "failed check",
      afterSubmit.explorerUrl,
    );
  } catch (err) {
    console.error("[Safenet Beta] Check failed:", err);
    setStatus("failed", "Check error - see console");
  }
}

async function init() {
  ensureUi();
  const button = document.getElementById(UI_IDS.button);
  button?.addEventListener("click", () => {
    void runCheck("manual");
  });

  const settings = await getSettings();
  if (settings.autoRun) {
    void (async () => {
      const resolved = await waitForTransaction();
      if (resolved) void runCheck("auto");
    })();
  }
}

let lastHref = window.location.href;
setInterval(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    lastAutoRunKey = null;
    void init();
  }
}, 1000);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init(), {
    once: true,
  });
} else {
  void init();
}
