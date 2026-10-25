// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null }, impersonatedEmail: "", month: "2026-9",
  section: vi.fn(), fallback: vi.fn(), cashflow: vi.fn(), calculation: vi.fn(),
}));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/adminImpersonation", () => ({
  ADMIN_IMPERSONATION_HEADER: "x-bohemika-impersonate-email",
  readAdminImpersonationState: () => mocks.impersonatedEmail ? { email: mocks.impersonatedEmail } : null,
}));
vi.mock("../homePerformance", () => ({ startHomeTiming: () => () => {} }));
vi.mock("../useCalendarMonth", () => ({ useCalendarMonth: () => mocks.month }));
vi.mock("@/app/cashflow/useCashflowData", () => ({ useCashflowData: mocks.cashflow }));
vi.mock("../expectedPayout.client", () => ({ calculateExpectedPayout: mocks.calculation }));
vi.mock("./ExpectedPayoutSection", () => ({ ExpectedPayoutSection: mocks.section }));
vi.mock("./ExpectedPayoutFallback", () => ({ ExpectedPayoutFallback: mocks.fallback }));
import { ExpectedPayoutWidget } from "./ExpectedPayoutWidget";

type Props = Parameters<typeof ExpectedPayoutWidget>[0];
type PendingRequest = { url: string; init: RequestInit; resolve: (response: Response) => void; reject: (error: Error) => void };
const payout = { grossAmount: 100, stornoFundAmount: 10, netAmount: 90 };
const updatedAt = 1_790_000_000_000;
const complete = (overrides: Record<string, unknown> = {}) => ({ ok: true, payout, updatedAt, monthKey: "2026-10", ...overrides });
function FallbackStub({ onLoadingChange }: Props) {
  useEffect(() => { onLoadingChange?.(true); return () => onLoadingChange?.(false); }, [onLoadingChange]);
  return null;
}

describe("home payout server summary", () => {
  let root: Root | null;
  let user: User;
  let requests: PendingRequest[];
  const fetchMock = vi.fn();
  const onLoadingChange = vi.fn();
  const render = (overrides: Partial<Props> = {}) => act(async () => root!.render(<ExpectedPayoutWidget language="cs" user={user}
    advisorDataEmail="advisor@example.test" homeReloadKey={0} periodLabel="říjen" isLiteUI onLoadingChange={onLoadingChange} {...overrides} />));
  const current = () => mocks.section.mock.calls.at(-1)![0];
  const respond = (index = 0, payload: unknown = complete(), status = 200) => act(async () => {
    requests[index].resolve(Response.json(payload, { status }));
  });
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.month = "2026-9"; mocks.impersonatedEmail = "";
    user = { uid: "test", getIdToken: vi.fn(async () => "synthetic") } as unknown as User;
    mocks.auth.currentUser = user;
    mocks.section.mockReturnValue(null);
    mocks.fallback.mockImplementation(FallbackStub);
    requests = [];
    fetchMock.mockImplementation((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      requests.push({ url, init, resolve, reject });
    }));
    vi.stubGlobal("fetch", fetchMock);
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => { if (root) await act(async () => root!.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("loads only one compact summary and never loads legacy contracts, statements or the worker", async () => {
    await render();
    expect(current().loading).toBe(true);
    expect(onLoadingChange).toHaveBeenLastCalledWith(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(requests[0].url, "https://example.test");
    expect(url.pathname).toBe("/api/contracts/expected-payout");
    expect([...url.searchParams.keys()]).toEqual(["timeZone"]);
    expect(url.searchParams.get("timeZone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(requests[0].init).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer synthetic" } });
    await respond();
    expect(current()).toMatchObject({ loading: false, error: null, updatedAt, ...payout });
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    expect(mocks.cashflow).not.toHaveBeenCalled(); expect(mocks.calculation).not.toHaveBeenCalled();
    expect(mocks.fallback).not.toHaveBeenCalled();
  });

  it("preserves the last good amounts and source time during failed refresh, then recovers", async () => {
    await render(); await respond(); await render({ homeReloadKey: 1 });
    expect(current()).toMatchObject({ loading: true, updatedAt, ...payout });
    await respond(1, { ok: false, error: "internal details must stay hidden" }, 503);
    expect(current()).toMatchObject({ loading: false, updatedAt, ...payout });
    expect(current().error).toContain("Výplatu se nepodařilo načíst úplně");
    expect(current().error).not.toContain("internal details");
    await render({ homeReloadKey: 2 });
    await respond(2, complete({ payout: { grossAmount: 200, stornoFundAmount: 20, netAmount: 180 }, updatedAt: updatedAt + 1 }));
    expect(current()).toMatchObject({ loading: false, error: null, netAmount: 180, updatedAt: updatedAt + 1 });
  });

  it("hides old amounts immediately when the advisor or signed-in actor changes", async () => {
    await render(); await respond(); await render({ advisorDataEmail: "another@example.test" });
    expect(current()).toMatchObject({ loading: true, updatedAt: undefined, netAmount: 0 });
    await respond(1);
    const otherUser = { uid: "other-actor", getIdToken: vi.fn(async () => "other-synthetic") } as unknown as User;
    mocks.auth.currentUser = otherUser;
    await render({ advisorDataEmail: "another@example.test", user: otherUser });
    expect(current()).toMatchObject({ loading: true, updatedAt: undefined, netAmount: 0 });
  });

  it("rejects late responses after a new reload starts", async () => {
    await render(); const firstSignal = requests[0].init.signal!;
    await render({ homeReloadKey: 1 }); expect(firstSignal.aborted).toBe(true);
    await respond(1, complete({ payout: { ...payout, netAmount: 180 } }));
    await respond(0, complete({ payout: { ...payout, netAmount: 999 } }));
    expect(current()).toMatchObject({ loading: false, netAmount: 180 });
  });

  it("ignores late responses when the auth identity changes before a parent render", async () => {
    await render(); mocks.auth.currentUser = { uid: "another-actor" }; await respond();
    expect(current()).toMatchObject({ loading: true, updatedAt: undefined, netAmount: 0 });
  });

  it("captures impersonation scope and discards responses after its context changes", async () => {
    mocks.impersonatedEmail = "represented@example.test";
    await render({ advisorDataEmail: mocks.impersonatedEmail });
    expect(requests[0].init.headers).toMatchObject({ "x-bohemika-impersonate-email": "represented@example.test" });
    mocks.impersonatedEmail = "another@example.test"; await respond();
    expect(current()).toMatchObject({ loading: true, updatedAt: undefined, netAmount: 0 });
  });

  it("refreshes an expired token once and then accepts the summary", async () => {
    await render(); await respond(0, { ok: false }, 401);
    expect(user.getIdToken).toHaveBeenCalledTimes(2); expect(user.getIdToken).toHaveBeenLastCalledWith(true);
    await respond(1); expect(current()).toMatchObject({ loading: false, error: null, ...payout });
  });

  it("stops after one token refresh when authorization still fails", async () => {
    await render(); await respond(0, { ok: false }, 401); await respond(1, { ok: false }, 401);
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(current().error).toBeTruthy();
    expect(mocks.fallback).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false }, complete({ monthKey: "2026-9" }), complete({ payout: { grossAmount: 100, netAmount: 90 } }),
    complete({ payout: { ...payout, netAmount: "90" } }), complete({ payout: { ...payout, grossAmount: Number.POSITIVE_INFINITY } }),
    complete({ updatedAt: 0 }), complete({ updatedAt: "1790000000000" }), null,
  ])("rejects incomplete or malformed summaries without showing false zero: %j", async payload => {
    await render(); await respond(0, payload);
    expect(current()).toMatchObject({ loading: false, updatedAt: undefined }); expect(current().error).toBeTruthy();
    expect(mocks.fallback).not.toHaveBeenCalled();
  });

  it("accepts finite negative net amounts", async () => {
    await render(); await respond(0, complete({ payout: { ...payout, netAmount: -5 } }));
    expect(current()).toMatchObject({ loading: false, error: null, netAmount: -5 });
  });

  it("refreshes and clears previous-month amounts when the calendar month changes", async () => {
    await render(); await respond(); mocks.month = "2026-10"; await render();
    expect(current()).toMatchObject({ loading: true, updatedAt: undefined, netAmount: 0 });
    await respond(1, complete({ monthKey: "2026-11" })); expect(current()).toMatchObject({ loading: false, error: null, ...payout });
  });

  it("settles without requesting data when no advisor is available", async () => {
    await render({ advisorDataEmail: null }); expect(fetchMock).not.toHaveBeenCalled();
    expect(current()).toMatchObject({ loading: false, error: null, updatedAt: undefined });
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("aborts on unmount and never commits a late response", async () => {
    await render(); const signal = requests[0].init.signal!, commits = mocks.section.mock.calls.length;
    await act(async () => root!.unmount()); root = null; expect(signal.aborted).toBe(true);
    await respond(); expect(mocks.section).toHaveBeenCalledTimes(commits); expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("does not start a request if identity changes while its token is pending", async () => {
    let resolveToken!: (token: string) => void;
    vi.mocked(user.getIdToken).mockReturnValueOnce(new Promise(resolve => { resolveToken = resolve; }));
    await render(); mocks.auth.currentUser = null; await act(async () => resolveToken("synthetic"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([409, 503])("loads the legacy calculation only on explicit fallback status %s", async status => {
    await render(); await respond(0, { ok: false, code: "client_calculation_required" }, status);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mocks.fallback).toHaveBeenCalled();
    expect(mocks.fallback.mock.calls.at(-1)![0]).toMatchObject({ user, advisorDataEmail: "advisor@example.test", homeReloadKey: 0 });
    expect(onLoadingChange).toHaveBeenLastCalledWith(true);
    await act(async () => mocks.fallback.mock.calls.at(-1)![0].onLoadingChange(false));
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    await render({ homeReloadKey: 1 }); expect(current().loading).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(2);
    await respond(1); expect(current()).toMatchObject({ loading: false, error: null, ...payout });
  });

  it.each([403, 500])("does not bypass server denial or ordinary errors with fallback: %s", async status => {
    await render(); await respond(0, { ok: false, code: "client_calculation_required" }, status);
    expect(current()).toMatchObject({ loading: false, updatedAt: undefined }); expect(current().error).toBeTruthy();
    expect(mocks.fallback).not.toHaveBeenCalled();
  });
});
