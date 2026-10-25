import { describe, expect, it } from "vitest";
import { calendarDate } from "@/app/lib/calendarDates";
import { applyStatementMissingPayoutShifts, normalizeContractNumberSearch, toDate } from "./helpers";
import type { CashflowCommissionStatementSummary, CashflowItem } from "./types";

// Frozen original reconciliation before adding per-call monthly indexes. Keep
// the former array scans and prefix matching as an independent regression oracle.
const monthKeyFromDate = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth() + 1}`;


const addMonths = (date: Date, months: number): Date =>
  calendarDate(date, date.getFullYear(), date.getMonth() + months, date.getDate());

const monthSerial = (date: Date): number =>
  date.getFullYear() * 12 + date.getMonth();

const isStornoStatus = (status: CashflowItem["contractStatus"]): boolean => {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
  );
};

const isOnOrAfterStornoMonth = (item: CashflowItem, date: Date): boolean => {
  if (!isStornoStatus(item.contractStatus)) return false;
  const stornoDate = toDate(item.stornoDate, { calendar: date });
  if (!stornoDate) return false;
  return monthSerial(date) >= monthSerial(stornoDate);
};


const paidContractSetForStatements = (
  statements: CashflowCommissionStatementSummary[] | undefined
): Set<string> => {
  const paidContracts = new Set<string>();
  for (const statement of statements ?? []) {
    for (const contractNumber of statement.paidContractNumbers ?? []) {
      const normalized = normalizeContractNumberSearch(contractNumber);
      if (normalized) paidContracts.add(normalized);
    }
  }
  return paidContracts;
};

const paidCommissionKeySetForStatements = (
  statements: CashflowCommissionStatementSummary[] | undefined
): Set<string> => {
  const paidCommissionKeys = new Set<string>();
  for (const statement of statements ?? []) {
    for (const key of statement.paidCommissionKeys ?? []) {
      const normalized = key.trim().toUpperCase();
      if (normalized) paidCommissionKeys.add(normalized);
    }
  }
  return paidCommissionKeys;
};

const commissionCodesForItem = (item: CashflowItem): string[] => {
  const codes = new Set<string>();
  if (item.commissionCode) codes.add(item.commissionCode);
  for (const alias of item.commissionCodeAliases ?? []) codes.add(alias);
  return [...codes]
    .map((code) => code.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
};

const hasPaidCommissionForItem = ({
  item,
  normalizedContractNumber,
  paidContracts,
  paidCommissionKeys,
}: {
  item: CashflowItem;
  normalizedContractNumber: string;
  paidContracts: Set<string>;
  paidCommissionKeys: Set<string>;
}): boolean => {
  const commissionCodes = commissionCodesForItem(item);
  const hasAnyPaidCodeForContract = [...paidCommissionKeys].some((key) =>
    key.startsWith(`${normalizedContractNumber.toUpperCase()}:`)
  );
  if (hasAnyPaidCodeForContract) {
    if (commissionCodes.length === 0) {
      return item.productKey === "comfortcc" && paidContracts.has(normalizedContractNumber);
    }

    return commissionCodes.some((code) =>
      paidCommissionKeys.has(`${normalizedContractNumber.toUpperCase()}:${code}`)
    );
  }

  return paidContracts.has(normalizedContractNumber);
};

const statementPeriodLabels = (
  statements: CashflowCommissionStatementSummary[] | undefined
): string[] =>
  [...new Set((statements ?? []).map((statement) => statement.period).filter(Boolean) as string[])];

function originalStatementMissingPayoutShifts({
  cashflowItems,
  statementsByMonthKey,
  enabled,
}: {
  cashflowItems: CashflowItem[];
  statementsByMonthKey: Record<string, CashflowCommissionStatementSummary[]>;
  enabled: boolean;
}): CashflowItem[] {
  if (!enabled) return cashflowItems;

  return cashflowItems.flatMap((item): CashflowItem[] => {
    if (item.isTipPayout || item.isSubscriptionPayment) return [item];
    if (item.payoutStatus === "paid") return [item];

    const normalizedContractNumber = normalizeContractNumberSearch(item.contractNumber);
    if (!normalizedContractNumber) return [{ ...item, payoutStatus: "predicted" }];

    let date = item.date;
    let shifted = false;
    const missedStatementPeriods: string[] = [];

    for (let guard = 0; guard < 24; guard += 1) {
      if (isOnOrAfterStornoMonth(item, date)) return [];

      const monthKey = monthKeyFromDate(date);
      const statements = statementsByMonthKey[monthKey];
      if (!statements || statements.length === 0) {
        return [{
          ...item,
          id: shifted ? `${item.id}-shifted-${monthKey}` : item.id,
          date,
          payoutStatus: shifted ? "shifted" : "predicted",
          originalDate: shifted ? item.date : null,
          missedStatementPeriods,
        }];
      }

      const paidContracts = paidContractSetForStatements(statements);
      const paidCommissionKeys = paidCommissionKeySetForStatements(statements);
      if (paidContracts.size === 0) {
        return [{
          ...item,
          id: shifted ? `${item.id}-shifted-${monthKey}` : item.id,
          date,
          payoutStatus: shifted ? "shifted" : "predicted",
          originalDate: shifted ? item.date : null,
          missedStatementPeriods,
        }];
      }

      if (
        hasPaidCommissionForItem({
          item,
          normalizedContractNumber,
          paidContracts,
          paidCommissionKeys,
        })
      ) {
        return [{
          ...item,
          id: shifted ? `${item.id}-paid-shifted-${monthKey}` : item.id,
          date,
          payoutStatus: "paid",
          originalDate: shifted ? item.date : null,
          missedStatementPeriods,
        }];
      }

      missedStatementPeriods.push(...statementPeriodLabels(statements));
      date = addMonths(date, 1);
      shifted = true;
    }

    const fallbackMonthKey = monthKeyFromDate(date);
    if (isOnOrAfterStornoMonth(item, date)) return [];

    return [{
      ...item,
      id: `${item.id}-shifted-${fallbackMonthKey}`,
      date,
      payoutStatus: "shifted",
      originalDate: item.date,
      missedStatementPeriods,
    }];
  });
}

type StatementsByMonth = Record<string, CashflowCommissionStatementSummary[]>;
const statement = (overrides: Partial<CashflowCommissionStatementSummary> = {}): CashflowCommissionStatementSummary => ({
  id: "statement", fileName: "synthetic.html", statementNumber: "1", statementDate: null,
  period: "synthetic period", advisorNumber: null, periodStartMs: null, periodEndMs: null,
  statementDateMs: null, payoutMonthKey: "2026-1", paidContractNumbers: ["OTHER"],
  paidCommissionKeys: ["OTHER:A101"], commissionTotal: 0, payoutTotal: null,
  otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: null, updatedAtMs: null,
  ...overrides,
});
const item = (overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id: "item", date: new Date(2026, 0, 25), amount: 100, productKey: "neon",
  contractNumber: "CONTRACT-1", commissionCode: "A101", ownerEmail: null, entryId: null,
  ...overrides,
});
const reconcile = (cashflowItems: CashflowItem[], statementsByMonthKey: StatementsByMonth, enabled = true) =>
  applyStatementMissingPayoutShifts({ cashflowItems, statementsByMonthKey, enabled });
const original = (cashflowItems: CashflowItem[], statementsByMonthKey: StatementsByMonth, enabled = true) =>
  originalStatementMissingPayoutShifts({ cashflowItems, statementsByMonthKey, enabled });

describe("indexed statement reconciliation equivalence", () => {
  it("preserves paid aliases, Comfort fallback, shifts, empty months and bypassed sources", () => {
    const statements: StatementsByMonth = {
      "2026-1": [statement({ paidContractNumbers: ["CONTRACT-1", "COMFORT-1", "NO-CODE", "NEXT"],
        paidCommissionKeys: ["CONTRACT1:A102", "COMFORT1:A101", "NOCODE:A101", "NEXT:B101"] })],
      "2026-2": [statement({ period: "second month", paidContractNumbers: ["NEXT"], paidCommissionKeys: [] })],
      "2026-3": [statement({ period: "empty paid contracts", paidContractNumbers: [], paidCommissionKeys: [] })],
    };
    const items = [
      item({ id: "alias", commissionCodeAliases: [" A 1 0 2 "] }),
      item({ id: "comfort", productKey: "comfortcc", contractNumber: "COMFORT-1", commissionCode: null }),
      item({ id: "missing-code", contractNumber: "NO-CODE", commissionCode: null }),
      item({ id: "shifted-paid", contractNumber: "NEXT", commissionCode: "A101" }),
      item({ id: "missing-number", contractNumber: null }),
      item({ id: "already-paid", payoutStatus: "paid" }),
      item({ id: "tip", isTipPayout: true }),
      item({ id: "subscription", isSubscriptionPayment: true }),
      item({ id: "no-statements", date: new Date(2026, 4, 25) }),
      item({ id: "no-paid-contracts", date: new Date(2026, 2, 25) }),
    ];
    const before = structuredClone({ items, statements });

    const actual = reconcile(items, statements);
    expect(actual).toEqual(original(items, statements));
    expect(actual.find(row => row.id === "alias")?.payoutStatus).toBe("paid");
    expect(actual.find(row => row.id === "comfort")?.payoutStatus).toBe("paid");
    expect(actual.find(row => row.id.startsWith("shifted-paid"))).toMatchObject({
      date: new Date(2026, 1, 25), payoutStatus: "paid", missedStatementPeriods: ["synthetic period"],
    });
    expect({ items, statements }).toEqual(before);
    expect(reconcile(items, statements, false)).toBe(items);
  });

  it.each([
    "CONTRACT1:", "CONTRACT1::A101", "CONTRACT1:A101:EXTRA", "CONTRACT1", "CONTRACT1X:A101",
    "XCONTRACT1:A101", "CONTRACT-1:A101", " contract1:a101 ", "CONTRACT1:A 101", ":A101",
  ])("retains original prefix and code behavior for malformed key %s", key => {
    const statements = { "2026-1": [statement({ paidContractNumbers: ["CONTRACT-1"], paidCommissionKeys: [key] })] };
    const items = [item(), item({ id: "comfort", productKey: "comfortcc", commissionCode: null }),
      item({ id: "no-code", commissionCode: null })];

    expect(reconcile(items, statements)).toEqual(original(items, statements));
  });

  it("preserves the 24-month guard, distinct periods, leap rollover and storno cutoffs", () => {
    const statements: StatementsByMonth = {};
    for (let offset = 0; offset < 26; offset++) {
      const date = new Date(2024, offset, 1);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      statements[key] = [statement({ id: key, period: key }), statement({ id: `${key}-duplicate`, period: key })];
    }
    const items = [
      item({ id: "guard", date: new Date(2024, 0, 25) }),
      item({ id: "leap", date: new Date(2024, 0, 31) }),
      item({ id: "storno-during-shift", date: new Date(2024, 0, 25), contractStatus: "stornována", stornoDate: new Date(2024, 2, 1) }),
      item({ id: "storno-before", date: new Date(2024, 2, 25), contractStatus: "storno", stornoDate: new Date(2024, 2, 30) }),
    ];

    const actual = reconcile(items, statements);
    expect(actual).toEqual(original(items, statements));
    expect(actual.find(row => row.id.startsWith("guard"))).toMatchObject({
      date: new Date(2026, 0, 25), payoutStatus: "shifted", missedStatementPeriods: Object.keys(statements).slice(0, 24),
    });
    expect(actual.some(row => row.id.startsWith("storno"))).toBe(false);
  });

  it("builds fresh account/month indexes for each call without retaining stale statement changes", () => {
    const firstStatements = { "2026-1": [statement({ paidContractNumbers: ["CONTRACT-1"], paidCommissionKeys: ["CONTRACT1:A101"] })] };
    expect(reconcile([item()], firstStatements)[0].payoutStatus).toBe("paid");
    firstStatements["2026-1"][0].paidCommissionKeys = ["CONTRACT1:B101"];

    expect(reconcile([item()], firstStatements)).toEqual(original([item()], firstStatements));
    expect(reconcile([item()], firstStatements)[0].payoutStatus).toBe("shifted");
    const otherStatements = { "2026-1": [statement({ paidContractNumbers: ["OTHER"], paidCommissionKeys: [] })] };
    expect(reconcile([item()], otherStatements)[0].payoutStatus).toBe("shifted");
  });
});

describe("statement reconciliation scan cost", () => {
  it("reads each month's source arrays and period labels once instead of once per shifted item", () => {
    const scans = { contracts: 0, codes: 0, periods: 0 };
    const statements: StatementsByMonth = {};
    for (let month = 1; month <= 3; month++) {
      const row = statement();
      Object.defineProperties(row, {
        paidContractNumbers: { get: () => { scans.contracts++; return ["OTHER"]; } },
        paidCommissionKeys: { get: () => { scans.codes++; return ["OTHER:A101"]; } },
        period: { get: () => { scans.periods++; return `month-${month}`; } },
      });
      statements[`2026-${month}`] = [row];
    }
    const items = Array.from({ length: 500 }, (_, index) => item({ id: String(index) }));
    const before = original(items, statements);
    expect(scans).toEqual({ contracts: 1500, codes: 1500, periods: 1500 });
    scans.contracts = 0; scans.codes = 0; scans.periods = 0;

    expect(reconcile(items, statements)).toEqual(before);
    expect(scans).toEqual({ contracts: 3, codes: 3, periods: 3 });
  });

  it("matches the frozen calculation for many synthetic items and reports an optional benchmark", () => {
    const items = Array.from({ length: 1000 }, (_, index) => item({
      id: String(index), contractNumber: `CONTRACT-${index}`, commissionCode: index % 2 ? "A101" : "B101",
      commissionCodeAliases: index % 3 ? [] : ["B102"],
    }));
    const paidContractNumbers = items.map(row => row.contractNumber!);
    const paidCommissionKeys = paidContractNumbers.map((number, index) =>
      `${normalizeContractNumberSearch(number).toUpperCase()}:${index % 2 ? "A101" : "B102"}`);
    const statements = { "2026-1": [statement({ paidContractNumbers, paidCommissionKeys })] };
    const samples = process.env.CASHFLOW_RECONCILIATION_BENCHMARK === "1" ? 7 : 1;
    const beforeTimes: number[] = [];
    const afterTimes: number[] = [];
    for (let iteration = 0; iteration < samples; iteration++) {
      let before: CashflowItem[] = [];
      let after: CashflowItem[] = [];
      const measureBefore = () => { const start = performance.now(); before = original(items, statements); beforeTimes.push(performance.now() - start); };
      const measureAfter = () => { const start = performance.now(); after = reconcile(items, statements); afterTimes.push(performance.now() - start); };
      if (iteration % 2) { measureAfter(); measureBefore(); } else { measureBefore(); measureAfter(); }
      expect(after).toEqual(before);
    }
    if (samples > 1) {
      const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
      console.info(JSON.stringify({ benchmark: "statement_reconciliation", items: items.length,
        paidKeys: paidCommissionKeys.length, samples, beforeMedianMs: median(beforeTimes), afterMedianMs: median(afterTimes) }));
    }
  });
});
