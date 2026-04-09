import { UI_IDS } from "./constants";
import {
  computeSafeTxHash,
  isModuleTransaction,
  loadSafeTransactionFromService,
  lookupProposal,
  submitProposal,
} from "./safenet";
import { getSettings } from "./storage";
import type { ProposalStatus, SafeTransactionPayload } from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
let lastAutoRunKey: string | null = null;

function getCurrentSafeTxHashFromUrl(): `0x${string}` | null {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("id");
  return id?.startsWith("0x") && id.length === 66
    ? (id as `0x${string}`)
    : null;
}

function getChainIdFromUrl(): bigint {
  const url = new URL(window.location.href);
  const safeParam = url.searchParams.get("safe");
  if (!safeParam) return 11155111n;
  const prefix = safeParam.split(":")[0];
  if (prefix === "sep") return 11155111n;
  if (prefix === "eth") return 1n;
  return 11155111n;
}

function readDraftTransactionFromDom(): SafeTransactionPayload | null {
  const rootText = document.body.innerText;
  const safeAddressMatch = rootText.match(/0x[a-fA-F0-9]{40}/g);
  if (!safeAddressMatch || safeAddressMatch.length < 2) return null;
  return {
    chainId: getChainIdFromUrl(),
    safe: safeAddressMatch[0] as `0x${string}`,
    to: safeAddressMatch[1] as `0x${string}`,
    value: 0n,
    data: "0x",
    operation: 0,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce: 0n,
  };
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

  const draft = readDraftTransactionFromDom();
  if (!draft) return null;
  return { payload: draft, safeTxHash: computeSafeTxHash(draft) };
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

async function runCheck(mode: "manual" | "auto" = "manual") {
  const settings = await getSettings();
  const resolved = await resolveTransaction();
  if (!resolved) {
    setStatus("failed", "Transaction details not available yet");
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
    if (existing.exists) {
      setStatus(
        existing.attested ? "passed" : "failed",
        existing.attested ? "Passed" : "failed check",
        existing.explorerUrl,
      );
      return;
    }

    await submitProposal(settings, payload);
    const afterSubmit = await lookupProposal(
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
  } catch {
    setStatus("failed", "failed check");
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
    setTimeout(() => {
      void runCheck("auto");
    }, 1500);
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
