// This log fires at module load time - if you see it, the content script is running.
console.log("[Safenet Beta] content script loaded");

import browser from "webextension-polyfill";
import { UI_IDS } from "./constants";
import {
  ensureUi,
  getChainIdFromUrl,
  getCurrentSafeTxHashFromUrl,
  getDraftTransactionFromPage,
  isReviewScreen,
  normalizeDraftTransactionData,
  removeUi,
} from "./content-helpers";
import {
  computeSafeTxHash,
  explorerUrl,
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

const PAGE_BRIDGE_SOURCE = "safenet-beta-page-bridge";
const CONTENT_SOURCE = "safenet-beta-content";
const PAGE_BRIDGE_REQUEST = "request-draft-tx";
const PAGE_BRIDGE_RESPONSE = "draft-tx-response";
const PAGE_BRIDGE_SCRIPT_ID = "safenet-beta-page-bridge-script";

const pendingDraftRequests = new Map<
  number,
  {
    resolve: (payload: SafeTransactionPayload | null) => void;
    timer: number;
  }
>();
let lastAutoRunKey: string | null = null;
let requestIdCounter = 0;
let pageBridgeReady = false;
let pageBridgePromise: Promise<void> | null = null;
let initScheduled = false;

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as {
    source?: string;
    type?: string;
    requestId?: number;
    payload?: unknown;
  };
  if (data.source !== PAGE_BRIDGE_SOURCE) {
    return;
  }

  const requestId = data.requestId;
  if (typeof requestId !== "number") return;

  if (data.type === PAGE_BRIDGE_RESPONSE) {
    const pending = pendingDraftRequests.get(requestId);
    if (!pending) return;

    window.clearTimeout(pending.timer);
    pendingDraftRequests.delete(requestId);
    pending.resolve(normalizeDraftTransactionData(data.payload, window.location.href));
    return;
  }

});

function ensurePageBridgeInjected(): Promise<void> {
  if (pageBridgeReady) return Promise.resolve();
  if (pageBridgePromise) return pageBridgePromise;

  pageBridgePromise = new Promise((resolve) => {
    const existing = document.getElementById(PAGE_BRIDGE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      pageBridgeReady = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = PAGE_BRIDGE_SCRIPT_ID;
    script.src = browser.runtime.getURL("page-bridge.js");
    script.async = false;
    script.onload = () => {
      pageBridgeReady = true;
      script.remove();
      resolve();
    };
    script.onerror = () => {
      logErr("Failed to inject page bridge");
      script.remove();
      resolve();
    };
    (document.head ?? document.documentElement).appendChild(script);
  });

  return pageBridgePromise;
}

async function requestDraftTransactionFromPage(timeoutMs = 500): Promise<SafeTransactionPayload | null> {
  await ensurePageBridgeInjected();
  if (!pageBridgeReady) return null;

  return new Promise((resolve) => {
    const requestId = ++requestIdCounter;
    const timer = window.setTimeout(() => {
      pendingDraftRequests.delete(requestId);
      resolve(null);
    }, timeoutMs);

    pendingDraftRequests.set(requestId, { resolve, timer });
    window.postMessage(
      {
        source: CONTENT_SOURCE,
        type: PAGE_BRIDGE_REQUEST,
        requestId,
      },
      window.location.origin,
    );
  });
}

async function resolveTransaction(): Promise<{
  payload: SafeTransactionPayload;
  safeTxHash: `0x${string}`;
} | null> {
  const href = window.location.href;
  const urlHash = getCurrentSafeTxHashFromUrl(href);
  const chainId = getChainIdFromUrl(href);

  if (urlHash) {
    log("Loading tx from Safe service:", urlHash);
    const payload = await loadSafeTransactionFromService(chainId, urlHash);
    if (payload) {
      log("Tx loaded:", payload);
      return { payload, safeTxHash: urlHash };
    }
    log("Safe service returned null for hash:", urlHash);
  }

  const draftPayload =
    getDraftTransactionFromPage(document, href) ??
    (await requestDraftTransactionFromPage());
  if (draftPayload) {
    const safeTxHash = computeSafeTxHash(draftPayload);
    log("Draft tx recovered from Safe Wallet page:", { safeTxHash, payload: draftPayload });
    return { payload: draftPayload, safeTxHash };
  }

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
  if (!isReviewScreen(document)) {
    removeUi(document);
    return null;
  }
  return ensureUi(document);
}

function setStatus(status: ProposalStatus, message: string, link?: string) {
  log(`Status: ${status} — ${message}${link ? ` (${link})` : ""}`);
  ensurePageUi();
  const statusEl = document.getElementById(UI_IDS.status);
  const button = document.getElementById(
    UI_IDS.button,
  ) as HTMLButtonElement | null;
  if (!statusEl) return;

  statusEl.innerHTML = "";
  statusEl.setAttribute("data-status", status);
  // Keep a fixed subtle background; only the text color changes per status.
  statusEl.style.background = "rgba(255, 255, 255, 0.05)";
  statusEl.style.color =
    status === "passed"
      ? "#00B460"
      : status === "failed"
        ? "#FF5F52"
        : status === "unsupported"
          ? "#FFB547"
          : "rgba(255, 255, 255, 0.6)";

  const text = document.createElement("span");
  text.textContent = message;
  statusEl.appendChild(text);

  if (link) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.textContent = " Open explorer";
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.style.color = "#12FF80";
    anchor.style.fontWeight = "600";
    anchor.style.textDecoration = "underline";
    statusEl.appendChild(anchor);
  }

  if (button) button.disabled = status === "loading";
}

function gnosisscanTxUrl(txHash: `0x${string}`) {
  return `https://gnosisscan.io/tx/${txHash}` as const;
}

async function pollForAttestation(
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
  chainId: bigint,
  safe: `0x${string}`,
  /** Called once, the first time a Gnosis Chain tx hash is seen in the logs. */
  onFirstTxHash?: (txHash: `0x${string}`) => void,
  maxWait = 60000,
  interval = 4000,
): Promise<ProposalLookupResult> {
  const deadline = Date.now() + maxWait;
  let last: ProposalLookupResult = { exists: false, attested: false };
  let txHashReported = false;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, interval));
    log("Polling for attestation...");
    last = await lookupProposal(settings, safeTxHash, chainId, safe);
    log("Lookup result:", last);
    if (last.txHash) {
      log("Gnosis chain tx:", last.txHash, gnosisscanTxUrl(last.txHash));
      if (!txHashReported) {
        txHashReported = true;
        onFirstTxHash?.(last.txHash);
      }
    }
    if (last.attested) return last;
  }
  log("Attestation poll timed out");
  return last;
}

async function runCheck(mode: "manual" | "auto" = "manual") {
  log(`Running check (mode: ${mode})`);
  const settings = await getSettings();
  log("Settings:", settings);
  const resolved =
    (await resolveTransaction()) ??
    (mode === "manual" ? await waitForTransaction(3000, 250) : null);
  if (!resolved) {
    log("Could not resolve transaction");
    if (mode === "manual") {
      setStatus(
        "failed",
        "No transaction found yet. Open the Safe review step or wait for the draft transaction details to finish loading.",
      );
    }
    return;
  }

  const { payload, safeTxHash } = resolved;
  const explorer = explorerUrl(payload.chainId, safeTxHash);
  log("Resolved tx:", { safeTxHash, explorer, payload });

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

  // No link yet — we only show the explorer once we have confirmed an on-chain tx.
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
    if (existing.txHash) {
      log("Gnosis chain tx:", existing.txHash, gnosisscanTxUrl(existing.txHash));
    }

    if (existing.attested) {
      setStatus("passed", "Passed", existing.explorerUrl ?? explorer);
      return;
    }
    if (existing.exists) {
      // Proposal is on-chain — show explorer link immediately (txHash confirms it).
      setStatus(
        "loading",
        "Proposed, waiting for attestation...",
        existing.txHash ? explorer : undefined,
      );
      const result = await pollForAttestation(
        settings,
        safeTxHash,
        payload.chainId,
        payload.safe,
        (txHash) => {
          log("Gnosis chain proposal tx:", txHash, gnosisscanTxUrl(txHash));
          // tx is now confirmed on-chain; show explorer link if not shown yet
          setStatus("loading", "Proposed, waiting for attestation...", explorer);
        },
      );
      setStatus(
        result.attested ? "passed" : "failed",
        result.attested ? "Passed" : "failed check",
        result.explorerUrl ?? explorer,
      );
      return;
    }

    // No proposal found — submit via relayer, then poll.
    log("Safe tx data used for submit:", payload);
    log("Safe tx hash used for submit:", safeTxHash);
    log("Submitting proposal via relayer:", settings.relayerUrl);
    await submitProposal(settings, payload);
    log("Proposal submitted via relayer");
    // No link yet — relayer doesn't return a tx hash. The callback adds the
    // explorer link as soon as eth_getLogs sees the TransactionProposed event.
    setStatus("loading", "Submitted, waiting for attestation...");
    const afterSubmit = await pollForAttestation(
      settings,
      safeTxHash,
      payload.chainId,
      payload.safe,
      (txHash) => {
        log("Gnosis chain proposal tx:", txHash, gnosisscanTxUrl(txHash));
        setStatus("loading", "Submitted, waiting for attestation...", explorer);
      },
    );
    setStatus(
      afterSubmit.attested ? "passed" : "failed",
      afterSubmit.attested ? "Passed" : "failed check",
      afterSubmit.explorerUrl ?? explorer,
    );
  } catch (err) {
    logErr("Check failed:", err);
    setStatus("failed", "Check error - see console");
  }
}

function scheduleInit(delay = 150) {
  if (initScheduled) return;
  initScheduled = true;
  window.setTimeout(() => {
    initScheduled = false;
    void init();
  }, delay);
}

async function init() {
  log("Initialising on", window.location.href);
  void ensurePageBridgeInjected();
  if (!ensurePageUi()) {
    log("Not on Safe review screen, hiding UI");
    return;
  }
  const button = document.getElementById(UI_IDS.button) as HTMLButtonElement | null;
  // Use onclick assignment instead of addEventListener to avoid accumulating
  // duplicate handlers across SPA navigations when the UI element persists.
  if (button) button.onclick = () => void runCheck("manual");
}

let lastHref = window.location.href;
setInterval(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    lastAutoRunKey = null;
    scheduleInit(0);
  }
}, 1000);

const observer = new MutationObserver(() => {
  if (isReviewScreen(document) || document.getElementById(UI_IDS.container)) {
    scheduleInit();
  }
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => scheduleInit(0), {
    once: true,
  });
} else {
  scheduleInit(0);
}
