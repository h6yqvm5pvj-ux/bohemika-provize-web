import type { ContractTerminationPrefill } from "@/app/pomucky/vypoved-smlouvy/contractTerminationPrefill";

const LEGACY_PREFIX = "bohemika:contract-termination-prefill:";
const MAX_AGE_MS = 30 * 60 * 1000;

export type ContractTerminationContext = Readonly<{
  uid: string;
  impersonatedEmail: string;
  generation: number;
}>;

let generation = 0;
let context: ContractTerminationContext | null = null;
let pending: {
  key: string;
  context: ContractTerminationContext;
  expiresAtMs: number;
  payload: ContractTerminationPrefill;
} | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function isLegacyContractTerminationPrefillKey(key: string | null): boolean {
  return key?.startsWith(LEGACY_PREFIX) === true;
}

// Retire old copies without reading their personal data or assigning an owner.
export function clearLegacyContractTerminationPrefills(): void {
  if (typeof window === "undefined") return;
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      const storage = window[name];
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (isLegacyContractTerminationPrefillKey(key)) storage.removeItem(key!);
      }
    } catch {
      // Storage can be blocked. New transfers use only memory.
    }
  }
}

function discardPending(): void {
  pending = null;
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  expiryTimer = null;
}

export function getContractTerminationContext(): ContractTerminationContext | null {
  return context;
}

export function subscribeContractTerminationContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearContractTerminationPrefills(): void {
  clearLegacyContractTerminationPrefills();
  discardPending();
  // Keep a still-authenticated account usable if the logout request is offline,
  // but invalidate every receipt and remount any already filled form.
  context = context ? Object.freeze({ ...context, generation: ++generation }) : null;
  listeners.forEach((listener) => listener());
}

export function setContractTerminationIdentity(uid: string | null, impersonatedEmail = ""): void {
  clearLegacyContractTerminationPrefills();
  if (typeof window === "undefined") return;
  const email = impersonatedEmail.trim().toLowerCase();
  if (uid && context?.uid === uid && context.impersonatedEmail === email) return;
  discardPending();
  // A fresh object also invalidates async work from an earlier login of this UID.
  context = uid ? Object.freeze({ uid, impersonatedEmail: email, generation: ++generation }) : null;
  listeners.forEach((listener) => listener());
}

export function isContractTerminationContextCurrent(candidate: ContractTerminationContext): boolean {
  return context !== null && context === candidate;
}

export function storePrivateContractTerminationPrefill(
  payload: ContractTerminationPrefill,
  owner: ContractTerminationContext,
): string | null {
  if (typeof window === "undefined" || !isContractTerminationContextCurrent(owner)) return null;
  clearLegacyContractTerminationPrefills();
  try {
    const key = window.crypto.randomUUID();
    discardPending();
    pending = { key, context: owner, expiresAtMs: Date.now() + MAX_AGE_MS, payload: { ...payload } };
    // Physically release unconsumed data even if no one tries to read it again.
    expiryTimer = setTimeout(discardPending, MAX_AGE_MS);
    return key;
  } catch {
    return null;
  }
}

export function consumePrivateContractTerminationPrefill(
  key: string | null,
  owner: ContractTerminationContext,
): ContractTerminationPrefill | null {
  if (!key || !pending || pending.key !== key) return null;
  const entry = pending;
  discardPending();
  if (!isContractTerminationContextCurrent(owner) || entry.context !== owner || entry.expiresAtMs <= Date.now()) {
    return null;
  }
  return entry.payload;
}
