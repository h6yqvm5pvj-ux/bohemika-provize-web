// @vitest-environment happy-dom
import { act, memo, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrivateMemory } from "@/app/lib/privateMemory";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string; email: string; getIdToken: ReturnType<typeof vi.fn> } },
  impersonatedEmail: "",
}));
vi.mock("../firebase", () => ({ auth: mocks.auth }));
vi.mock("../lib/adminImpersonation", () => ({
  ADMIN_IMPERSONATION_HEADER: "x-bohemika-impersonate-email",
  readAdminImpersonationState: () => mocks.impersonatedEmail ? { email: mocks.impersonatedEmail } : null,
}));
vi.mock("./subscriptionCashflow", async importOriginal => ({
  ...await importOriginal<typeof import("./subscriptionCashflow")>(),
  isSubscriptionCashflowOwner: (value: unknown) => typeof value === "string" && value.includes("subscription"),
}));

import { useCashflowData } from "./useCashflowData";

type HookParams = Parameters<typeof useCashflowData>[0];
type HookResult = ReturnType<typeof useCashflowData>;
type PendingRequest = {
  url: URL;
  init: RequestInit;
  delivered: boolean;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};
type Consumer = { id: string; options?: Partial<HookParams> };
let sequence = 0;

describe("shared cashflow download cancellation", () => {
  let root: Root;
  let email: string;
  let requests: PendingRequest[];
  const latest = new Map<string, HookResult>();
  const fetchMock = vi.fn();

  function Probe({ id, options }: Consumer) {
    const result = useCashflowData({ userEmail: email, scopeFilter: "combined", productFilter: "all", snapshotOnly: true, ...options });
    useEffect(() => { latest.set(id, result); }, [id, result]);
    return null;
  }
  const StableProbe = memo(Probe);
  const render = (consumers: Consumer[] = [{ id: "one" }]) => act(async () => {
    root.render(<>{consumers.map(consumer => <Probe key={consumer.id} {...consumer} />)}</>);
  });
  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const current = (id = "one") => latest.get(id)!;
  const bySource = (source: "my" | "team" | "tips" | "subscriptions") => requests.filter(request => {
    if (source === "tips") return request.url.pathname === "/api/tip-payouts/list";
    if (source === "subscriptions") return request.url.pathname === "/api/subscription-payments/list";
    return request.url.pathname === "/api/contracts/list" && request.url.searchParams.get("scope") === source;
  });
  const contractPage = (id: string, extras: Record<string, unknown> = {}) => ({
    ok: true, contracts: [{ id, userEmail: email }], hasMore: false, nextCursorToken: null,
    position: "poradce2", commissionMode: "standard", hasTeam: false, teamEmails: [], totalCount: 1, ...extras,
  });
  const bodyFor = (request: PendingRequest, marker = "fresh") => request.url.pathname === "/api/tip-payouts/list"
    ? { ok: true, payouts: [], hasMore: false }
    : request.url.pathname === "/api/subscription-payments/list"
      ? { ok: true, payments: [], hasMore: false }
      : contractPage(marker);
  const deliver = (request: PendingRequest, body: unknown = bodyFor(request), status = 200) => act(async () => {
    request.delivered = true;
    request.resolve(Response.json(body, { status }));
  });
  const finishPending = (marker = "fresh") => act(async () => {
    for (const request of requests.filter(item => !item.delivered)) {
      request.delivered = true;
      request.resolve(Response.json(bodyFor(request, marker)));
    }
    await vi.advanceTimersByTimeAsync(0);
  });
  async function pauseJson(request: PendingRequest) {
    let resolveBody!: (body: unknown) => void;
    const body = new Promise(resolve => { resolveBody = resolve; });
    const json = vi.fn(() => body);
    await act(async () => {
      request.delivered = true;
      request.resolve({ ok: true, status: 200, json } as unknown as Response);
    });
    expect(json).toHaveBeenCalledOnce();
    return (value: unknown) => act(async () => { resolveBody(value); });
  }
  const signal = (request: PendingRequest) => {
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
    return request.init.signal!;
  };

  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    localStorage.clear(); clearPrivateMemory(); latest.clear(); requests = [];
    email = `cashflow-cancellation-${++sequence}@example.test`;
    mocks.impersonatedEmail = "";
    mocks.auth.currentUser = { uid: `synthetic-${sequence}`, email, getIdToken: vi.fn(async () => "synthetic-token") };
    // Deliberately ignore AbortSignal: the hook must also reject stale fetch/JSON
    // completions from a transport that has already queued an uncancellable result.
    fetchMock.mockImplementation((input: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      requests.push({ url: new URL(input, "https://example.test"), init, resolve, reject, delivered: false });
    }));
    vi.stubGlobal("fetch", fetchMock);
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("deduplicates two consumers and keeps the shared download alive for the remaining consumer", async () => {
    await render([{ id: "one" }, { id: "two" }]);
    expect(bySource("my")).toHaveLength(1); expect(bySource("tips")).toHaveLength(1);
    expect(mocks.auth.currentUser!.getIdToken).toHaveBeenCalledOnce();
    const active = requests.map(signal);
    await render([{ id: "two" }]);
    expect(active.every(item => !item.aborted)).toBe(true);
    await finishPending("complete"); await flush();
    expect(current("two")).toMatchObject({ ready: true, loading: false, error: null });
    expect(current("two").rawSnapshot?.ownEntries[0].id).toBe("complete");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("survives StrictMode setup-cleanup-setup without joining a stranded aborted task", async () => {
    await act(async () => root.render(<StrictMode><Probe id="one" /></StrictMode>));
    expect(bySource("my")).toHaveLength(1); expect(bySource("tips")).toHaveLength(1);
    expect(mocks.auth.currentUser!.getIdToken).toHaveBeenCalledOnce();
    expect(requests.every(request => !signal(request).aborted)).toBe(true);
    await finishPending("strict-success"); await flush();
    expect(current()).toMatchObject({ ready: true, loading: false, error: null });
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("strict-success");
    expect(console.error).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled();
  });

  it("isolates tipster downloads while another consumer keeps the standard download alive", async () => {
    await render([{ id: "one" }, { id: "two" }]);
    const standardRequests = [...requests];
    await render([{ id: "one", options: { tipsterMode: true } }, { id: "two" }]);
    expect(standardRequests.every(request => !signal(request).aborted)).toBe(true);
    expect(bySource("my")).toHaveLength(1); expect(bySource("tips")).toHaveLength(2);
    const tipsterRequest = bySource("tips")[1];
    expect(signal(tipsterRequest)).not.toBe(signal(standardRequests[0]));
    await render([{ id: "one" }, { id: "two" }]);
    expect(signal(tipsterRequest).aborted).toBe(true);
    expect(standardRequests.every(request => !signal(request).aborted)).toBe(true);
    expect(requests).toHaveLength(3);
    await deliver(tipsterRequest, { ok: true, payouts: [{ id: "abandoned-tipster" }], hasMore: false });
    await finishPending("standard-success"); await flush();
    expect(current().rawSnapshot).toBe(current("two").rawSnapshot);
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("standard-success");
    expect(current().rawSnapshot?.tipPayouts).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("aborts own, team, TIP and subscription reads after the last consumer leaves and starts no next pages", async () => {
    email = `subscription-cancellation-${sequence}@example.test`;
    mocks.auth.currentUser!.email = email;
    await render([{ id: "one" }, { id: "two" }]);
    await deliver(bySource("my")[0], contractPage("first-page", {
      hasTeam: true, teamEmails: ["team@example.test"], hasMore: true, nextCursorToken: "own-next", totalCount: 2,
    }));
    expect(bySource("my")).toHaveLength(2); expect(bySource("team")).toHaveLength(1);
    expect(bySource("tips")).toHaveLength(1); expect(bySource("subscriptions")).toHaveLength(1);
    const allSignals = requests.map(signal);
    await render([{ id: "two" }]); expect(allSignals.every(item => !item.aborted)).toBe(true);
    await render([]); expect(allSignals.every(item => item.aborted)).toBe(true);
    const requestCount = requests.length;
    for (const pending of requests.filter(item => !item.delivered)) {
      const body = pending.url.pathname === "/api/tip-payouts/list"
        ? { ok: true, payouts: [{ id: "tip-first" }], hasMore: true, nextCursorToken: "tip-next" }
        : pending.url.pathname === "/api/subscription-payments/list"
          ? { ok: true, payments: [{ id: "payment" }], hasMore: false }
          : contractPage("late", { hasMore: true, nextCursorToken: "more-contracts" });
      await deliver(pending, body);
    }
    await flush();
    expect(requests).toHaveLength(requestCount);
    expect(console.error).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled();
    await render();
    expect(current()).toMatchObject({ loading: true, ready: false, rawSnapshot: null });
    expect(requests).toHaveLength(requestCount + 3);
    await finishPending("new-complete"); await flush();
    expect(current().rawSnapshot?.ownEntries.map(item => item.id)).toEqual(["new-complete"]);
  });

  it("does not let a cancelled JSON completion erase the newer task used by another consumer", async () => {
    await render(); const oldOwn = bySource("my")[0];
    await deliver(bySource("tips")[0]);
    const resolveOldJson = await pauseJson(oldOwn);
    await render([]); expect(signal(oldOwn).aborted).toBe(true);
    await render();
    expect(bySource("my")).toHaveLength(2);
    await resolveOldJson(contractPage("stale")); await flush();
    const requestCount = requests.length;
    await render([{ id: "one" }, { id: "two" }]);
    expect(requests).toHaveLength(requestCount);
    await finishPending("newer"); await flush();
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("newer");
    expect(current("two").rawSnapshot).toBe(current().rawSnapshot);
  });

  it("never overwrites a new cached success with an older transport response that ignores abort", async () => {
    await render(); const abandoned = [...requests];
    await render([]); await render();
    for (const request of requests.filter(item => !abandoned.includes(item))) await deliver(request, bodyFor(request, "newer"));
    await flush(); expect(current().rawSnapshot?.ownEntries[0].id).toBe("newer");
    for (const request of abandoned) await deliver(request, bodyFor(request, "stale"));
    await flush(); const count = requests.length;
    await render([]); await render(); await flush();
    expect(requests).toHaveLength(count);
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("newer");
  });

  it("replaces a stale auth-object task with the same UID/email before a new consumer joins", async () => {
    await act(async () => root.render(<><StableProbe key="one" id="one" /></>));
    const abandoned = [...requests], previousUser = mocks.auth.currentUser!;
    const originalRender = current();
    mocks.auth.currentUser = { ...previousUser, getIdToken: vi.fn(async () => "new-synthetic-token") };
    // The memoized original consumer does not rerender: the new consumer must
    // independently reject the old task even though both use the same cache key.
    await act(async () => root.render(<><StableProbe key="one" id="one" /><StableProbe key="two" id="two" /></>));
    expect(current()).toBe(originalRender);
    expect(bySource("my")).toHaveLength(2); expect(bySource("tips")).toHaveLength(2);
    expect(abandoned.every(request => signal(request).aborted)).toBe(true);
    for (const request of abandoned) await deliver(request, { ok: false }, 401);
    expect(previousUser.getIdToken).toHaveBeenCalledOnce();
    await finishPending("new-auth-object"); await flush();
    expect(current("two")).toMatchObject({ ready: true, loading: false, error: null });
    expect(current("two").rawSnapshot?.ownEntries[0].id).toBe("new-auth-object");
    expect(current()).toMatchObject({ ready: true, loading: false, error: null });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("releases a disabled consumer immediately and re-enables using a fresh task", async () => {
    await render(); const abandoned = [...requests];
    await render([{ id: "one", options: { enabled: false } }]);
    expect(abandoned.every(request => signal(request).aborted)).toBe(true);
    expect(current()).toMatchObject({ loading: false, ready: false, rawSnapshot: null });
    for (const request of abandoned) await deliver(request, bodyFor(request, "stale"));
    await render(); expect(bySource("my")).toHaveLength(2);
    await finishPending("enabled"); await flush();
    expect(current()).toMatchObject({ loading: false, ready: true, error: null });
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("enabled");
  });

  it("replaces an abandoned task on reload and ignores its late result", async () => {
    await render(); const abandoned = [...requests];
    await render([{ id: "one", options: { reloadKey: 1 } }]);
    expect(abandoned.every(request => signal(request).aborted)).toBe(true);
    expect(bySource("my")).toHaveLength(2);
    for (const request of abandoned) await deliver(request, bodyFor(request, "stale"));
    await finishPending("reloaded"); await flush();
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("reloaded");
  });

  it("keeps an in-flight shared task when just one of two consumers reloads", async () => {
    await render([{ id: "one" }, { id: "two" }]); const shared = [...requests];
    await render([{ id: "one", options: { reloadKey: 1 } }, { id: "two" }]);
    expect(shared.every(request => !signal(request).aborted)).toBe(true);
    expect(requests).toHaveLength(2);
    await finishPending("shared-reload"); await flush();
    expect(current().rawSnapshot).toBe(current("two").rawSnapshot);
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("shared-reload");
  });

  it("never fetches if the last consumer leaves while the initial token is pending", async () => {
    let resolveToken!: (token: string) => void;
    mocks.auth.currentUser!.getIdToken.mockReturnValueOnce(new Promise(resolve => { resolveToken = resolve; }));
    await render(); expect(requests).toHaveLength(0);
    await render([]); await act(async () => { resolveToken("synthetic-late-token"); });
    expect(requests).toHaveLength(0); expect(console.error).not.toHaveBeenCalled();
    await render(); expect(bySource("my")).toHaveLength(1);
    await finishPending(); await flush(); expect(current().ready).toBe(true);
  });

  it("does not refresh any token or retry requests when 401 arrives after cancellation", async () => {
    email = `subscription-cancellation-${sequence}@example.test`; mocks.auth.currentUser!.email = email;
    await render(); const abandoned = [...requests]; expect(abandoned).toHaveLength(3);
    await render([]);
    for (const request of abandoned) await deliver(request, { ok: false }, 401);
    expect(mocks.auth.currentUser!.getIdToken).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(3); expect(console.error).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not retry if cancellation happens during the forced token refresh", async () => {
    let resolveToken!: (token: string) => void;
    mocks.auth.currentUser!.getIdToken.mockResolvedValueOnce("synthetic-token")
      .mockReturnValueOnce(new Promise(resolve => { resolveToken = resolve; }));
    await render(); await deliver(bySource("tips")[0]); await deliver(bySource("my")[0], { ok: false }, 401);
    expect(mocks.auth.currentUser!.getIdToken).toHaveBeenLastCalledWith(true);
    await render([]); await act(async () => { resolveToken("synthetic-refreshed-token"); });
    expect(requests).toHaveLength(2); expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["tips", "subscriptions"] as const)("does not swallow cancellation during %s JSON parsing into a cacheable empty source", async source => {
    email = `subscription-cancellation-${sequence}@example.test`; mocks.auth.currentUser!.email = email;
    await render(); const resolveJson = await pauseJson(bySource(source)[0]); const abandoned = [...requests];
    await render([]);
    await resolveJson(source === "tips" ? { ok: true, payouts: [], hasMore: false } : { ok: true, payments: [], hasMore: false });
    for (const request of abandoned.filter(item => !item.delivered)) await deliver(request, bodyFor(request, "partial"));
    await flush(); await render();
    expect(current()).toMatchObject({ loading: true, rawSnapshot: null }); expect(bySource("my")).toHaveLength(2);
    await finishPending("complete"); await flush();
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("complete"); expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["auth", "impersonation", "generation"])("stops pagination after a %s context change even before the hook rerenders", async change => {
    await render(); const own = bySource("my")[0];
    if (change === "auth") mocks.auth.currentUser = { uid: "new-actor", email: "new@example.test", getIdToken: vi.fn(async () => "new-synthetic-token") };
    if (change === "impersonation") mocks.impersonatedEmail = "represented@example.test";
    if (change === "generation") clearPrivateMemory();
    await deliver(own, contractPage("stale", { hasMore: true, nextCursorToken: "next", totalCount: 2 }));
    await deliver(bySource("tips")[0]); await flush();
    // Cancellation can itself cause a render and a legitimate first read in the
    // new context; the abandoned task must never follow its advertised cursor.
    expect(bySource("my").every(request => !request.url.searchParams.has("cursor"))).toBe(true);
    expect(signal(own).aborted).toBe(true); expect(current().rawSnapshot).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps genuine mandatory-source errors visible, uncached and retryable", async () => {
    await render(); await deliver(bySource("tips")[0]);
    await deliver(bySource("my")[0], { ok: false, error: "Synthetic contract failure" }, 500); await flush();
    expect(current()).toMatchObject({ ready: true, loading: false, rawSnapshot: null });
    expect(current().error).toContain("nepodařilo načíst"); expect(console.error).toHaveBeenCalledOnce();
    await render([{ id: "one", options: { reloadKey: 1 } }]); expect(bySource("my")).toHaveLength(2);
    await finishPending("recovered"); await flush();
    expect(current()).toMatchObject({ ready: true, loading: false, error: null });
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("recovered");
  });

  it("keeps optional source failures as empty sources and preserves a successful portfolio", async () => {
    email = `subscription-cancellation-${sequence}@example.test`; mocks.auth.currentUser!.email = email;
    await render();
    await deliver(bySource("tips")[0], { ok: false }, 500);
    await deliver(bySource("subscriptions")[0], { ok: false }, 500);
    await deliver(bySource("my")[0]); await flush();
    expect(current()).toMatchObject({ ready: true, loading: false, error: null });
    expect(current().rawSnapshot?.tipPayouts).toEqual([]); expect(current().rawSnapshot?.subscriptionPayments).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(2); expect(console.error).not.toHaveBeenCalled();
  });

  it("continues to reuse a completed successful snapshot without a new token or network requests", async () => {
    await render(); await finishPending("cached"); await flush();
    const snapshot = current().rawSnapshot, timestamp = current().snapshotUpdatedAt, count = requests.length;
    await render([]); vi.setSystemTime(Date.now() + 60_000);
    expect(requests.every(request => !signal(request).aborted)).toBe(true);
    await render(); await flush();
    expect(requests).toHaveLength(count); expect(mocks.auth.currentUser!.getIdToken).toHaveBeenCalledOnce();
    expect(current().rawSnapshot).toBe(snapshot); expect(current().snapshotUpdatedAt).toBe(timestamp);
    expect(current()).toMatchObject({ ready: true, loading: false, error: null });
  });

  it("does not cache a read that overlaps a contract mutation and refetches after remount", async () => {
    await render();
    localStorage.setItem("contracts_last_updated", String(Date.now() + 1));
    vi.setSystemTime(Date.now() + 10);
    await finishPending("overlapping-read"); await flush();
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("overlapping-read");
    const count = requests.length;
    await render([]); await render();
    expect(requests).toHaveLength(count + 2);
    expect(current()).toMatchObject({ loading: true, rawSnapshot: null });
    await finishPending("after-mutation"); await flush();
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("after-mutation");
    const refreshedCount = requests.length;
    await render([]); await render(); await flush();
    expect(requests).toHaveLength(refreshedCount);
    expect(current().rawSnapshot?.ownEntries[0].id).toBe("after-mutation");
  });
});
