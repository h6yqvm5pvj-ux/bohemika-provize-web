// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../../scripts/cashflow-worker/fixtures";
import type { CashflowSnapshot } from "./computeCashflow";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { email: string; getIdToken: () => Promise<string> } },
}));
vi.mock("../firebase", () => ({ auth: mocks.auth }));
vi.mock("./generator", async (importOriginal) => {
  const original = await importOriginal<typeof import("./generator")>();
  return { ...original, generateCashflow: vi.fn(original.generateCashflow) };
});

import { generateCashflow } from "./generator";
import { useCashflowData } from "./useCashflowData";

type HookParams = Parameters<typeof useCashflowData>[0];
type HookResult = ReturnType<typeof useCashflowData>;
const asOf = new Date("2026-09-12T12:00:00.000Z");
let accountSequence = 0;

describe("actual cashflow data hook worker boundary", () => {
  let root: Root;
  let container: HTMLDivElement;
  let latest: HookResult;
  let email: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  const snapshots = new Map<string, CashflowSnapshot>();
  const gates = new Map<string, Promise<void>>();
  const failures = new Set<string>();

  function Probe(props: HookParams) {
    const result = useCashflowData(props);
    useEffect(() => { latest = result; }, [result]);
    return null;
  }

  function addAccount(count: number): string {
    // Unique identities prevent this test from depending on the hook's private cache.
    const nextEmail = `worker-hook-${++accountSequence}@example.test`;
    const snapshot = makeWorkerFixture(count, asOf).snapshot;
    const originalEmail = snapshot.email;
    snapshot.email = nextEmail;
    for (const entry of [...snapshot.ownEntries, ...snapshot.teamEntriesRaw]) {
      if (entry.userEmail === originalEmail) entry.userEmail = nextEmail;
      for (const override of entry.managerOverrides ?? []) {
        if (override.email === originalEmail) override.email = nextEmail;
      }
    }
    snapshots.set(nextEmail, snapshot);
    return nextEmail;
  }

  function signIn(account: string) {
    mocks.auth.currentUser = { email: account, getIdToken: async () => `synthetic:${account}` };
  }

  function pauseContracts(account: string): () => void {
    let resume!: () => void;
    gates.set(account, new Promise<void>((resolve) => { resume = resolve; }));
    return resume;
  }

  const render = (overrides: Partial<HookParams> = {}) => act(async () => {
    root.render(<Probe userEmail={email} scopeFilter="combined" productFilter="all" {...overrides} />);
  });
  const finishLoading = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const expectNoSnapshot = () => {
    expect(latest.rawSnapshot).toBeNull();
    expect(latest.calculationDeferred).toBe(false);
    expect(latest.cashflowItems).toEqual([]);
    expect(latest.verificationInput).toBeNull();
    expect(latest.hasTeam).toBe(false);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.clear();
    snapshots.clear();
    gates.clear();
    failures.clear();
    mocks.auth.currentUser = null;
    fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "https://synthetic.example.test");
      const token = new Headers(init?.headers).get("Authorization");
      const account = token?.replace(/^Bearer synthetic:/, "") ?? "";
      const snapshot = snapshots.get(account);
      if (!snapshot) throw new Error("Only authenticated synthetic fixtures are available.");
      if (url.pathname === "/api/tip-payouts/list") {
        return Response.json({ ok: true, payouts: snapshot.tipPayouts, hasMore: false });
      }
      if (url.pathname !== "/api/contracts/list") throw new Error("Unexpected request blocked by test.");
      await gates.get(account);
      if (failures.has(account)) return Response.json({ ok: false, error: "Synthetic source failure" }, { status: 500 });
      const scope = url.searchParams.get("scope");
      const rows = scope === "my" ? snapshot.ownEntries : snapshot.teamEntriesRaw;
      const cursor = Number(url.searchParams.get("cursor") ?? 0);
      const limit = Number(url.searchParams.get("limit"));
      const next = cursor + limit;
      return Response.json({
        ok: true,
        position: snapshot.myPosition,
        commissionMode: snapshot.myCommissionMode,
        hasTeam: snapshot.hasAnyTeam,
        contracts: rows.slice(cursor, next),
        totalCount: rows.length,
        hasMore: next < rows.length,
        nextCursorToken: next < rows.length ? String(next) : null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([[199, false], [200, true]] as const)(
    "counts both paginated own and team inputs at the %i-contract boundary",
    async (count, deferred) => {
      email = addAccount(count);
      signIn(email);
      await render({ deferCalculation: true });
      expect(latest.loading).toBe(true);
      expect(latest.ready).toBe(false);
      expectNoSnapshot();
      await finishLoading();
      expect(latest.loading).toBe(false);
      expect(latest.ready).toBe(true);
      const snapshot = latest.rawSnapshot!;
      expect(snapshot.ownEntries.length).toBe(150);
      expect(snapshot.teamEntriesRaw.length).toBe(count - 150);
      expect(snapshot.tipPayouts.length).toBeGreaterThan(0);
      expect(latest.calculationDeferred).toBe(deferred);
      expect(latest.cashflowItems.length > 0).toBe(!deferred);
      expect(Boolean(latest.verificationInput)).toBe(!deferred);
      expect(vi.mocked(generateCashflow).mock.calls.length > 0).toBe(!deferred);
      const contractUrls = fetchMock.mock.calls.map(([url]) => new URL(String(url), "https://synthetic.example.test"))
        .filter(url => url.pathname === "/api/contracts/list");
      expect(contractUrls).toHaveLength(2);
      expect(contractUrls.every(url => url.searchParams.get("limit") === "500")).toBe(true);
      expect(contractUrls.every(url => url.searchParams.get("shape") === "cashflow")).toBe(true);
    },
  );

  it("loads a full thousand-contract portfolio in three own/team requests without missing or duplicate entries", async () => {
    email = addAccount(1000);
    signIn(email);
    await render({ deferCalculation: true });
    await finishLoading();
    const expected = snapshots.get(email)!;
    const snapshot = latest.rawSnapshot!;
    const keys = (entries: CashflowSnapshot["ownEntries"]) => entries.map(entry => `${entry.userEmail}___${entry.id}`).sort();
    expect(keys(snapshot.ownEntries)).toEqual(keys(expected.ownEntries));
    expect(keys(snapshot.teamEntriesRaw)).toEqual(keys(expected.teamEntriesRaw));
    expect(new Set(keys([...snapshot.ownEntries, ...snapshot.teamEntriesRaw])).size).toBe(1000);
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url), "https://synthetic.example.test"))
      .filter(url => url.pathname === "/api/contracts/list");
    expect(urls).toHaveLength(3); // 750 own = 2 pages, 250 team = 1 page.
    expect(urls.filter(url => url.searchParams.get("scope") === "my")).toHaveLength(2);
    expect(urls.some(url => url.searchParams.get("cursor") === "500")).toBe(true);
    expect(urls.every(url => url.searchParams.get("limit") === "500")).toBe(true);
  });

  it("defaults to the original calculation and can toggle deferral without reloading data", async () => {
    email = addAccount(300);
    signIn(email);
    await render();
    await finishLoading();
    expect(latest.calculationDeferred).toBe(false);
    expect(latest.cashflowItems.length).toBeGreaterThan(300);
    expect(generateCashflow).toHaveBeenCalled();
    const referenceItems = latest.cashflowItems;
    const snapshot = latest.rawSnapshot;
    const requests = fetchMock.mock.calls.length;
    vi.mocked(generateCashflow).mockClear();
    await render({ deferCalculation: true });
    expect(latest.rawSnapshot).toBe(snapshot);
    expect(latest.calculationDeferred).toBe(true);
    expect(latest.cashflowItems).toEqual([]);
    expect(latest.verificationInput).toBeNull();
    expect(generateCashflow).not.toHaveBeenCalled();
    await render({ deferCalculation: false });
    expect(latest.calculationDeferred).toBe(false);
    expect(latest.cashflowItems).toEqual(referenceItems);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it("does not read or expose data while disabled and clears an already loaded deferred snapshot", async () => {
    email = addAccount(200);
    signIn(email);
    await render({ enabled: false, deferCalculation: true });
    await finishLoading();
    expectNoSnapshot();
    expect(latest.loading).toBe(false);
    expect(latest.ready).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    await render({ enabled: true, deferCalculation: true });
    await finishLoading();
    expect(latest.calculationDeferred).toBe(true);
    const requests = fetchMock.mock.calls.length;
    await render({ enabled: false, deferCalculation: true });
    expectNoSnapshot();
    expect(latest.ready).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it("hides the previous account immediately while the next account is still loading", async () => {
    email = addAccount(200);
    signIn(email);
    await render({ deferCalculation: true });
    await finishLoading();
    expect(latest.rawSnapshot?.email).toBe(email);
    email = addAccount(200);
    signIn(email);
    const resume = pauseContracts(email);
    await render({ deferCalculation: true });
    expectNoSnapshot();
    expect(latest.ready).toBe(false);
    await act(async () => { resume(); });
    await finishLoading();
    expect(latest.rawSnapshot?.email).toBe(email);
    expect(latest.rawSnapshot?.ownEntries.every(entry => entry.userEmail === email)).toBe(true);
    expect(latest.calculationDeferred).toBe(true);
  });

  it("does not restore a late previous-account response after the next account has loaded", async () => {
    email = addAccount(200);
    signIn(email);
    const resumeOldAccount = pauseContracts(email);
    await render({ deferCalculation: true });
    expectNoSnapshot();
    email = addAccount(199);
    signIn(email);
    await render({ deferCalculation: true });
    await finishLoading();
    const currentSnapshot = latest.rawSnapshot;
    const currentItems = latest.cashflowItems;
    expect(currentSnapshot?.email).toBe(email);
    expect(currentItems.length).toBeGreaterThan(0);
    await act(async () => { resumeOldAccount(); });
    await finishLoading();
    expect(latest.rawSnapshot?.email).toBe(email);
    expect(latest.rawSnapshot).toBe(currentSnapshot);
    expect(latest.cashflowItems).toBe(currentItems);
    expect(latest.calculationDeferred).toBe(false);
  });

  it("clears the raw snapshot when the page removes its user email on logout", async () => {
    email = addAccount(200);
    signIn(email);
    await render({ deferCalculation: true });
    await finishLoading();
    expect(latest.calculationDeferred).toBe(true);
    mocks.auth.currentUser = null;
    await render({ userEmail: null, deferCalculation: true });
    expectNoSnapshot();
    expect(latest.ready).toBe(false);
    expect(latest.loading).toBe(false);
  });

  it("does not clear a current snapshot when a cancelled previous-account request fails late", async () => {
    email = addAccount(200);
    signIn(email);
    failures.add(email);
    const resumeOldAccount = pauseContracts(email);
    await render({ deferCalculation: true });
    email = addAccount(200);
    signIn(email);
    await render({ deferCalculation: true });
    await finishLoading();
    const currentSnapshot = latest.rawSnapshot;
    expect(currentSnapshot?.email).toBe(email);
    expect(latest.calculationDeferred).toBe(true);
    await act(async () => { resumeOldAccount(); });
    await finishLoading();
    expect(latest.rawSnapshot?.email).toBe(email);
    expect(latest.rawSnapshot).toBe(currentSnapshot);
    expect(latest.calculationDeferred).toBe(true);
    expect(latest.ready).toBe(true);
  });

  it("does not read data or create a worker input without an authenticated user", async () => {
    email = addAccount(200);
    await render({ deferCalculation: true });
    await finishLoading();
    expectNoSnapshot();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(generateCashflow).not.toHaveBeenCalled();
    expect(latest.loading).toBe(false);
    expect(latest.ready).toBe(true);
  });

  it("does not offer a failed contract source as a deferred snapshot", async () => {
    email = addAccount(200);
    signIn(email);
    failures.add(email);
    await render({ deferCalculation: true });
    await finishLoading();
    expectNoSnapshot();
    expect(latest.loading).toBe(false);
    expect(latest.ready).toBe(true);
    expect(generateCashflow).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
