// This log fires at module load time - if you see it, the content script is running.
console.log("[Safenet Beta] content script loaded");

import { UI_IDS } from "./constants";
import { ensureUi, getChainIdFromUrl, getCurrentSafeTxHashFromUrl } from "./content-helpers";
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

const log = (...args: unknown[]) => console.log("[Safenet Beta]", ...args);
const logErr = (...args: unknown[]) => console.error("[Safenet Beta]", ...args);

let lastAutoRunKey: string | null = null;

async function resolveTransaction(): Promise<{
  payload: SafeTransactionPayload;
  safeTxHash: `0x${string}`;
} | null> {
  const urlHash = getCurrentSafeTxHashFromUrl(window.location.href);
  const chainId = getChainIdFromUrl(window.location.href);

  if (urlHash) {
    log("Loading tx from Safe service:", urlHash);
    const payload = await loadSafeTransactionFromService(chainId, urlHash);
    if (payload) {
      log("Tx loaded:", payload);
      return { payload, safeTxHash: urlHash };
    }
    log("Safe service returned null for hash:", urlHash);
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
    try {
      const resolved = await resolveTransaction();
      if (resolved) return resolved;
    } catch {
      // service not ready yet - keep polling
    }
    await new Promise<void>((r) => setTimeout(r, interval));
  }
  log("waitForTransaction timed out after", maxWait, "ms");
  return null;
}

function ensurePageUi() {
  return ensureUi(document)
}

function setStatus(status: ProposalStatus, message: string, link?: string) {
  log(`Status: ${status} — ${message}${link ? ` (${link})` : ""}`);
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
    log("Polling for attestation...");
    last = await lookupProposal(settings, safeTxHash, chainId, safe);
    log("Lookup result:", last);
    if (last.attested) return last;
  }
  log("Attestation poll timed out");
  return last;
}

async function runCheck(mode: "manual" | "auto" = "manual") {
  log(`Running check (mode: ${mode})`);
  const settings = await getSettings();
  log("Settings:", settings);
  const resolved = await resolveTransaction();
  if (!resolved) {
    log("Could not resolve transaction");
    if (mode === "manual") {
      setStatus("failed", "No transaction found on this page");
    }
    return;
  }

  const { payload, safeTxHash } = resolved;
  log("Resolved tx:", { safeTxHash, payload });

  if (isModuleTransaction(payload)) {
    setStatus("unsupported", "Module transactions are not supported");
    return;
  }

  const dedupeKey = `${payload.chainId}:${safeTxHash}`;
  if (mode === "auto" && lastAutoRunKey === dedupeKey) {
    log("Skipping duplicate auto-run for", dedupeKey);
    return;
  }
  if (mode === "auto") lastAutoRunKey = dedupeKey;

  setStatus("loading", "Checking Safenet Beta...");

  try {
    log("Looking up existing proposal for", safeTxHash);
    const existing = await lookupProposal(
      settings,
      safeTxHash,
      payload.chainId,
      payload.safe,
    );
    log("Existing proposal:", existing);

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
    log("Submitting proposal to relayer:", settings.relayerUrl);
    await submitProposal(settings, payload);
    log("Proposal submitted, polling for attestation");
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
    logErr("Check failed:", err);
    setStatus("failed", "Check error - see console");
  }
}

async function init() {
  log("Initialising on", window.location.href);
  ensurePageUi();
  const button = document.getElementById(UI_IDS.button) as HTMLButtonElement | null;
  // Use onclick assignment instead of addEventListener to avoid accumulating
  // duplicate handlers across SPA navigations when the UI element persists.
  if (button) button.onclick = () => void runCheck("manual");

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
