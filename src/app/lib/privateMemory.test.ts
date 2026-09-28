// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { clearPrivateMemory, privateMemory, purgePrivateBrowserCaches, setPrivateMemoryIdentity } from "./privateMemory";
import { readContractsCache, writeContractsCache, writeContractsViewState, readContractsViewState } from "../smlouvy/contractsPageStorage";
import { writePersistedHomeCache, readPersistedHomeCache } from "../home/homeCacheStorage";
import type { ContractsCache, ContractsViewState } from "../smlouvy/contractsPageTypes";
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); clearPrivateMemory(); setPrivateMemoryIdentity("a"); });
describe("sensitive browser cache minimization", () => {
  it("keeps contract data and search terms out of both storage areas", () => {
    const cache = { userEmail: "a@example.test", savedAt: Date.now(), position: null, myContracts: [{ id: "1", clientName: "Sensitive Client" }], teamContracts: [] } as ContractsCache;
    writeContractsCache(cache);
    expect(readContractsCache("a@example.test")).toEqual(cache);
    expect(readContractsCache("b@example.test")).toBeNull();
    const state = { searchText: "Sensitive Client", selectedSubordinates: ["private@example.test"] } as Omit<ContractsViewState, "userEmail">;
    writeContractsViewState("a@example.test", state);
    expect(readContractsViewState("a@example.test")?.searchText).toBe("Sensitive Client");
    writePersistedHomeCache("a", { sensitive: "private commissions" });
    expect(readPersistedHomeCache("a")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    setPrivateMemoryIdentity("b");
    expect(readContractsCache("a@example.test")).toBeNull();
  });
  it("removes old caches without deleting unrelated preferences or encrypted drafts", () => {
    for (const store of [localStorage, sessionStorage]) {
      for (const key of ["contracts_cache_v3", "contracts_view_state_v1:a", "home.cache:a", "tvorba.footerProfile:a"]) store.setItem(key, "legacy-secret");
      store.setItem("font-theme", "keep"); store.setItem("bohemika:private:v1:a:projection", "ciphertext");
    }
    purgePrivateBrowserCaches();
    for (const store of [localStorage, sessionStorage]) {
      expect(store.length).toBe(2);
      expect(store.getItem("font-theme")).toBe("keep");
      expect(store.getItem("bohemika:private:v1:a:projection")).toBe("ciphertext");
    }
    privateMemory.setItem("test", "temporary"); clearPrivateMemory();
    expect(privateMemory.getItem("test")).toBeNull();
  });
});
