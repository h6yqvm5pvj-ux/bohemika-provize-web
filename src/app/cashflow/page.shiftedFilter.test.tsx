// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeCashflow, type CashflowComputationOptions, type CashflowSnapshot } from "./computeCashflow";
import { createCashflowModel } from "./cashflowModel";
import type { CashflowWorkerClient } from "./cashflowWorker.client";
import type { CashflowDataset } from "./cashflowWorker.types";
import type { CashflowCommissionStatementSummary, EntryDoc } from "./types";
import { formatMoney } from "./helpers";

const mocks = vi.hoisted(() => ({
  user: { uid: "synthetic-advisor", email: "advisor@example.test", getIdToken: vi.fn(async () => "synthetic-token") },
  data: vi.fn(),
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
vi.mock("./cashflowWorker.client", () => ({
  createCashflowWorkerClient: ({ dataset }: { dataset: CashflowDataset }): CashflowWorkerClient => {
    const model = createCashflowModel(dataset);
    return {
      executionPath: "fallback", view: async options => model.view(options), month: async key => model.month(key),
      verification: () => model.verification!(), dispose: () => model.dispose(),
    };
  },
}));

import CashflowPage from "./page";

const asOf = new Date(2026, 10, 5, 12);
const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const entry = (id: string, contractNumber: string, amount: number, overrides: Partial<EntryDoc> = {}): EntryDoc => ({
  id, contractNumber, clientName: `Syntetický klient ${id}`, userEmail: mocks.user.email,
  productKey: "neon", policyStartDate: "2026-08-15", contractSignedDate: "2026-08-10",
  frequencyRaw: "monthly", status: "active", items: [{ title: "Okamžitá provize", code: "A101", amount }],
  total: amount, ...overrides,
});
const statement = (month: number): CashflowCommissionStatementSummary => ({
  id: `statement-${month}`, fileName: `synthetic-${month}.html`, statementNumber: String(month),
  statementDate: `24.${month}.2026`, period: `${month - 1}/2026`, advisorNumber: null,
  periodStartMs: new Date(2026, month - 2, 1).getTime(), periodEndMs: new Date(2026, month - 1, 0).getTime(),
  statementDateMs: new Date(2026, month - 1, 24).getTime(), payoutMonthKey: `2026-${month}`,
  paidContractNumbers: ["2000002"], paidCommissionKeys: ["2000002:A101"], commissionTotal: month === 9 ? 600 : 0,
  payoutTotal: month === 9 ? 600 : 0, otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: 1, updatedAtMs: 1,
});
const fixture = (): CashflowSnapshot => ({
  email: mocks.user.email, myPosition: "manazer8", myCommissionMode: "standard", hasAnyTeam: true,
  ownEntries: [
    entry("pending", "1000001", 1000),
    entry("paid", "2000002", 600, { commissionPayouts: [{ key: "paid-a101", code: "A101", status: "paid", amount: 600, payoutMonthKey: "2026-9" }] }),
    entry("future", "3000003", 500, { policyStartDate: "2026-12-01", contractSignedDate: "2026-11-05" }),
  ],
  teamEntriesRaw: [entry("team", "4000004", 1000, {
    userEmail: "member@example.test", position: "poradce3", ownerCurrentPosition: "poradce3",
    managerOverrides: [{ email: mocks.user.email, position: "manazer8", commissionMode: "standard",
      total: 200, items: [{ title: "Okamžitá provize", code: "A101", amount: 200 }] }],
  })],
  tipPayouts: [], subscriptionPayments: [],
});

describe.each([false, true])("cashflow shifted filter through the real page (worker: %s)", worker => {
  let root: Root;
  let container: HTMLDivElement;
  const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(node => node.textContent === label)!;
  const click = (label: string) => act(async () => button(label).click());
  const amount = () => text(container.querySelector("header strong")?.textContent);
  const selectProduct = (value: string) => act(async () => {
    const select = container.querySelector("select")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const search = async (value: string) => {
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(200));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_WORKER_ENABLED", worker ? "1" : "0");
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED", "0");
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED", "0");
    localStorage.clear();
    sessionStorage.clear();
    const snapshot = fixture();
    mocks.data.mockImplementation((options: CashflowComputationOptions & { enabled: boolean }) => ({
      ready: true, loading: false, error: null, rawSnapshot: options.enabled ? snapshot : null,
      calculationDeferred: worker, cashflowItems: options.enabled && !worker ? computeCashflow(snapshot, { ...options, asOf }) : [],
      hasTeam: true, verificationInput: null, loadingProgress: { percent: 100, label: "Ready", detail: null },
    }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, items: [statement(9), statement(10)], hasMore: false, processingComplete: true })));
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

  it("shows only unpaid shifted commissions, keeps detail aligned, and restores the full view", async () => {
    await act(async () => root.render(<CashflowPage />));
    const baseline = amount();
    expect(baseline).toBe(text(formatMoney(2300)));

    await click("Jen přesunuté");
    expect(button("Jen přesunuté").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("header")?.textContent).toContain("Čeká na výplatu");
    expect(amount()).toBe(text(formatMoney(1200)));
    const month = container.querySelector<HTMLButtonElement>('[data-calendar-month="10"]')!;
    expect(month.disabled).toBe(false);
    await act(async () => month.click());
    const cards = [...container.querySelectorAll("[data-cashflow-card]")];
    expect(cards).toHaveLength(2);
    expect(cards.map(node => node.textContent).join(" ")).toContain("Syntetický klient pending");
    expect(cards.map(node => node.textContent).join(" ")).toContain("Přesunuto o 2 měsíce");
    expect(cards.map(node => node.textContent).join(" ")).not.toContain("Syntetický klient paid");
    expect(cards.map(node => node.textContent).join(" ")).not.toContain("Syntetický klient future");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Zavřít přehled měsíce"]')!.click());
    await click("Jen přesunuté");
    expect(button("Jen přesunuté").getAttribute("aria-pressed")).toBe("false");
    expect(amount()).toBe(baseline);
    expect(container.querySelector("header")?.textContent).not.toContain("Čeká na výplatu");
  });

  it("combines shifted payouts with own scope, product and search and shows an honest empty selection", async () => {
    await act(async () => root.render(<CashflowPage />));
    await click("Jen přesunuté");
    await click("Vlastní");
    expect(amount()).toBe(text(formatMoney(1000)));
    await selectProduct("auto");
    expect(amount()).toBe(text(formatMoney(0)));
    expect(container.textContent).toContain("V aktuálním výběru nejsou žádné přesunuté výplaty.");
    await selectProduct("life");
    expect(amount()).toBe(text(formatMoney(1000)));
    await search("1000001");
    expect(amount()).toBe(text(formatMoney(1000)));
    await search("2000002");
    expect(amount()).toBe(text(formatMoney(0)));
    expect(container.textContent).toContain("V aktuálním výběru nejsou žádné přesunuté výplaty.");
    expect(container.textContent).not.toContain("Nalezena smlouva");
  });
});
