// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { CashflowFilters } from "./components/CashflowFilters";
import type { CashflowSnapshot } from "./computeCashflow";
import type { CashflowItem } from "./types";

const mocks = vi.hoisted(() => ({
  user: { uid: "synthetic-advisor", email: "advisor@example.test", getIdToken: vi.fn().mockResolvedValue("synthetic-token") },
  data: vi.fn(), filters: vi.fn(), view: vi.fn(),
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("../firebase", () => ({ auth: { currentUser: mocks.user } }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: typeof mocks.user) => void) => {
  callback(mocks.user);
  return () => {};
} }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: async () => ({ hasProfile: true, profile: { accountType: "advisor" } }) }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({
  useEffectiveUserEmail: () => mocks.user.email,
  effectiveUserEmail: () => mocks.user.email,
}));
vi.mock("./useCashflowData", () => ({ useCashflowData: mocks.data }));
vi.mock("./useCashflowView", () => ({ useCashflowView: mocks.view }));
vi.mock("./components/CashflowFilters", () => ({ CashflowFilters: (props: ComponentProps<typeof CashflowFilters>) => {
  mocks.filters(props);
  return <input aria-label="Číslo smlouvy" value={props.contractNumberQuery} readOnly />;
} }));
vi.mock("./helpers", async importOriginal => {
  const actual = await importOriginal<typeof import("./helpers")>();
  return { ...actual, filterItemsByContractNumber: vi.fn(actual.filterItemsByContractNumber) };
});

import CashflowPage from "./page";
import { filterItemsByContractNumber } from "./helpers";

describe("cashflow search calculation wiring", () => {
  let root: Root;
  let container: HTMLDivElement;
  const filters = () => mocks.filters.mock.lastCall![0] as ComponentProps<typeof CashflowFilters>;
  const options = () => mocks.view.mock.lastCall![0].options;
  const input = (value: string) => act(async () => filters().onContractNumberChange(value));
  const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, items: [], hasMore: false, processingComplete: true })));
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED", "0");
    mocks.view.mockReturnValue({ overview: null, pending: false, error: null, loadMonth: vi.fn() });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([false, true])("debounces the applied query with worker mode %s while input stays immediate", async worker => {
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_WORKER_ENABLED", worker ? "1" : "0");
    const snapshot: CashflowSnapshot = {
      email: mocks.user.email, myPosition: null, myCommissionMode: null, hasAnyTeam: false,
      ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
    };
    const items: CashflowItem[] = [{ id: "synthetic-item", entryId: "synthetic-contract", ownerEmail: mocks.user.email, date: new Date(2026, 9, 20),
      amount: 100, productKey: "cppAuto", contractNumber: "AB12", clientName: "Syntetický klient" }];
    mocks.data.mockReturnValue({ loading: false, ready: true, rawSnapshot: snapshot, calculationDeferred: worker,
      cashflowItems: worker ? [] : items, hasTeam: false, verificationInput: null,
      loadingProgress: { percent: 100, label: "Ready", detail: null } });
    await act(async () => root.render(<CashflowPage />));
    const initialOptions = options();
    const initialFilterCalls = vi.mocked(filterItemsByContractNumber).mock.calls.length;

    await input("A");
    await advance(100);
    await input("AB 12");
    expect(container.querySelector("input")!.value).toBe("AB 12");
    expect(filters().calculating).toBe(true);
    expect(filters().contractNumberSearchActive).toBe(true);
    await advance(199);
    expect(options()).toBe(initialOptions);
    expect(vi.mocked(filterItemsByContractNumber).mock.calls).toHaveLength(initialFilterCalls);

    await advance(1);
    expect(options().contractNumberQuery).toBe("ab12");
    expect(vi.mocked(filterItemsByContractNumber).mock.lastCall![1]).toBe("ab12");
    expect(filters().calculating).toBe(false);
    if (!worker) expect(filters().contractNumberMatchCount).toBe(1);

    await input("");
    expect(options().contractNumberQuery).toBe("");
    expect(filters().contractNumberSearchActive).toBe(false);
    await advance(200);
    expect(options().contractNumberQuery).toBe("");
  });
});
