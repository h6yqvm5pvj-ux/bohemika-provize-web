import { describe, expect, it } from "vitest";

import { buildCashflowView } from "./buildCashflowView";
import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import { groupItemsByMonth } from "./helpers";
import { cashflowCanonicalJson } from "./shadowProtocol";
import { SUBSCRIPTION_CASHFLOW_OWNER_EMAIL } from "./subscriptionCashflow";
import type { CashflowItem } from "./types";
import {
  CASHFLOW_SNAPSHOT_MAX_ITEMS,
  CASHFLOW_SNAPSHOT_WIRE_VERSION,
  parseCashflowSnapshot,
  serializeCashflowSnapshot,
  type CashflowSnapshotWire,
} from "./cashflowSnapshotWire";

const date = new Date("2026-09-12T10:11:12.345Z");
const fixture = (): CashflowItem => ({
  id: "all-fields", date, amount: -123.456789, productKey: "neon",
  note: "Poznámka s diakritikou", frequency: "monthly", source: "manager",
  contractNumber: "123", clientName: "Testovací klient", inputAmount: 1_234.56,
  currentMonthlyPremium: 1_230, lifeStornoBaseMonthlyPremium: null,
  policyStartDate: new Date("2020-03-29T00:00:00.000Z"),
  contractSignedDate: new Date("2019-10-27T01:30:00.000Z"),
  lifeRevisionBaseDate: new Date("2025-01-01T01:30:00.000Z"),
  contractStatus: "storno", stornoDate: new Date("2026-09-01T00:00:00.000Z"),
  ownerEmail: "owner@example.test", entryId: "entry", entryType: "contract",
  rootContractEntryId: "root", parentContractEntryId: null, isManagerOverride: true,
  predictionPosition: "manazer8", predictionBaselinePosition: "poradce3",
  predictionCommissionMode: "accelerated", durationYears: 5,
  commissionCode: "B101", commissionCodeAliases: ["B101", "b101"],
  commissionLabel: "Provize", isTipPayout: false,
  tipSourceAdviserEmail: null, tipSourceAdviserName: null,
  isSubscriptionPayment: false, subscriptionPlan: null,
  subscriptionUserEmail: null, subscriptionUserName: null,
  subscriptionPeriodFrom: null, subscriptionPeriodUntil: null,
  payoutStatus: "shifted", predictedAmount: 125, isStatementOnly: false,
  commissionPayoutKey: "key", commissionStatementNumber: "100",
  commissionStatementPeriod: "09/2026", originalDate: new Date("2026-08-25T00:00:00.000Z"),
  missedStatementPeriods: ["08/2026"], predictionAdjustment: {
    kind: "lifePremiumReview", baseAmount: 100, adjustedAmount: 125,
    multiplier: 1.25, steps: 2, label: "Revize", reason: "Růst pojistného",
    premiumDeltaMonthly: 10, calculationMonthlyPremium: 50,
    grossPotentialAmount: 200, acceptanceProbability: 0.5,
    reviewDate: "2026-09-12", position: "manazer8",
  },
});
function wire(): CashflowSnapshotWire {
  const items = [fixture()];
  return serializeCashflowSnapshot({ items, months: groupItemsByMonth(items) });
}

describe("cashflow snapshot wire format", () => {
  it("retains every field, exact decimals, duplicate items, dates, and order through JSON", () => {
    const items = [fixture(), { ...fixture(), amount: 0, note: undefined }];
    const result = { items, months: groupItemsByMonth(items) };
    const encoded = serializeCashflowSnapshot(result);
    expect(encoded.version).toBe(CASHFLOW_SNAPSHOT_WIRE_VERSION);
    expect(encoded.items[0].date).toBe(date.getTime());
    expect(encoded.items[0].contractSignedDate).toBe(fixture().contractSignedDate?.getTime());
    const decoded = parseCashflowSnapshot(JSON.parse(JSON.stringify(encoded)));
    expect(cashflowCanonicalJson(decoded)).toBe(cashflowCanonicalJson(result));
    expect(decoded?.items[0].date).toBeInstanceOf(Date);
    expect(decoded?.months[0].items[0].originalDate).toBeInstanceOf(Date);
    expect(decoded?.items).toHaveLength(2);
    expect(decoded?.items[0]).not.toBe(items[0]);
    expect(decoded?.items[0].commissionCodeAliases).not.toBe(items[0].commissionCodeAliases);
    expect(decoded?.items[0].predictionAdjustment).not.toBe(items[0].predictionAdjustment);
  });

  it("roundtrips real own, inherited, manager, TIP, subscription and intelligent prediction results", () => {
    const email = SUBSCRIPTION_CASHFLOW_OWNER_EMAIL;
    const snapshot: CashflowSnapshot = {
      email, myPosition: "manazer8", myCommissionMode: "accelerated", hasAnyTeam: true,
      ownEntries: [{
        id: "auto", userEmail: email, productKey: "cppAuto", frequencyRaw: "annual",
        policyStartDate: "2025-01-15", inputAmount: 6_000,
        items: [{ code: "A101", title: "Okamžitá provize", amount: 120 }],
      }, {
        id: "life", userEmail: email, productKey: "neon", acquisitionType: "inherited",
        originalAdviserEmail: "old@example.test", originalPosition: "poradce3",
        transferEffectiveDate: "2022-02-01", commissionMode: "standard", frequencyRaw: "monthly",
        policyStartDate: "2020-01-15", contractSignedDate: "2020-01-01", inputAmount: 1000,
        items: [{ code: "A101", title: "Okamžitá provize", amount: 1000 },
          { code: "B201-B206", title: "Pečovatelská provize (5.–10. rok)", amount: 10 }],
      }],
      teamEntriesRaw: [{
        id: "team", userEmail: "team@example.test", productKey: "cppAuto", frequencyRaw: "annual",
        policyStartDate: "2025-01-15", items: [{ code: "A101", title: "Okamžitá provize", amount: 120 }],
        managerOverrides: [{ email, position: "manazer8", commissionMode: "standard", total: 20,
          items: [{ code: "A101", title: "Okamžitá provize", amount: 20 }] }],
      }],
      tipPayouts: [{ id: "tip", payoutDate: date.getTime(), amount: 50, clientName: "TIP" }],
      subscriptionPayments: [{ id: "subscription", userEmail: "subscriber@example.test",
        plan: "monthly", amountCzk: 350, periodFrom: "2026-09-01", paymentDateMs: date.getTime() }],
    };
    const options = {
      scopeFilter: "combined", productFilter: "all", tipsterMode: false,
      showPastYears: true, intelligentPredictionEnabled: true, contractNumberQuery: "",
    } as const;
    const items = computeCashflow(snapshot, { ...options, asOf: date });
    const months = buildCashflowView(items, [], options, date);
    const source = { items, months };
    const decoded = parseCashflowSnapshot(JSON.parse(JSON.stringify(serializeCashflowSnapshot(source))));
    expect(items.some(item => item.source === "manager")).toBe(true);
    expect(items.some(item => item.isTipPayout)).toBe(true);
    expect(items.some(item => item.isSubscriptionPayment)).toBe(true);
    expect(cashflowCanonicalJson(decoded)).toBe(cashflowCanonicalJson(source));
  });

  it("retains statement month totals even when they differ from predicted item sums", () => {
    const source = wire();
    source.months[0].totalSource = "paid";
    source.months[0].total = 321.05;
    source.months[0].statementPayoutTotal = 321.05;
    const decoded = parseCashflowSnapshot(source);
    expect(decoded?.months[0]).toMatchObject({ total: 321.05, totalSource: "paid", predictedTotal: 125 });
  });

  it("preserves both unpadded generated and padded statement-only month keys", () => {
    const source = wire();
    source.months.push({ ...source.months[0], key: "2026-09", items: [], totalSource: "paid", total: 321, statementPayoutTotal: 321 });
    const decoded = parseCashflowSnapshot(source);
    expect(decoded?.months.map(month => month.key)).toEqual(["2026-9", "2026-09"]);
    expect(serializeCashflowSnapshot(decoded!)).toEqual(source);
  });

  it("accepts empty results and nullable optional dates without inventing values", () => {
    expect(parseCashflowSnapshot(serializeCashflowSnapshot({ items: [], months: [] })))
      .toEqual({ items: [], months: [] });
    const source = wire();
    source.items[0].policyStartDate = null;
    delete source.items[0].contractSignedDate;
    expect(parseCashflowSnapshot(source)?.items[0]).toMatchObject({ policyStartDate: null });
    expect(parseCashflowSnapshot(source)?.items[0]).not.toHaveProperty("contractSignedDate");
  });

  it.each([
    ["amount", NaN], ["amount", Infinity], ["amount", "12"],
    ["date", "2026-09-12"], ["date", null], ["date", 8.64e15 + 1],
    ["date", 1.25], ["policyStartDate", -Infinity], ["originalDate", {}],
    ["productKey", "not-a-product"], ["source", "other"], ["frequency", "daily"],
    ["predictionPosition", "admin"], ["payoutStatus", "pending"],
    ["isTipPayout", "true"], ["ownerEmail", 123], ["entryId", undefined],
    ["commissionCodeAliases", ["valid", null]], ["missedStatementPeriods", new Array(1)],
    ["predictionAdjustment", { kind: "lifePremiumReview" }],
    ["id", "a".repeat(16_385)], ["unknownField", "must not be dropped"],
  ])("rejects invalid item field %s=%j without returning other valid items", (key, value) => {
    const source = wire();
    Object.assign(source.items[0], { [key]: value });
    expect(parseCashflowSnapshot(source)).toBeNull();
  });

  it.each([
    ["year", 2026.5], ["monthIndex", 12], ["key", "2026-10"],
    ["key", "2026-00"], ["key", "2026-13"], ["key", "2025-09"],
    ["total", Infinity], ["predictedTotal", null], ["totalSource", "unknown"],
    ["statementPayoutTotal", NaN], ["items", [null]], ["extra", 1],
  ])("rejects invalid month field %s=%j", (key, value) => {
    const source = wire();
    Object.assign(source.months[0], { [key]: value });
    expect(parseCashflowSnapshot(source)).toBeNull();
  });

  it("rejects nested corruption, duplicate months, unknown fields and wrong versions", () => {
    const nested = wire();
    nested.months[0].items[0].predictionAdjustment!.adjustedAmount = NaN;
    expect(parseCashflowSnapshot(nested)).toBeNull();
    const repeated = wire();
    repeated.months.push(repeated.months[0]);
    expect(parseCashflowSnapshot(repeated)).toBeNull();
    expect(parseCashflowSnapshot({ ...wire(), version: "future" })).toBeNull();
    expect(parseCashflowSnapshot({ ...wire(), identity: "untrusted" })).toBeNull();
    expect(parseCashflowSnapshot(Object.create(wire()))).toBeNull();
    expect(parseCashflowSnapshot({ ...wire(), items: new Array(1) })).toBeNull();
  });

  it("bounds both raw and aggregate monthly item counts", () => {
    const source = wire();
    const tooMany = Array(CASHFLOW_SNAPSHOT_MAX_ITEMS + 1).fill(source.items[0]);
    expect(parseCashflowSnapshot({ ...source, items: tooMany })).toBeNull();
    source.months[0].items = tooMany;
    expect(parseCashflowSnapshot(source)).toBeNull();
    expect(parseCashflowSnapshot({ ...wire(), months: Array(2401).fill(source.months[0]) })).toBeNull();
  });

  it("rejects oversized text aggregates even when each field and item count is allowed", () => {
    const source = wire();
    const item = { ...source.items[0], note: "a".repeat(16_384) };
    expect(parseCashflowSnapshot({ ...source, items: Array(1_025).fill(item) })).toBeNull();
    expect(() => serializeCashflowSnapshot({
      items: Array(1_025).fill({ ...fixture(), note: item.note }), months: [],
    })).toThrow("Invalid cashflow snapshot.");
  });

  it("rejects malformed internal model dates before serializing, including numeric substitutes", () => {
    for (const date of [new Date(NaN), "2026-09-12", 1_234]) {
      const item = { ...fixture(), date } as CashflowItem;
      expect(() => serializeCashflowSnapshot({ items: [item], months: [] })).toThrow("Invalid cashflow snapshot.");
    }
  });
});
