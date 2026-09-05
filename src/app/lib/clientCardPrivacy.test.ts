import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLegacyClientCards, installClientCardPrivacyCleanup } from "./clientCardPrivacy";
import { clearServerSession } from "./authSession";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem = vi.fn((key: string) => this.values.get(key) ?? null);
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const legacyKey = "bohemika.client-card.martin-brezina.v1";
function browser() {
  const target = Object.assign(new EventTarget(), {
    localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(),
  });
  vi.stubGlobal("window", target);
  return target;
}

afterEach(() => vi.unstubAllGlobals());

describe("legacy client card cleanup", () => {
  it("deletes only client card copies from both stores, without reading their values", () => {
    const target = browser();
    for (const storage of [target.localStorage, target.sessionStorage]) {
      storage.setItem(legacyKey, '{"birthNumber":"test"}');
      storage.setItem("bohemika.client-card.other.v1", "malformed JSON");
      storage.setItem("bohemika.client-card.other.v2", "future legacy copy");
      storage.setItem("contract-draft", "keep contract");
      storage.setItem("firebase:authUser", "keep auth");
      storage.setItem("bohemika.font-theme", "keep preference");
    }
    clearLegacyClientCards();
    clearLegacyClientCards();
    for (const storage of [target.localStorage, target.sessionStorage]) {
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.length).toBe(3);
      expect(storage.getItem(legacyKey)).toBeNull();
      expect(storage.getItem("contract-draft")).toBe("keep contract");
      expect(storage.getItem("firebase:authUser")).toBe("keep auth");
      expect(storage.getItem("bohemika.font-theme")).toBe("keep preference");
    }
  });

  it("cleans at startup, after an old tab writes, and when history restores the page", () => {
    const target = browser();
    target.localStorage.setItem(legacyKey, "initial");
    const uninstall = installClientCardPrivacyCleanup();
    expect(target.localStorage.getItem(legacyKey)).toBeNull();
    target.localStorage.setItem(legacyKey, "written by old tab");
    target.dispatchEvent(Object.assign(new Event("storage"), { key: legacyKey }));
    expect(target.localStorage.getItem(legacyKey)).toBeNull();
    target.sessionStorage.setItem(legacyKey, "history restore");
    target.dispatchEvent(new Event("pageshow"));
    expect(target.sessionStorage.getItem(legacyKey)).toBeNull();
    uninstall();
    target.localStorage.setItem(legacyKey, "after unmount");
    target.dispatchEvent(Object.assign(new Event("storage"), { key: legacyKey }));
    expect(target.localStorage.getItem(legacyKey)).toBe("after unmount");
  });

  it("still cleans session storage when local storage access is blocked", () => {
    const target = browser();
    target.sessionStorage.setItem(legacyKey, "test");
    Object.defineProperty(target, "localStorage", { get: () => { throw new Error("Storage denied"); } });
    expect(clearLegacyClientCards).not.toThrow();
    expect(target.sessionStorage.getItem(legacyKey)).toBeNull();
  });

  it("cleans before logout contacts the server, including an offline logout", async () => {
    const target = browser();
    target.localStorage.setItem(legacyKey, "test");
    const fetchMock = vi.fn(() => {
      expect(target.localStorage.getItem(legacyKey)).toBeNull();
      return Promise.reject(new Error("Offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(clearServerSession()).rejects.toThrow("Offline");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "DELETE" }));
  });

  it("is safe during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(clearLegacyClientCards).not.toThrow();
    expect(installClientCardPrivacyCleanup()).toBeTypeOf("function");
  });
});
