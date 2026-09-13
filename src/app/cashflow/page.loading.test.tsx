// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { email: "advisor@example.test", getIdToken: vi.fn().mockResolvedValue("test-token") },
  profile: vi.fn(),
  cashflow: vi.fn(),
  workerView: vi.fn(),
}));

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../firebase", () => ({ auth: { currentUser: mocks.user } }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: typeof mocks.user) => void) => {
    callback(mocks.user);
    return () => {};
  },
}));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("./useCashflowData", () => ({ useCashflowData: mocks.cashflow }));
vi.mock("./cashflowWorker.client", () => ({
  createCashflowWorkerClient: () => ({ view: mocks.workerView, month: vi.fn(), dispose: vi.fn() }),
}));

import CashflowPage from "./page";
import type { useCashflowData } from "./useCashflowData";
import type { CashflowOverview } from "./cashflowWorker.types";

describe("cashflow initial loading", () => {
  let container: HTMLDivElement;
  let root: Root;
  let cashflow: ReturnType<typeof useCashflowData>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, items: [] })));
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED", "0");
    localStorage.clear();
    sessionStorage.clear();
    mocks.profile.mockResolvedValue({ hasProfile: true, profile: { accountType: "advisor" } });
    cashflow = {
      loading: true,
      ready: false,
      rawSnapshot: null,
      calculationDeferred: false,
      cashflowItems: [],
      verificationInput: null,
      hasTeam: false,
      loadingProgress: { percent: 50, label: "Načítám smlouvy", detail: null },
    };
    mocks.cashflow.mockImplementation(() => cashflow);
    mocks.workerView.mockImplementation(() => new Promise(() => {}));
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
    vi.unstubAllEnvs();
  });

  const render = () => act(async () => root.render(<CashflowPage />));
  const loader = () => container.querySelector('[role="progressbar"]');
  const readyContent = () => container.textContent?.includes("Zatím nemáš žádné smlouvy");

  it("shows ready content without advancing timers, and hides it again during a reload", async () => {
    await render();
    expect(loader()).not.toBeNull();
    expect(readyContent()).toBe(false);

    cashflow.ready = true;
    await render();
    expect(loader()).not.toBeNull();

    cashflow.loading = false;
    await render();
    expect(loader()).toBeNull();
    expect(readyContent()).toBe(true);

    cashflow.loading = true;
    await render();
    expect(loader()).not.toBeNull();
    expect(readyContent()).toBe(false);
  });

  it("waits for the profile even when cashflow is already cached and ready", async () => {
    let resolveProfile!: (value: { hasProfile: boolean }) => void;
    mocks.profile.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
    cashflow.ready = true;
    cashflow.loading = false;
    await render();
    expect(loader()).not.toBeNull();
    expect(readyContent()).toBe(false);
    expect(mocks.cashflow).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));

    await act(async () => resolveProfile({ hasProfile: true }));
    expect(loader()).toBeNull();
    expect(readyContent()).toBe(true);
    expect(mocks.cashflow).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("shows the account setup message when there is no internal profile", async () => {
    mocks.profile.mockResolvedValue({ hasProfile: false });
    await render();
    expect(loader()).toBeNull();
    expect(container.textContent).toContain("Nejdřív dokonči nastavení účtu.");
    expect(readyContent()).toBe(false);
    expect(mocks.cashflow).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("shows a profile failure instead of keeping the loading screen", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.profile.mockRejectedValue(new Error("synthetic profile failure"));
    await render();
    expect(loader()).toBeNull();
    expect(container.textContent).toContain("Nepodařilo se načíst profil uživatele.");
    expect(readyContent()).toBe(false);
    expect(mocks.cashflow).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  function enableDeferredData() {
    cashflow.ready = true;
    cashflow.loading = false;
    cashflow.calculationDeferred = true;
    cashflow.rawSnapshot = {
      email: mocks.user.email, myPosition: null, myCommissionMode: null, hasAnyTeam: false,
      ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
    };
  }

  it("keeps amounts unavailable until the worker result arrives, without claiming an empty portfolio", async () => {
    enableDeferredData();
    let resolveView!: (overview: CashflowOverview) => void;
    mocks.workerView.mockImplementation(() => new Promise(resolve => { resolveView = resolve; }));
    await render();
    expect(container.querySelector('header strong')?.textContent).toBe("…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('section[data-year]')).toBeNull();
    expect(readyContent()).toBe(false);
    await act(async () => resolveView({ months: [], contractSearchStats: { itemCount: 0, contractCount: 0, summary: null } }));
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(readyContent()).toBe(true);
  });

  it("shows an unavailable amount and an error if both worker and fallback fail", async () => {
    enableDeferredData();
    mocks.workerView.mockRejectedValue(new Error("Synthetic calculation failure"));
    await render();
    expect(container.querySelector('header strong')?.textContent).toBe("—");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Přehled se nepodařilo spočítat");
    expect(container.querySelector('section[data-year]')).toBeNull();
    expect(readyContent()).toBe(false);
  });
});
