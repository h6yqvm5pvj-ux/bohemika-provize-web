// @vitest-environment happy-dom

import { act, StrictMode, useLayoutEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CashflowCommissionStatementSummary } from "./types";

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  email: "advisor@example.test",
  authListener: null as ((user: User | null) => void) | null,
  onCommit: undefined as (() => void) | undefined,
  modal: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => {
  useLayoutEffect(() => { mocks.onCommit?.(); });
  return <main>{children}</main>;
} }));
vi.mock("../firebase", () => ({ auth: { get currentUser() { return mocks.user; } } }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void) => {
  mocks.authListener = callback;
  callback(mocks.user);
  return () => { mocks.authListener = null; };
} }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({
  useEffectiveUserEmail: () => mocks.email,
  effectiveUserEmail: () => mocks.email,
}));
vi.mock("./components/CashflowMonthModal", () => ({ CashflowMonthModal: (props: unknown) => {
  mocks.modal(props);
  return null;
} }));
vi.mock("./useCashflowData", () => ({ useCashflowData: () => ({
  loading: false, ready: true, rawSnapshot: null, calculationDeferred: false,
  cashflowItems: [], verificationInput: null, hasTeam: false,
  loadingProgress: { percent: 100, label: "Ready", detail: null },
}) }));
import CashflowPage from "./page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const makeUser = (uid = "advisor-uid", email = "advisor@example.test") => ({
  uid, email, getIdToken: vi.fn().mockResolvedValue("synthetic-test-token"),
}) as unknown as User;
const statement = (id: string): CashflowCommissionStatementSummary => ({
  id, fileName: `${id}.html`, statementNumber: id, statementDate: null, period: null, advisorNumber: null,
  periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: null,
  paidContractNumbers: [], paidCommissionKeys: [], commissionTotal: 10, payoutTotal: 10,
  otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: null, updatedAtMs: null,
});
const htmlResponse = (id: string) => Response.json({ ok: true, item: { ...statement(id), html: `<article>Synthetic statement ${id}</article>` } });
const listResponse = () => Response.json({ ok: true, items: [], hasMore: false, processingComplete: true });

describe("commission statement preview scope and request ownership", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let requests: Array<{ id: string; signal: AbortSignal; job: ReturnType<typeof deferred<Response>> }>;
  let request: ReturnType<typeof vi.fn<typeof fetch>>;
  const modal = () => mocks.modal.mock.lastCall![0] as {
    statementLoadingId: string | null;
    onOpenStatement: (summary: CashflowCommissionStatementSummary) => Promise<void>;
  };
  const html = () => container.querySelector("iframe")?.getAttribute("srcdoc") ?? null;
  const render = async (strict = false) => {
    await act(async () => root!.render(strict ? <StrictMode><CashflowPage /></StrictMode> : <CashflowPage />));
  };
  const open = async (id: string) => {
    await act(async () => { void modal().onOpenStatement(statement(id)); });
  };
  const resolve = async (index: number, id = requests[index].id) => {
    await act(async () => requests[index].job.resolve(htmlResponse(id)));
  };
  const scope = async (user: User | null, email: string) => {
    await act(async () => {
      mocks.email = email;
      if (mocks.user !== user) { mocks.user = user; mocks.authListener?.(user); }
      root!.render(<CashflowPage />);
    });
  };
  const close = async () => {
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Zavřít náhled provizního výpisu"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED", "0");
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_WORKER_ENABLED", "0");
    mocks.user = makeUser();
    mocks.email = "advisor@example.test";
    mocks.onCommit = undefined;
    mocks.modal.mockClear();
    mocks.profile.mockReset().mockResolvedValue({ hasProfile: true, profile: { accountType: "advisor" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    requests = [];
    request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input), "https://example.test");
      if (!url.searchParams.has("includeHtml")) return listResponse();
      const job = deferred<Response>();
      requests.push({ id: url.searchParams.get("id")!, signal: init!.signal!, job });
      // Ignore AbortSignal deliberately to exercise guards against responses
      // that have already escaped transport cancellation.
      return job.promise;
    });
    vi.stubGlobal("fetch", request);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shows loading for the requested statement, opens its HTML and releases it on close", async () => {
    await render();
    await open("first");
    expect(modal().statementLoadingId).toBe("first");
    expect(html()).toBeNull();
    await resolve(0);
    expect(html()).toContain("Synthetic statement first");
    expect(modal().statementLoadingId).toBeNull();
    await close();
    expect(html()).toBeNull();
    expect(requests[0].signal.aborted).toBe(true);
  });

  it.each(["resolve", "reject"])("lets the latest request win when the previous request later %s", async outcome => {
    await render();
    await open("old");
    await open("current");
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => {
      if (outcome === "resolve") requests[0].job.resolve(htmlResponse("old"));
      else requests[0].job.reject(new Error("Old preview failure"));
    });
    expect(html()).toBeNull();
    expect(modal().statementLoadingId).toBe("current");
    expect(container.textContent).not.toContain("Old preview failure");
    await resolve(1);
    expect(html()).toContain("Synthetic statement current");
  });

  it.each(["logout", "uid", "impersonation"])("hides an open statement on the first commit of %s", async changed => {
    await render();
    await open("private-old");
    await resolve(0);
    expect(html()).not.toBeNull();
    let checked = false;
    mocks.onCommit = () => { checked = true; expect(html()).toBeNull(); };
    await scope(changed === "logout" ? null : changed === "uid" ? makeUser("different-uid") : mocks.user,
      changed === "impersonation" ? "other@example.test" : "advisor@example.test");
    mocks.onCommit = undefined;
    expect(checked).toBe(true);
    expect(requests[0].signal.aborted).toBe(true);
    expect(modal().statementLoadingId).toBeNull();
  });

  it.each(["resolve", "reject"])("never restores a late %s after the account switches away and back", async outcome => {
    await render();
    await open("old");
    const user = mocks.user;
    await scope(user, "other@example.test");
    await scope(user, "advisor@example.test");
    await open("current");
    await resolve(1);
    await act(async () => {
      if (outcome === "resolve") requests[0].job.resolve(htmlResponse("old"));
      else requests[0].job.reject(new Error("Previous account preview failure"));
    });
    expect(html()).toContain("Synthetic statement current");
    expect(modal().statementLoadingId).toBeNull();
    expect(container.textContent).not.toContain("Previous account preview failure");
  });

  it("does not send an old account's request when its token resolves after logout", async () => {
    await render();
    const token = deferred<string>();
    vi.mocked(mocks.user!.getIdToken).mockReturnValueOnce(token.promise);
    await open("old");
    expect(requests).toHaveLength(0);
    await scope(null, "");
    await act(async () => token.resolve("synthetic-old-token"));
    expect(requests).toHaveLength(0);
    expect(html()).toBeNull();
  });

  it("does not reopen a closed preview from an earlier request for the same statement", async () => {
    await render();
    await open("same");
    await open("same");
    await resolve(1);
    await close();
    await resolve(0);
    expect(html()).toBeNull();
    expect(modal().statementLoadingId).toBeNull();
  });

  it("clears loading after a current failure and can retry", async () => {
    await render();
    await open("first");
    await act(async () => requests[0].job.resolve(Response.json({ ok: false, error: "Synthetic preview unavailable" }, { status: 503 })));
    expect(container.textContent).toContain("Synthetic preview unavailable");
    expect(modal().statementLoadingId).toBeNull();
    await open("retry");
    expect(container.textContent).not.toContain("Synthetic preview unavailable");
    await resolve(1);
    expect(html()).toContain("Synthetic statement retry");
  });

  it("does not let a late statement-list error overwrite a newer preview error", async () => {
    const list = deferred<Response>();
    request.mockImplementationOnce(() => list.promise);
    await render();
    await open("preview");
    await act(async () => requests[0].job.reject(new Error("Latest preview error")));
    await act(async () => list.reject(new Error("Earlier list error")));
    expect(container.textContent).toContain("Latest preview error");
    expect(container.textContent).not.toContain("Earlier list error");
  });

  it("aborts on unmount and ignores the eventual response", async () => {
    await render();
    await open("old");
    await act(async () => root!.unmount());
    root = null;
    expect(requests[0].signal.aborted).toBe(true);
    await resolve(0);
    expect(container.innerHTML).toBe("");
  });

  it("supports StrictMode effect replay without invalidating the active preview", async () => {
    await render(true);
    await open("strict");
    expect(requests[0].signal.aborted).toBe(false);
    await resolve(0);
    expect(html()).toContain("Synthetic statement strict");
    await close();
    expect(requests[0].signal.aborted).toBe(true);
  });
});
