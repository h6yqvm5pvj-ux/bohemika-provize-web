// @vitest-environment happy-dom

import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CashflowWorkerClient } from "./cashflowWorker.client";
import type { CashflowDataset, CashflowOverview } from "./cashflowWorker.types";
import type { CashflowViewOptions } from "./buildCashflowView";
import type { MonthGroup } from "./types";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("./cashflowWorker.client", () => ({ createCashflowWorkerClient: mocks.createClient }));
import { useCashflowView } from "./useCashflowView";

type Props = Parameters<typeof useCashflowView>[0];
type Result = ReturnType<typeof useCashflowView>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function stubClient() {
  const views: Array<ReturnType<typeof deferred<CashflowOverview>>> = [];
  const months: Array<ReturnType<typeof deferred<MonthGroup | null>>> = [];
  const client = {
    executionPath: "worker" as const,
    view: vi.fn<CashflowWorkerClient["view"]>(() => {
      const job = deferred<CashflowOverview>(); views.push(job); return job.promise;
    }),
    month: vi.fn<CashflowWorkerClient["month"]>(() => {
      const job = deferred<MonthGroup | null>(); months.push(job); return job.promise;
    }),
    // Deliberately do not settle requests on dispose: the hook must reject old
    // results even if a client has already queued an uninterruptible response.
    dispose: vi.fn(),
  } satisfies CashflowWorkerClient;
  return { client, views, months };
}

const options: CashflowViewOptions = {
  scopeFilter: "combined", productFilter: "all", tipsterMode: false,
  showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: "",
};
const makeDataset = (): CashflowDataset => ({
  snapshot: { email: "advisor@example.test", myPosition: null, myCommissionMode: null,
    hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] },
  statements: [], asOf: new Date(2026, 8, 12, 12),
});
const detail = (total = 10): MonthGroup => ({
  key: "2026-09", year: 2026, monthIndex: 8, label: "Září 2026", total,
  predictedTotal: total, totalSource: "predicted", statementPayoutTotal: null,
  items: [{ id: "synthetic", entryId: "synthetic", date: new Date(2026, 8, 20),
    amount: total, productKey: "cppAuto", ownerEmail: "advisor@example.test" }],
});
const overview = (total = 10): CashflowOverview => {
  const { key, year, monthIndex, label, predictedTotal, totalSource, statementPayoutTotal } = detail(total);
  return { months: [{ key, year, monthIndex, label, total, predictedTotal, totalSource, statementPayoutTotal, itemCountLabel: "1 provize" }],
    contractSearchStats: { itemCount: 0, contractCount: 0, summary: null } };
};
const aborted = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ name: "AbortError" });

describe("cashflow view lifecycle and asynchronous selection guards", () => {
  let root: Root | null;
  let props: Props;
  let latest: Result;
  let clients: Array<ReturnType<typeof stubClient>>;
  let commits: Result[];
  let onCommit: ((result: Result) => void) | undefined;

  function Harness(input: Props) {
    const result = useCashflowView(input);
    useLayoutEffect(() => { latest = result; commits.push(result); onCommit?.(result); });
    return null;
  }
  const render = async (next = props, strict = false) => {
    props = next;
    await act(async () => root!.render(strict ? <StrictMode><Harness {...props} /></StrictMode> : <Harness {...props} />));
  };
  const resolveView = async (clientIndex = 0, viewIndex = 0, result = overview()) => {
    await act(async () => clients[clientIndex].views[viewIndex].resolve(result));
    return result;
  };
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    clients = [];
    commits = [];
    onCommit = undefined;
    props = { dataset: makeDataset(), identity: "uid-1:advisor@example.test", options, enabled: true };
    mocks.createClient.mockReset().mockImplementation(() => {
      const stub = stubClient(); clients.push(stub); return stub.client;
    });
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["disabled", "no-dataset", "no-identity"])("does not create a client or stay pending when %s", async missing => {
    await render({ ...props, ...(missing === "disabled" ? { enabled: false }
      : missing === "no-dataset" ? { dataset: null } : { identity: null }) });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(latest.overview).toBeNull();
    expect(latest.pending).toBe(false);
    expect(latest.error).toBeNull();
    await aborted(latest.loadMonth("2026-09"));
  });

  it("holds one client per dataset/identity and publishes a completed overview", async () => {
    await render();
    expect(mocks.createClient).toHaveBeenCalledExactlyOnceWith({ dataset: props.dataset });
    expect(clients[0].client.view).toHaveBeenCalledExactlyOnceWith(options);
    expect(latest.pending).toBe(true);
    expect(latest.overview).toBeNull();
    const expected = await resolveView();
    expect(latest.overview).toBe(expected);
    expect(latest.pending).toBe(false);
    expect(latest.error).toBeNull();
    await render({ ...props });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(clients[0].client.view).toHaveBeenCalledTimes(1);
  });

  it("hides the completed overview on the first commit of a new filter", async () => {
    await render();
    await resolveView();
    const commitIndex = commits.length;
    const changed = { ...options, contractNumberQuery: "AB12" };
    await render({ ...props, options: changed });
    expect(commits[commitIndex].overview).toBeNull();
    expect(commits[commitIndex].pending).toBe(true);
    expect(clients).toHaveLength(1);
    expect(clients[0].client.dispose).not.toHaveBeenCalled();
    expect(clients[0].client.view).toHaveBeenLastCalledWith(changed);
    const expected = await resolveView(0, 1, overview(20));
    expect(latest.overview).toBe(expected);
  });

  it.each(["resolve", "reject"])("ignores a late previous-filter %s even when A→B→A reuses the original options object", async outcome => {
    await render();
    await render({ ...props, options: { ...options, contractNumberQuery: "B" } });
    await render({ ...props, options });
    await act(async () => {
      if (outcome === "resolve") clients[0].views[0].resolve(overview(10));
      else clients[0].views[0].reject(new Error("Old selection failed"));
    });
    expect(latest).toMatchObject({ overview: null, error: null, pending: true });
    const current = await resolveView(0, 2, overview(30));
    await act(async () => clients[0].views[1].resolve(overview(20)));
    expect(latest.overview).toBe(current);
    expect(latest.error).toBeNull();
    expect(latest.pending).toBe(false);
  });

  it.each(["dataset", "identity"])("disposes the old client at commit and ignores its late view after changing %s", async changed => {
    await render();
    const old = clients[0];
    onCommit = result => {
      expect(old.client.dispose).toHaveBeenCalledTimes(1);
      expect(result.overview).toBeNull();
    };
    await render({ ...props, ...(changed === "dataset" ? { dataset: makeDataset() } : { identity: "uid-2:other@example.test" }) });
    onCommit = undefined;
    expect(latest.pending).toBe(true);
    expect(clients).toHaveLength(2);
    const current = await resolveView(1, 0, overview(20));
    await act(async () => old.views[0].resolve(overview(999)));
    expect(latest.overview).toBe(current);
    expect(old.client.dispose).toHaveBeenCalledTimes(1);
  });

  it.each(["logout", "disabled", "no-dataset"])("immediately clears a ready view and disposes on %s, then starts fresh", async changed => {
    await render();
    await resolveView();
    const activeProps = props;
    const previousLoad = latest.loadMonth;
    const old = clients[0];
    onCommit = result => {
      expect(old.client.dispose).toHaveBeenCalledTimes(1);
      expect(result.overview).toBeNull();
      expect(result.pending).toBe(false);
    };
    await render({ ...props, ...(changed === "logout" ? { identity: null }
      : changed === "disabled" ? { enabled: false } : { dataset: null }) });
    onCommit = undefined;
    await aborted(previousLoad("2026-09"));
    await aborted(latest.loadMonth("2026-09"));
    expect(old.client.month).not.toHaveBeenCalled();
    await render(activeProps);
    expect(clients).toHaveLength(2);
    expect(latest.overview).toBeNull();
    expect(latest.pending).toBe(true);
    await resolveView(1, 0, overview(20));
    expect(latest.overview?.months[0].total).toBe(20);
    await aborted(previousLoad("2026-09"));
  });

  it.each(["resolve", "reject"])("ignores a pending view's late %s after logout", async outcome => {
    await render();
    await render({ ...props, identity: null });
    const commitsAfterLogout = commits.length;
    await act(async () => {
      if (outcome === "resolve") clients[0].views[0].resolve(overview());
      else clients[0].views[0].reject(new Error("Previous account failed"));
    });
    expect(commits).toHaveLength(commitsAfterLogout);
    expect(latest).toMatchObject({ overview: null, error: null, pending: false });
  });

  it("only allows month reads after the current view, preserving complete details and null", async () => {
    await render();
    await aborted(latest.loadMonth("2026-09"));
    expect(clients[0].client.month).not.toHaveBeenCalled();
    await resolveView();
    const requested = latest.loadMonth("2026-09");
    const expected = detail();
    clients[0].months[0].resolve(expected);
    expect(await requested).toBe(expected);
    expect((await requested)?.items[0].date).toBeInstanceOf(Date);
    const missing = latest.loadMonth("missing");
    clients[0].months[1].resolve(null);
    expect(await missing).toBeNull();
  });

  it.each(["filter", "dataset", "identity", "logout", "disabled"])("rejects an in-flight month after changing %s", async changed => {
    await render();
    await resolveView();
    const previousLoad = latest.loadMonth;
    const previousMonth = previousLoad("2026-09");
    const rejection = aborted(previousMonth);
    await render({ ...props, ...(changed === "filter" ? { options: { ...options, showPastYears: true } }
      : changed === "dataset" ? { dataset: makeDataset() }
      : changed === "identity" ? { identity: "uid-2:other@example.test" }
      : changed === "logout" ? { identity: null } : { enabled: false }) });
    clients[0].months[0].resolve(detail());
    await rejection;
    await aborted(previousLoad("2026-09"));
    expect(clients[0].client.month).toHaveBeenCalledTimes(1);
  });

  it("does not revive an old month callback or response when returning to the same options reference", async () => {
    await render();
    await resolveView();
    const oldLoad = latest.loadMonth;
    const oldMonth = oldLoad("2026-09");
    const rejection = aborted(oldMonth);
    await render({ ...props, options: { ...options, contractNumberQuery: "B" } });
    await resolveView(0, 1);
    await render({ ...props, options });
    await resolveView(0, 2, overview(30));
    clients[0].months[0].resolve(detail(10));
    await rejection;
    await aborted(oldLoad("2026-09"));
    expect(clients[0].client.month).toHaveBeenCalledTimes(1);
    const currentMonth = latest.loadMonth("2026-09");
    clients[0].months[1].resolve(detail(30));
    expect((await currentMonth)?.total).toBe(30);
  });

  it("invalidates a previous month callback during commit before the new view's passive effect starts", async () => {
    await render();
    await resolveView();
    const previousLoad = latest.loadMonth;
    let rejected: Promise<void> | undefined;
    onCommit = () => {
      // The new view has not been dispatched yet, so client.request alone would
      // still permit this call without the committed-selection guard.
      expect(clients[0].client.view).toHaveBeenCalledTimes(1);
      rejected = aborted(previousLoad("2026-09"));
      expect(clients[0].client.month).not.toHaveBeenCalled();
    };
    await render({ ...props, options: { ...options, showPastYears: true } });
    onCommit = undefined;
    await rejected;
    expect(clients[0].client.view).toHaveBeenCalledTimes(2);
  });

  it("treats a late month failure as cancellation while preserving current failures", async () => {
    await render();
    await resolveView();
    const currentFailure = new Error("Current month unavailable");
    const current = latest.loadMonth("2026-09");
    const currentRejected = expect(current).rejects.toBe(currentFailure);
    clients[0].months[0].reject(currentFailure);
    await currentRejected;
    const previous = latest.loadMonth("2026-09");
    const rejected = aborted(previous);
    await render({ ...props, options: { ...options, showPastYears: true } });
    clients[0].months[1].reject(new Error("Previous request unavailable"));
    await rejected;
  });

  it("shows a safe current-view error, clears it on the next filter and can recover", async () => {
    await render();
    await act(async () => clients[0].views[0].reject(new Error("Synthetic sensitive debug detail")));
    expect(latest.pending).toBe(false);
    expect(latest.overview).toBeNull();
    expect(latest.error).toBe("Přehled se nepodařilo spočítat. Obnovte prosím stránku.");
    await aborted(latest.loadMonth("2026-09"));
    await render({ ...props, options: { ...options, showPastYears: true } });
    expect(latest.error).toBeNull();
    expect(latest.pending).toBe(true);
    const expected = await resolveView(0, 1);
    expect(latest.overview).toBe(expected);
    expect(latest.error).toBeNull();
  });

  it.each(["view", "month"])("disposes on unmount and prevents a late %s from publishing", async pending => {
    await render();
    let monthRejection: Promise<void> | undefined;
    if (pending === "month") {
      await resolveView();
      monthRejection = aborted(latest.loadMonth("2026-09"));
    }
    const oldLoad = latest.loadMonth;
    await act(async () => root!.unmount());
    root = null;
    const commitCount = commits.length;
    expect(clients[0].client.dispose).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (pending === "view") clients[0].views[0].resolve(overview());
      else clients[0].months[0].resolve(detail());
    });
    await monthRejection;
    await aborted(oldLoad("2026-09"));
    expect(commits).toHaveLength(commitCount);
  });

  it("survives StrictMode effect replay with one live client and no result from the disposed session", async () => {
    await render(props, true);
    expect(clients).toHaveLength(2);
    expect(clients[0].client.dispose).toHaveBeenCalledTimes(1);
    expect(clients[1].client.dispose).not.toHaveBeenCalled();
    const expected = await resolveView(1, 0, overview(20));
    await act(async () => clients[0].views[0].resolve(overview(999)));
    expect(latest.overview).toBe(expected);
    await render({ ...props }, true);
    expect(clients).toHaveLength(2);
    expect(clients[1].client.view).toHaveBeenCalledTimes(1);
    await act(async () => root!.unmount());
    root = null;
    expect(clients.every(stub => stub.client.dispose.mock.calls.length === 1)).toBe(true);
  });
});
