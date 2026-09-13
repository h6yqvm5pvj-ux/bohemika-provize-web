// @vitest-environment happy-dom

import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "advisor-uid", getIdToken: vi.fn() },
  profile: vi.fn(), read: vi.fn(), write: vi.fn(), clear: vi.fn(),
}));
vi.mock("@/app/firebase", () => ({ auth: { get currentUser() { return mocks.user; } } }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("./homeCacheStorage", () => ({
  readPersistedHomeCache: mocks.read, writePersistedHomeCache: mocks.write, clearPersistedHomeCache: mocks.clear,
}));
import { invalidateHomeCache, useHomeData, type EntryDoc } from "./useHomeData";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const day = (month: number, date = 10) => new Date(2026, month, date).getTime();
const entry = (id: string, month: number, amount: number, owner = "advisor@example.test"): EntryDoc => ({
  id, userEmail: owner, contractSignedDate: day(month), productKey: "cppAuto", inputAmount: 1000, frequencyRaw: "annual",
  items: [{ code: "A101", amount, title: "Synthetic commission" }],
  managerOverrides: [{ email: "advisor@example.test", items: [{ code: "A101", amount, title: "Synthetic override" }] }],
});
const own = [entry("own-current", 8, 100), entry("own-previous", 7, 50),
  { ...entry("inherited", 8, 999), acquisitionType: "inherited" as const }];
const team = [entry("team-current", 8, 200, "team@example.test"), entry("team-previous", 7, 75, "team@example.test")];
const contracts = (items: EntryDoc[], hasTeam = true) => Response.json({ ok: true, contracts: items, hasTeam, hasMore: false });
const tips = (payouts: unknown[] = [], extra: Record<string, unknown> = {}) => Response.json({ ok: true, payouts, hasMore: false, ...extra });
const currentTips = () => tips([
  { id: "one", sourceToken: "same-contract", sourceContractSignedDate: day(8), payoutDate: day(9), amount: 30 },
  { id: "two", sourceToken: "same-contract", sourceContractSignedDate: day(8), payoutDate: day(8), amount: 20 },
  { id: "previous", sourceToken: "previous", sourceContractSignedDate: day(7), payoutDate: day(8), amount: 40 },
  { id: "fallback", payoutDate: day(8), amount: 10 },
  { id: "old-signed", sourceContractSignedDate: day(6), payoutDate: day(8), amount: 999 },
  { id: "future", sourceContractSignedDate: day(9, 1), payoutDate: day(8), amount: 999 },
  { id: "negative", payoutDate: day(8), amount: -10 },
]);

describe("home summaries independent of TIP completion", () => {
  let root: Root | null;
  let props: Parameters<typeof useHomeData>[0];
  let latest: ReturnType<typeof useHomeData>;
  let calls: Array<{ url: URL; signal: AbortSignal | null; job: ReturnType<typeof deferred<Response>> }>;
  let onCommit: (() => void) | undefined;
  function Harness(input: typeof props) {
    const result = useHomeData(input);
    useLayoutEffect(() => { latest = result; onCommit?.(); });
    return null;
  }
  const render = async (next = props, strict = false) => {
    props = next;
    await act(async () => root!.render(strict ? <StrictMode><Harness {...props} /></StrictMode> : <Harness {...props} />));
  };
  const tipCalls = () => calls.filter(call => call.url.pathname.includes("tip-payouts"));
  const contractCalls = (scope: string) => calls.filter(call => call.url.searchParams.get("scope") === scope);
  const settleSummaries = async () => {
    await act(async () => {
      contractCalls("my")[0].job.resolve(contracts(own));
      contractCalls("team")[0].job.resolve(contracts(team));
    });
  };
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 12, 12));
    mocks.user.uid = "advisor-uid";
    mocks.user.getIdToken.mockReset().mockResolvedValue("synthetic-token");
    mocks.profile.mockReset().mockResolvedValue({ ok: true, profile: { monthlyGoal: 1000 } });
    mocks.read.mockReset().mockReturnValue(null);
    mocks.write.mockReset();
    invalidateHomeCache("advisor@example.test");
    invalidateHomeCache("other@example.test");
    calls = [];
    onCommit = undefined;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const job = deferred<Response>();
      calls.push({ url: new URL(String(input), "https://example.test"), signal: init?.signal ?? null, job });
      // Keep resolving cancelled transports to test the hook's own fences.
      return job.promise;
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    props = { email: "advisor@example.test", loadPersonalHistory: false, teamHistoryMonths: 0, initialHasTeam: true };
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes own/team totals and starts history while TIP is stalled, caching only the complete result", async () => {
    await render({ ...props, loadPersonalHistory: true, teamHistoryMonths: 6 });
    expect(calls).toHaveLength(3);
    await settleSummaries();
    expect(latest).toMatchObject({ summaryLoading: false, loading: false, tipSummaryLoading: true,
      historyLoading: true, myContractsCount: 1, myImmediateSum: 100, myImmediatePrevSum: 50,
      teamContractsCount: 1, teamImmediateSum: 200, teamImmediatePrevSum: 75 });
    expect(contractCalls("my")).toHaveLength(2);
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => contractCalls("my")[1].job.resolve(contracts([...own, entry("historic", 4, 25)])));
    expect(contractCalls("team")).toHaveLength(2);
    await act(async () => contractCalls("team")[1].job.resolve(contracts(team)));
    expect(latest.historyLoading).toBe(false);
    expect(latest.myEntries.some(item => item.id === "historic")).toBe(true);
    expect(latest.teamEntries).toHaveLength(2);
    expect(latest.tipSummaryLoading).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => tipCalls()[0].job.resolve(currentTips()));
    expect(latest).toMatchObject({ tipSummaryLoading: false, tipSummaryError: null,
      myTipContractsCount: 2, myTipImmediateSum: 60, myTipImmediatePrevSum: 40 });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write.mock.calls[0][0]).toContain("v6-complete-tip-production|advisor-uid|advisor@example.test|");
    expect(mocks.write.mock.calls[0][1]).toMatchObject({ myImmediateSum: 100, teamImmediateSum: 200, myTipImmediateSum: 60 });
    const query = tipCalls()[0].url.searchParams;
    expect(Object.fromEntries(query)).toEqual({ limit: "100", shape: "home", payoutFrom: String(day(7, 1)),
      productionFrom: String(day(7, 1)), productionTo: String(day(9, 1)) });
  });

  it("keeps complete own/team/history usable when TIP fails and never persists a fake zero", async () => {
    await render();
    await settleSummaries();
    await act(async () => tipCalls()[0].job.resolve(Response.json({ ok: false, error: "Unavailable" }, { status: 503 })));
    expect(latest).toMatchObject({ summaryLoading: false, historyLoading: false, tipSummaryLoading: false,
      myImmediateSum: 100, teamImmediateSum: 200 });
    expect(latest.tipSummaryError).toContain("TIP produkci se nepodařilo načíst");
    expect(mocks.write).not.toHaveBeenCalled();
    // Re-mounting cannot seed from an incomplete in-memory cache either.
    await act(async () => root!.unmount());
    root = createRoot(document.createElement("div"));
    await render();
    expect(latest.summaryLoading).toBe(true);
    expect(latest.myImmediateSum).toBe(0);
  });

  it("continues through an empty projected TIP page and preserves signing-date precedence", async () => {
    await render();
    await settleSummaries();
    await act(async () => tipCalls()[0].job.resolve(tips([], { hasMore: true, nextCursorToken: "scanned-next" })));
    expect(tipCalls()).toHaveLength(2);
    expect(tipCalls()[1].url.searchParams.get("cursor")).toBe("scanned-next");
    expect(latest.tipSummaryLoading).toBe(true);
    await act(async () => tipCalls()[1].job.resolve(currentTips()));
    expect(latest.myTipImmediateSum).toBe(60);
    expect(latest.myTipImmediatePrevSum).toBe(40);
  });

  it.each(["missing", "repeat", "cap"])("reports incomplete TIP pagination (%s) without writing full cache", async failure => {
    await render();
    await settleSummaries();
    if (failure === "missing") {
      await act(async () => tipCalls()[0].job.resolve(tips([], { hasMore: true })));
    } else {
      const count = failure === "cap" ? 60 : 2;
      for (let index = 0; index < count; index++) {
        await act(async () => tipCalls()[index].job.resolve(tips([], {
          hasMore: true, nextCursorToken: failure === "repeat" ? "same" : `page-${index}`,
        })));
      }
    }
    expect(latest.tipSummaryError).not.toBeNull();
    expect(latest.tipSummaryLoading).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["email", "uid", "logout"])("hides the previous account on the first commit and ignores its late TIP after changing %s", async changed => {
    await render();
    await settleSummaries();
    const oldTip = tipCalls()[0];
    onCommit = () => {
      expect(latest.myImmediateSum).toBe(0);
      expect(latest.teamEntries).toEqual([]);
      expect(latest.myTipImmediateSum).toBe(0);
    };
    if (changed === "uid") mocks.user.uid = "new-uid";
    await render({ ...props, email: changed === "logout" ? null : changed === "email" ? "other@example.test" : props.email });
    onCommit = undefined;
    expect(oldTip.signal?.aborted).toBe(true);
    await act(async () => oldTip.job.resolve(currentTips()));
    expect(latest.myTipImmediateSum).toBe(0);
    expect(mocks.write).not.toHaveBeenCalled();
    if (changed === "logout") expect(latest.tipSummaryLoading).toBe(false);
  });

  it("prevents a cancelled history request from writing either cache or old entries", async () => {
    await render({ ...props, loadPersonalHistory: true });
    await settleSummaries();
    await act(async () => tipCalls()[0].job.resolve(currentTips()));
    const oldHistory = contractCalls("my")[1];
    await render({ ...props, email: "other@example.test" });
    await act(async () => oldHistory.job.resolve(contracts([entry("old-private", 4, 999)])));
    expect(latest.myEntries).toEqual([]);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(oldHistory.signal?.aborted).toBe(true);
  });

  it("restores the same complete cache immediately but does not share it across UIDs", async () => {
    await render();
    await settleSummaries();
    await act(async () => tipCalls()[0].job.resolve(currentTips()));
    await act(async () => root!.unmount());
    root = createRoot(document.createElement("div"));
    await render();
    expect(latest).toMatchObject({ summaryLoading: false, historyLoading: false, tipSummaryLoading: false,
      myImmediateSum: 100, myTipImmediateSum: 60, teamImmediateSum: 200 });
    mocks.user.uid = "different-uid";
    await render();
    expect(latest.myImmediateSum).toBe(0);
    expect(latest.summaryLoading).toBe(true);
  });

  it.each(["tip-first", "regular-first"])("never publishes mixed cached/fresh totals during a %s refresh", async order => {
    await render();
    await settleSummaries();
    await act(async () => tipCalls()[0].job.resolve(currentTips()));
    await act(async () => root!.unmount());
    root = createRoot(document.createElement("div"));
    await render();
    const freshRegular = async () => {
      await act(async () => {
        contractCalls("my")[1].job.resolve(contracts([entry("fresh-own", 8, 500)]));
        contractCalls("team")[1].job.resolve(contracts([entry("fresh-team", 8, 600, "team@example.test")]));
      });
    };
    const freshTip = async () => {
      await act(async () => tipCalls()[1].job.resolve(tips([{ id: "fresh-tip", payoutDate: day(8), amount: 900 }])));
    };
    expect(latest).toMatchObject({ myImmediateSum: 100, teamImmediateSum: 200, myTipImmediateSum: 60, tipSummaryLoading: false });
    if (order === "tip-first") {
      await freshTip();
      // Keep the entire complete cached summary until regular data is ready.
      expect(latest).toMatchObject({ myImmediateSum: 100, teamImmediateSum: 200, myTipImmediateSum: 60, tipSummaryLoading: false });
      await freshRegular();
    } else {
      await freshRegular();
      expect(latest).toMatchObject({ myImmediateSum: 500, teamImmediateSum: 600, tipSummaryLoading: true });
      expect(mocks.write).toHaveBeenCalledTimes(1);
      await freshTip();
    }
    expect(latest).toMatchObject({ myImmediateSum: 500, teamImmediateSum: 600, myTipImmediateSum: 900, tipSummaryLoading: false });
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "failure"])("finishes loading when TIP settles with %s before regular production fails", async outcome => {
    await render();
    await act(async () => {
      if (outcome === "success") tipCalls()[0].job.resolve(currentTips());
      else tipCalls()[0].job.reject(new Error("TIP unavailable"));
    });
    await act(async () => contractCalls("my")[0].job.resolve(Response.json({ ok: false }, { status: 503 })));
    expect(latest.summaryLoading).toBe(false);
    expect(latest.tipSummaryLoading).toBe(false);
    expect(latest.tipSummaryError).not.toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("ignores a range-only completion when auth changes before the next React render", async () => {
    await render();
    await settleSummaries();
    await act(async () => tipCalls()[0].job.resolve(currentTips()));
    await render({ ...props, teamHistoryMonths: 6 });
    const oldRange = contractCalls("team")[1];
    mocks.user.uid = "other-uid";
    await act(async () => oldRange.job.resolve(contracts([entry("private-old-range", 4, 999)])));
    expect(latest.teamEntries.some(item => item.id === "private-old-range")).toBe(false);
    mocks.user.uid = "advisor-uid";
    await render({ ...props, teamHistoryMonths: 0 });
    await render({ ...props, teamHistoryMonths: 6 });
    expect(contractCalls("team")).toHaveLength(3); // No cancelled range cache was populated.
  });

  it("does not apply a late cached-profile result after logout or start requests for it", async () => {
    const profile = deferred<unknown>();
    mocks.profile.mockReturnValue(profile.promise);
    await render();
    await render({ ...props, email: null });
    await act(async () => profile.resolve({ ok: true, profile: { monthlyGoal: 999 } }));
    expect(calls).toHaveLength(0);
    expect(latest.userMeta).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("leaves no stale results or cache writes after unmount and StrictMode replay", async () => {
    await render(props, true);
    // StrictMode's cancelled profile continuation never starts a request.
    expect(tipCalls()).toHaveLength(1);
    await settleSummaries();
    await act(async () => root!.unmount());
    root = null;
    await act(async () => tipCalls()[0].job.resolve(currentTips()));
    expect(tipCalls()[0].signal?.aborted).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
