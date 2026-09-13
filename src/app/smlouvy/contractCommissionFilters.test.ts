import type { ContractDoc as ApiContract } from "@/app/api/contracts/_lib/contractsApi.types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commissionAuditSummaryForContract } from "@/app/lib/commissionAudit";
import { contractMatchesListFilters, parseContractListFilters } from "@/app/api/contracts/_lib/contractsApi.listFilters";
import { filterDisplayedContracts } from "./contractsPageFiltering";
import { emptyContractFilterSelection } from "./contractFilterSelection";
import type { CommissionAuditFilterCode, CommissionAuditFilterMode, DisplayedContract } from "./contractsPageTypes";

const owner = "advisor@example.test";
const base = (id: string, values: Partial<DisplayedContract> = {}): DisplayedContract => ({
  id, userEmail: owner, productKey: "kooperativaAuto", frequencyRaw: "annual", position: "poradce3",
  inputAmount: 3000, policyStartDate: "2026-07-01", contractSignedDate: "2026-07-01",
  items: [{ title: "Okamžitá provize", code: "A101", amount: 100 }], ...values,
});
function matches(item: DisplayedContract, mode: CommissionAuditFilterMode, code: CommissionAuditFilterCode = "all") {
  const client = filterDisplayedContracts([item], { ...emptyContractFilterSelection(), query: "", commissionAuditMode: mode, commissionAuditCodeFilter: code }, false).length > 0;
  const server = contractMatchesListFilters(item as ApiContract, parseContractListFilters(new URLSearchParams({ commissionAudit: mode, commissionCode: code })), owner);
  expect(server).toBe(client); return client;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00+02:00")); });
afterEach(() => vi.useRealTimers());

describe("commission filters using real cashflow and payout calculations", () => {
  it("distinguishes all six commission modes in the page and API", () => {
    const overdue = base("overdue");
    const upcoming = base("upcoming", { policyStartDate: "2026-09-10", contractSignedDate: "2026-09-10" });
    const difference = base("difference", { items: [], commissionPayouts: [{ key: "diff", code: "A101", amount: 80, expectedAmount: 100, difference: -20, status: "difference" }] });
    const career = base("career", { items: [], commissionPayouts: [{ key: "career", code: "A101", amount: 80, expectedAmount: 100, difference: -20, status: "difference", differenceReason: "career_mismatch", career: "2" }] });
    const items = [overdue, upcoming, difference, career];
    for (const [mode, expected] of [
      ["off", [true, true, true, true]], ["all", [true, true, true, true]],
      ["overdue", [true, false, false, false]], ["upcoming", [false, true, false, false]],
      ["difference", [false, false, true, true]], ["career_mismatch", [false, false, false, true]],
    ] as const) expect(items.map(item => matches(item, mode)), mode).toEqual(expected);
  });

  it.each([
    ["a101", ["A101", "A112", "APZ101", "AZ107"], ["A113", "B101"]],
    ["b0301", ["B0301", "B301"], ["B36", "A101"]],
    ["b36", ["B36", "B036", "B3601", "B36_HALF", "B036_HALF"], ["B48", "B301"]],
    ["b48", ["B48", "B048", "B4801"], ["B36", "B101"]],
    ["subsequent", ["B101", "B104", "B101-B104", "B201", "B206", "B201-B206"], ["B301", "B36", "A101"]],
    ["all", ["A101", "B301", "B36", "B48", "B101", "B201"], []],
  ] as [CommissionAuditFilterCode, string[], string[]][])("recognizes %s code aliases and rejects other groups", (filter, accepted, rejected) => {
    for (const code of [...accepted, ...rejected]) {
      const item = base(code, { items: [], commissionPayouts: [{ key: code, code, amount: 80, expectedAmount: 100, difference: -20, status: "difference" }] });
      expect(matches(item, "difference", filter), code).toBe(accepted.includes(code));
    }
  });

  it("excludes settled commissions, cancelled policies and unsupported gold products", () => {
    const settled = base("settled", { commissionPayouts: [{ key: "paid", code: "APZ101", amount: 100, status: "paid", payoutMonthKey: "2026-8", writtenBy: owner }] });
    expect(matches(settled, "overdue")).toBe(false);
    expect(matches(base("storno", { status: "storno" }), "all")).toBe(false);
    expect(matches(base("gold", { productKey: "comfortcc" }), "all")).toBe(false);
  });

  it("does not include old overdue or distant future commissions outside the shown windows", () => {
    const old = base("old", { policyStartDate: "2025-11-01", contractSignedDate: "2025-11-01" });
    const distant = base("future", { policyStartDate: "2027-03-01", contractSignedDate: "2027-03-01" });
    expect(commissionAuditSummaryForContract(old, { mode: "overdue", viewerEmail: owner }).overdueCount).toBe(0);
    expect(commissionAuditSummaryForContract(distant, { mode: "upcoming", viewerEmail: owner }).upcomingCount).toBe(0);
  });
});
