import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearContractTerminationPrefills,
  clearLegacyContractTerminationPrefills,
  getContractTerminationContext,
  isContractTerminationContextCurrent,
  setContractTerminationIdentity,
} from "./contractTerminationPrivacy";
import { clearServerSession } from "./authSession";
import {
  consumeContractTerminationPrefill,
  normalizeContractTerminationPrefill,
  storeContractTerminationPrefill,
} from "@/app/pomucky/vypoved-smlouvy/contractTerminationPrefill";

class MemoryStorage {
  private entries = new Map<string, string>();
  get length() { return this.entries.size; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  getItem = vi.fn((key: string) => this.entries.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => { this.entries.set(key, value); });
  removeItem(key: string) { this.entries.delete(key); }
}

const prefix = "bohemika:contract-termination-prefill:";
const payload = normalizeContractTerminationPrefill({
  sourcePath: "/smlouvy/synthetic-contract",
  contractNumber: "SYNTHETIC-001", policyholderName: "Synthetic Client",
  personalId: "SYNTHETIC-ID", address: "Synthetic address",
  phone: "Synthetic phone", email: "client@example.test",
  insurer: "Allianz", insuranceType: "nonLife", reason: "periodEnd",
})!;
let browser: { localStorage: MemoryStorage; sessionStorage: MemoryStorage; crypto: Crypto };

beforeEach(() => {
  vi.useFakeTimers();
  browser = { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), crypto: globalThis.crypto };
  vi.stubGlobal("window", browser);
  setContractTerminationIdentity(null);
  setContractTerminationIdentity("advisor-a");
});
afterEach(() => {
  setContractTerminationIdentity(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("private termination handoff", () => {
  it("passes all fields once without writing browser storage", () => {
    const owner = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, owner);
    expect(key).toBeTruthy();
    expect(browser.localStorage.setItem).not.toHaveBeenCalled();
    expect(browser.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(consumeContractTerminationPrefill(key, owner)).toEqual(payload);
    expect(consumeContractTerminationPrefill(key, owner)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("physically discards unused data when its timer expires", () => {
    const owner = getContractTerminationContext()!;
    const start = Date.now();
    const key = storeContractTerminationPrefill(payload, owner);
    vi.advanceTimersByTime(30 * 60_000);
    // Returning the clock cannot resurrect a payload that was already released.
    vi.setSystemTime(start);
    expect(consumeContractTerminationPrefill(key, owner)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects expired data even if a background tab has not executed its timer", () => {
    const owner = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, owner);
    vi.setSystemTime(Date.now() + 30 * 60_000);
    expect(consumeContractTerminationPrefill(key, owner)).toBeNull();
  });

  it("retains only the newest handoff and does not consume it for an unknown key", () => {
    const owner = getContractTerminationContext()!;
    const previous = storeContractTerminationPrefill(payload, owner);
    const latest = storeContractTerminationPrefill({ ...payload, contractNumber: "SYNTHETIC-002" }, owner);
    expect(consumeContractTerminationPrefill(previous, owner)).toBeNull();
    expect(consumeContractTerminationPrefill("unknown", owner)).toBeNull();
    expect(consumeContractTerminationPrefill(latest, owner)?.contractNumber).toBe("SYNTHETIC-002");
  });

  it.each(["advisor-b", null])("discards the previous account's transfer on identity change to %s", (uid) => {
    const previous = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, previous);
    setContractTerminationIdentity(uid);
    expect(consumeContractTerminationPrefill(key, previous)).toBeNull();
    expect(storeContractTerminationPrefill(payload, previous)).toBeNull();
    expect(isContractTerminationContextCurrent(previous)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("invalidates transfers when an administrator switches the represented account", () => {
    const previous = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, previous);
    setContractTerminationIdentity("advisor-a", "represented@example.test");
    expect(consumeContractTerminationPrefill(key, getContractTerminationContext()!)).toBeNull();
    expect(storeContractTerminationPrefill(payload, previous)).toBeNull();
  });

  it("preserves a transfer on an ordinary auth notification for the same identity", () => {
    const owner = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, owner);
    setContractTerminationIdentity("advisor-a");
    expect(getContractTerminationContext()).toBe(owner);
    expect(consumeContractTerminationPrefill(key, owner)).toEqual(payload);
  });

  it("does not accept a reconstructed owner or a receipt from a previous login of the same account", async () => {
    const previous = getContractTerminationContext()!;
    expect(storeContractTerminationPrefill(payload, { ...previous })).toBeNull();
    const delayedPdf = Promise.withResolvers<typeof payload>();
    const lateWrite = delayedPdf.promise.then((data) => storeContractTerminationPrefill(data, previous));
    clearContractTerminationPrefills();
    setContractTerminationIdentity(null);
    setContractTerminationIdentity("advisor-a");
    delayedPdf.resolve(payload);
    expect(await lateWrite).toBeNull();
    expect(getContractTerminationContext()).not.toBe(previous);
    expect(browser.sessionStorage.length).toBe(0);
  });

  it.each(["success", "offline", "server-error"])("cleans before the logout request (%s)", async (outcome) => {
    const owner = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, owner);
    browser.sessionStorage.setItem(`${prefix}old`, "synthetic legacy data");
    vi.stubGlobal("fetch", vi.fn(async () => {
      expect(browser.sessionStorage.getItem(`${prefix}old`)).toBeNull();
      expect(consumeContractTerminationPrefill(key, owner)).toBeNull();
      expect(storeContractTerminationPrefill(payload, owner)).toBeNull();
      if (outcome === "offline") throw new Error("Synthetic offline error");
      return new Response("{}", { status: outcome === "server-error" ? 503 : 200 });
    }));
    if (outcome === "success") await clearServerSession();
    else await expect(clearServerSession()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
    // A failed logout does not prevent the still-signed-in user starting anew.
    expect(storeContractTerminationPrefill(payload, getContractTerminationContext()!)).toBeTruthy();
  });
});

describe("legacy termination cleanup", () => {
  it("removes only this exact prefix from both stores without reading any values", () => {
    for (const storage of [browser.sessionStorage, browser.localStorage]) {
      storage.setItem(`${prefix}one`, "synthetic private data");
      storage.setItem(`${prefix}two`, "malformed JSON");
      storage.setItem("firebase:authUser", "keep");
      storage.setItem("unrelated-contract-draft", "keep");
      storage.setItem("bohemika:contract-termination-prefill-preference", "keep");
    }
    clearLegacyContractTerminationPrefills();
    clearLegacyContractTerminationPrefills();
    for (const storage of [browser.sessionStorage, browser.localStorage]) {
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.length).toBe(3);
      expect(storage.getItem("firebase:authUser")).toBe("keep");
      expect(storage.getItem("unrelated-contract-draft")).toBe("keep");
    }
  });

  it.each(["sessionStorage", "localStorage"] as const)("keeps working when %s is blocked", (name) => {
    const other = name === "sessionStorage" ? browser.localStorage : browser.sessionStorage;
    other.setItem(`${prefix}old`, "synthetic private data");
    Object.defineProperty(browser, name, { get: () => { throw new Error("Storage denied"); } });
    expect(clearLegacyContractTerminationPrefills).not.toThrow();
    expect(other.length).toBe(0);
    const owner = getContractTerminationContext()!;
    const key = storeContractTerminationPrefill(payload, owner);
    expect(consumeContractTerminationPrefill(key, owner)).toEqual(payload);
  });

  it("is safe on the server and cannot store personal data there", () => {
    const owner = getContractTerminationContext()!;
    vi.stubGlobal("window", undefined);
    expect(clearLegacyContractTerminationPrefills).not.toThrow();
    expect(storeContractTerminationPrefill(payload, owner)).toBeNull();
  });
});
