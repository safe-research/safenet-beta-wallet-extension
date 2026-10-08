// This log fires at module load time - if you see it, the content script is running.
console.log("[Safenet] content script loaded");

import browser from "webextension-polyfill";
import { AEGIS_NETWORK, NETWORKS } from "./constants";
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
  isModuleTransaction,
  loadSafeTransactionFromService,
  submitProposal,
} from "./safenet";
import {
  checkOracleResult,
  explorerUrlAegis,
  getSentinelRequestId,
  lookupProposalAegis,
} from "./safenet-aegis";
import { blockExplorerTxUrl } from "./block-explorer";
import { getSettings } from "./storage";
import type {
  ExtensionSettings,
  NetworkConfig,
  ProposalLookupResult,
  ProposalStatus,
  SafeTransactionPayload,
} from "./types";

const log = (...args: unknown[]) => console.log("[Safenet]", ...args);
const logErr = (...args: unknown[]) => console.error("[Safenet]", ...args);

type NetworkLogger = { log: (...args: unknown[]) => void; err: (...args: unknown[]) => void };

function networkLogger(network: NetworkConfig): NetworkLogger {
  return {
    log: (...args: unknown[]) => console.log(`[${network.label}]`, ...args),
    err: (...args: unknown[]) => console.error(`[${network.label}]`, ...args),
  };
}

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
const lastAutoRunKeys = new Map<NetworkConfig["id"], string>();
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

function ensurePageUi(network: NetworkConfig) {
  if (!isReviewScreen(document)) {
    removeUi(document, network);
    return null;
  }
  return ensureUi(document, network);
}

function setStatus(network: NetworkConfig, status: ProposalStatus, message: string, link?: string) {
  console.log(`[${network.label}] Status: ${status} — ${message}${link ? ` (${link})` : ""}`);
  ensurePageUi(network);
  const iconEl = document.getElementById(network.ui.icon);
  const statusEl = document.getElementById(network.ui.status);
  const button = document.getElementById(network.ui.button) as HTMLButtonElement | null;
  if (!statusEl) return;

  statusEl.innerHTML = "";
  statusEl.setAttribute("data-status", status);

  if (status === "loading") {
    if (iconEl) { iconEl.textContent = "↻"; iconEl.style.color = "rgba(255, 255, 255, 0.6)"; }
    if (button) { button.textContent = "Running..."; button.disabled = true; button.style.display = ""; button.style.opacity = "0.5"; button.style.cursor = "not-allowed"; }
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = message + " ↗";
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.style.color = "#12FF80";
      anchor.style.fontWeight = "600";
      anchor.style.textDecoration = "underline";
      statusEl.appendChild(anchor);
    } else {
      const text = document.createElement("span");
      text.textContent = message;
      text.style.color = "rgba(255, 255, 255, 0.6)";
      statusEl.appendChild(text);
    }
  } else if (status === "reviewing") {
    if (iconEl) { iconEl.textContent = "↻"; iconEl.style.color = "#8A7CFF"; }
    if (button) { button.textContent = "Running..."; button.disabled = true; button.style.display = ""; button.style.opacity = "0.5"; button.style.cursor = "not-allowed"; }
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = message + " ↗";
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.style.color = "#8A7CFF";
      anchor.style.fontWeight = "600";
      anchor.style.textDecoration = "underline";
      statusEl.appendChild(anchor);
    } else {
      const text = document.createElement("span");
      text.textContent = message;
      text.style.color = "#8A7CFF";
      statusEl.appendChild(text);
    }
  } else if (status === "passed") {
    if (iconEl) { iconEl.textContent = "✓"; iconEl.style.color = "#00B460"; }
    if (button) { button.style.display = "none"; }
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = message + " ↗";
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.style.color = "#00B460";
      anchor.style.fontWeight = "600";
      anchor.style.textDecoration = "underline";
      statusEl.appendChild(anchor);
    } else {
      const text = document.createElement("span");
      text.textContent = message;
      text.style.color = "#00B460";
      statusEl.appendChild(text);
    }
  } else if (status === "failed") {
    if (iconEl) { iconEl.textContent = "✗"; iconEl.style.color = "#FF5F52"; }
    if (button) { button.style.display = "none"; }
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = message + " ↗";
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.style.color = "#FF5F52";
      anchor.style.fontWeight = "600";
      anchor.style.textDecoration = "underline";
      statusEl.appendChild(anchor);
    } else {
      const text = document.createElement("span");
      text.textContent = message;
      text.style.color = "#FF5F52";
      statusEl.appendChild(text);
    }
  } else if (status === "warning") {
    if (iconEl) { iconEl.textContent = "!"; iconEl.style.color = "#FFB547"; }
    if (button) { button.textContent = "Run"; button.disabled = false; button.style.display = ""; button.style.opacity = "1"; button.style.cursor = "pointer"; }
    const text = document.createElement("span");
    text.textContent = message;
    text.style.color = "#FFB547";
    statusEl.appendChild(text);
  } else if (status === "unsupported") {
    if (iconEl) { iconEl.textContent = "!"; iconEl.style.color = "#FFB547"; }
    if (button) { button.style.display = "none"; }
    const text = document.createElement("span");
    text.textContent = message;
    text.style.color = "#FFB547";
    statusEl.appendChild(text);
  } else {
    // idle
    if (iconEl) { iconEl.textContent = "↻"; iconEl.style.color = "rgba(255, 255, 255, 0.6)"; }
    if (button) { button.textContent = "Run"; button.disabled = false; button.style.display = ""; button.style.opacity = "1"; button.style.cursor = "pointer"; }
  }
}

/**
 * Fills the widget's progress bar over `durationMs`, purely as a visual estimate of time-to-timeout.
 * Restarting it (calling this again) resets and re-triggers the fill from 0%, e.g. when moving
 * between poll phases with different durations.
 */
function startProgress(network: NetworkConfig, durationMs: number) {
  const track = document.getElementById(network.ui.progress) as HTMLDivElement | null;
  const fill = track?.firstElementChild as HTMLElement | null | undefined;
  if (!track || !fill) return;
  track.style.display = "block";
  fill.style.transition = "none";
  fill.style.width = "0%";
  void fill.offsetWidth; // force reflow so the transition below restarts from 0% cleanly
  fill.style.transition = `width ${durationMs}ms linear`;
  fill.style.width = "100%";
}

/** Hides the progress bar -- called as soon as the real result arrives, whether or not it's visually full yet. */
function stopProgress(network: NetworkConfig) {
  const track = document.getElementById(network.ui.progress) as HTMLDivElement | null;
  if (track) track.style.display = "none";
}

/** The sentinel-review conclusion, reported alongside the ongoing attestation poll. */
type SentinelStatus = "reviewing" | "approved" | "rejected";

async function pollForAttestationAegis(
  logger: NetworkLogger,
  network: NetworkConfig,
  settings: ExtensionSettings,
  safeTxHash: `0x${string}`,
  chainId: bigint,
  onFirstTxHash?: (txHash: `0x${string}`) => void,
  onSentinelStatus?: (status: SentinelStatus) => void,
  /** Time allowed for sentinels to reach a verdict (approve/deny), before attestation can even begin. */
  sentinelMaxWait = 120000,
  /** Additional time allowed for the validator attestation, counted from when sentinels approve. */
  attestationMaxWait = 120000,
  interval = 4000,
): Promise<ProposalLookupResult & { rejected: boolean }> {
  let last: ProposalLookupResult = { exists: false, attested: false };
  let txHashReported = false;
  // The proposal tx hash is needed to find the Sentinel Oracle's `NewRequest` log -- distinct from
  // `last.txHash`, which flips to the *attestation* tx hash once attested.
  let proposalTxHash: `0x${string}` | undefined;
  let requestId: `0x${string}` | null = null;
  let sentinelConcluded = false;

  // Phase 1: wait for sentinels to reach a verdict (or for attestation to appear outright, in the
  // rare case both happen within the same poll tick).
  const sentinelDeadline = Date.now() + sentinelMaxWait;
  startProgress(network, sentinelMaxWait);
  while (Date.now() < sentinelDeadline) {
    await new Promise<void>((r) => setTimeout(r, interval));
    logger.log(txHashReported ? "Polling for sentinel verdict..." : "Polling for proposal...");
    last = await lookupProposalAegis(settings, safeTxHash, chainId);
    logger.log("Lookup result:", last);

    if (last.txHash && !proposalTxHash && !last.attested) {
      proposalTxHash = last.txHash;
    }
    if (last.txHash && !txHashReported) {
      txHashReported = true;
      const link = blockExplorerTxUrl(AEGIS_NETWORK.settlementChainId, last.txHash);
      logger.log("Settlement chain tx:", last.txHash, link ?? "");
      onFirstTxHash?.(last.txHash);
    }

    if (last.attested) {
      stopProgress(network);
      return { ...last, rejected: false };
    }

    if (!requestId && proposalTxHash) {
      requestId = await getSentinelRequestId(settings, proposalTxHash);
    }
    if (requestId) {
      const sentinelResult = await checkOracleResult(settings, requestId);
      logger.log("Sentinel result:", sentinelResult);
      if (sentinelResult.concluded) {
        if (!sentinelResult.approved) {
          stopProgress(network);
          onSentinelStatus?.("rejected");
          return { ...last, rejected: true };
        }
        onSentinelStatus?.("approved");
        sentinelConcluded = true;
        break;
      }
      onSentinelStatus?.("reviewing");
    }
  }

  if (!sentinelConcluded) {
    stopProgress(network);
    logger.log("Sentinel verdict poll timed out");
    return { ...last, rejected: false };
  }

  // Phase 2: sentinels approved -- wait for the validator attestation, on its own timeout.
  const attestationDeadline = Date.now() + attestationMaxWait;
  startProgress(network, attestationMaxWait);
  while (Date.now() < attestationDeadline) {
    await new Promise<void>((r) => setTimeout(r, interval));
    logger.log("Polling for attestation...");
    last = await lookupProposalAegis(settings, safeTxHash, chainId);
    logger.log("Lookup result:", last);
    if (last.attested) {
      stopProgress(network);
      return { ...last, rejected: false };
    }
  }
  stopProgress(network);
  logger.log("Attestation poll timed out");
  return { ...last, rejected: false };
}

async function runAegisCheck(
  logger: NetworkLogger,
  network: NetworkConfig,
  settings: ExtensionSettings,
  payload: SafeTransactionPayload,
  safeTxHash: `0x${string}`,
) {
  const explorer = explorerUrlAegis(settings, payload.chainId, safeTxHash);
  logger.log("Resolved tx:", { safeTxHash, explorer, payload });

  const onFirstTxHash = () => setStatus(network, "loading", "Submitted", explorer);
  const onSentinelStatus = (status: SentinelStatus) => {
    if (status === "reviewing") setStatus(network, "reviewing", "Sentinels reviewing", explorer);
    if (status === "approved") setStatus(network, "loading", "Sentinels approved", explorer);
    // "rejected" is reported via the poll's return value (terminal), not here.
  };

  logger.log("Looking up existing proposal for", safeTxHash);
  const existing = await lookupProposalAegis(settings, safeTxHash, payload.chainId);
  logger.log("Existing proposal:", existing);
  if (existing.txHash) {
    const link = blockExplorerTxUrl(network.settlementChainId, existing.txHash);
    logger.log("Settlement chain tx:", existing.txHash, link ?? "");
  }

  if (existing.attested) {
    setStatus(network, "passed", "Attested", existing.explorerUrl ?? explorer);
    return;
  }
  if (existing.exists) {
    setStatus(network, "loading", "Submitted", existing.txHash ? explorer : undefined);
    const result = await pollForAttestationAegis(logger, network, settings, safeTxHash, payload.chainId, onFirstTxHash, onSentinelStatus);
    if (result.attested) {
      setStatus(network, "passed", "Attested", result.explorerUrl ?? explorer);
    } else if (result.rejected) {
      setStatus(network, "failed", "Rejected by sentinels", result.explorerUrl ?? explorer);
    } else {
      setStatus(network, "failed", "Failed to attest", result.explorerUrl ?? explorer);
    }
    return;
  }

  logger.log("Safe tx data used for submit:", payload);
  logger.log("Safe tx hash used for submit:", safeTxHash);
  logger.log("Submitting proposal via relayer:", settings.relayerUrl);
  const relayerResponse = await submitProposal(settings, payload);
  logger.log("Proposal submitted via relayer", relayerResponse ? { relayerResponse } : "");
  setStatus(network, "loading", "Polling...");
  const afterSubmit = await pollForAttestationAegis(logger, network, settings, safeTxHash, payload.chainId, onFirstTxHash, onSentinelStatus);
  if (afterSubmit.attested) {
    setStatus(network, "passed", "Attested", afterSubmit.explorerUrl ?? explorer);
  } else if (afterSubmit.rejected) {
    setStatus(network, "failed", "Rejected by sentinels", afterSubmit.explorerUrl ?? explorer);
  } else if (afterSubmit.txHash) {
    setStatus(network, "failed", "Failed to attest", afterSubmit.explorerUrl ?? explorer);
  } else {
    setStatus(network, "warning", "Failed to submit");
  }
}

async function runCheckOne(
  network: NetworkConfig,
  mode: "manual" | "auto",
  payload: SafeTransactionPayload,
  safeTxHash: `0x${string}`,
) {
  const logger = networkLogger(network);
  const dedupeKey = `${payload.chainId}:${safeTxHash}`;
  if (mode === "auto" && lastAutoRunKeys.get(network.id) === dedupeKey) {
    logger.log("Skipping duplicate auto-run for", dedupeKey);
    return;
  }
  if (mode === "auto") lastAutoRunKeys.set(network.id, dedupeKey);

  setStatus(network, "loading", "Polling...");

  try {
    const settings = await getSettings(network.id);
    logger.log("Settings:", settings);

    await runAegisCheck(logger, network, settings, payload, safeTxHash);
  } catch (err) {
    logger.err("Check failed:", err);
    setStatus(network, "failed", "Check error - see console");
  }
}

async function resolveAndRun(mode: "manual" | "auto", networks: readonly NetworkConfig[]) {
  log(`Running check (mode: ${mode}) for ${networks.map((n) => n.label).join(", ")}`);
  const resolved =
    (await resolveTransaction()) ??
    (mode === "manual" ? await waitForTransaction(3000, 250) : null);
  if (!resolved) {
    log("Could not resolve transaction");
    if (mode === "manual") {
      for (const network of networks) {
        setStatus(
          network,
          "failed",
          "No transaction found yet. Open the Safe review step or wait for the draft transaction details to finish loading.",
        );
      }
    }
    return;
  }

  const { payload, safeTxHash } = resolved;

  if (isModuleTransaction(payload)) {
    for (const network of networks) {
      setStatus(network, "unsupported", "Module transactions are not supported");
    }
    return;
  }

  await Promise.allSettled(networks.map((network) => runCheckOne(network, mode, payload, safeTxHash)));
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
  void ensurePageBridgeInjected();
  if (!isReviewScreen(document)) {
    log("Not on Safe review screen, hiding UI");
    for (const network of NETWORKS) removeUi(document, network);
    return;
  }

  for (const network of NETWORKS) {
    ensureUi(document, network);
    const button = document.getElementById(network.ui.button) as HTMLButtonElement | null;
    // Use onclick assignment instead of addEventListener to avoid accumulating
    // duplicate handlers across SPA navigations when the UI element persists.
    if (button) button.onclick = () => void resolveAndRun("manual", [network]);
  }
}

let lastHref = window.location.href;
setInterval(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    lastAutoRunKeys.clear();
    scheduleInit(0);
  }
}, 1000);

const observer = new MutationObserver((mutations) => {
  const containers = NETWORKS.map((n) => document.getElementById(n.ui.container)).filter(
    (el): el is HTMLElement => el !== null,
  );
  // Ignore mutations that originate from within our own UI to avoid log spam
  // while setStatus updates the DOM during polling.
  if (containers.length > 0 && mutations.every((m) => containers.some((c) => c.contains(m.target as Node)))) {
    return;
  }
  if (isReviewScreen(document) || containers.length > 0) {
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
