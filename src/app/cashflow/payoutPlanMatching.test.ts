import { describe, expect, it } from "vitest";
import { generateCashflow } from "./generator";
import type { EntryDoc } from "./types";
import { serializeCashflowSnapshot, parseCashflowSnapshot } from "./cashflowSnapshotWire";

const viewer = "advisor@example.test";
const manager = "manager@example.test";
const asOf = new Date(2026, 8, 18);
const fixture = (): EntryDoc => ({
  id: "car", userEmail: viewer, productKey: "kooperativaAuto", source: "own",
  frequencyRaw: "annual", policyStartDate: "2023-02-12", contractSignedDate: "2023-02-10",
  items: [{ title: "Okamžitá provize", amount: 300, code: "A101" }, { title: "Následná provize", amount: 300, code: "B101" }],
  commissionPayouts: [{ key: "c102", code: "C102", amount: 321.45, status: "paid", payoutMonthKey: "2024-3", writtenBy: viewer, statementId: "synthetic", statementNumber: "SYNTHETIC", statementPeriod: "01.02.2024 - 29.02.2024" }],
});
const generate = (entry: EntryDoc, email = viewer) => generateCashflow([entry], 10, email, asOf);

describe("automatic Kooperativa C payout settlement", () => {
  it("settles the B installment with the same suffix without modifying the imported payout", () => {
    const entry = fixture();
    const before = structuredClone(entry);
    const items = generate(entry);
    expect(items.some(item => item.commissionCode === "B102")).toBe(false);
    expect(items.some(item => item.commissionCode === "B101")).toBe(true);
    expect(items.find(item => item.commissionPayoutKey === "c102")).toMatchObject({
      commissionCode: "C102", commissionCodeAliases: ["C102", "B102"], amount: 321.45,
      predictedAmount: 300, matchedPlannedCode: "B102", payoutPlanStatus: "matched",
      isStatementOnly: false, commissionPeriodStart: "2025-02-12", payoutStatus: "paid",
      date: new Date(2024, 2, 25), originalDate: new Date(2025, 2, 25),
      commissionStatementNumber: "SYNTHETIC", commissionStatementPeriod: "01.02.2024 - 29.02.2024",
    });
    expect(entry).toEqual(before);
  });

  it("settles both C102 and C103 for an inherited contract despite earlier payout months", () => {
    const entry = fixture();
    Object.assign(entry, { policyStartDate: "2024-05-03", acquisitionType: "inherited", transferEffectiveDate: "2025-06-27" });
    entry.commissionPayouts = [
      { key: "c102", code: "C102", amount: 1065.13, status: "paid", writtenBy: viewer, payoutMonthKey: "2025-9" },
      { key: "c103", code: "C103", amount: 965.98, status: "paid", writtenBy: viewer, payoutMonthKey: "2026-3" },
    ];
    const items = generate(entry);
    expect(items.filter(item => item.commissionPayoutKey).map(item => [item.commissionCode, item.matchedPlannedCode, item.amount]))
      .toEqual([["C102", "B102", 1065.13], ["C103", "B103", 965.98]]);
    expect(items.some(item => ["B102", "B103"].includes(item.commissionCode ?? ""))).toBe(false);
    expect(items.find(item => item.commissionCode === "B104")?.amount).toBe(300);
  });

  it.each(["annual", "semiannual", "quarterly", "monthly"] as const)("uses the existing %s plan period for C102/B102", frequency => {
    const entry = fixture(); entry.frequencyRaw = frequency;
    const plan = generate({ ...entry, commissionPayouts: [] }).find(item => item.commissionCode === "B102")!;
    expect(generate(entry).find(item => item.commissionPayoutKey === "c102"))
      .toMatchObject({ matchedPlannedCode: "B102", commissionPeriodStart: plan.commissionPeriodStart });
    expect(generate(entry).some(item => item.commissionCode === "B102")).toBe(false);
  });

  it("ignores an old manual association to a different B code", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = [{ payoutKey: "c102", payoutSignature: "legacy-signature",
      plannedCode: "B103", plannedMonthKey: "2026-03", plannedPeriodStart: "2026-02-12", plannedFrequency: "annual",
      writtenBy: viewer, actorEmail: viewer, writtenAtMs: 1 }];
    expect(generate(entry).find(item => item.commissionPayoutKey === "c102")?.matchedPlannedCode).toBe("B102");
    expect(generate(entry).find(item => item.commissionCode === "B103")?.amount).toBe(300);
  });

  it("keeps negative corrections independent without leaving a second B forecast", () => {
    const entry = fixture();
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "correction", amount: -21.45, status: "storno", payoutMonthKey: "2024-4" });
    const items = generate(entry);
    expect(items.filter(item => item.payoutStatus === "paid").map(item => item.amount)).toEqual([321.45, -21.45]);
    expect(items.find(item => item.commissionPayoutKey === "correction")?.payoutPlanStatus).toBe("correction");
    expect(items.some(item => item.commissionCode === "B102")).toBe(false);
  });

  it("does not settle a positive forecast using only a negative C correction", () => {
    const entry = fixture(); Object.assign(entry.commissionPayouts![0], { amount: -321.45, status: "storno" });
    expect(generate(entry).some(item => item.commissionCode === "B102" && item.payoutStatus !== "paid")).toBe(true);
  });

  it("counts multiple actual rows once each and removes their shared forecast", () => {
    const entry = fixture();
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "second", amount: 50, payoutMonthKey: "2024-4" });
    const items = generate(entry);
    expect(items.filter(item => item.commissionPayoutKey).reduce((sum, item) => sum + item.amount, 0)).toBe(371.45);
    expect(items.filter(item => item.commissionPayoutKey)).toHaveLength(2);
    expect(items.some(item => item.commissionCode === "B102")).toBe(false);
  });

  it("keeps a receipt beyond the forecast horizon without settling another installment", () => {
    const entry = fixture(); entry.commissionPayouts![0].code = "C199";
    const items = generate(entry);
    expect(items.find(item => item.commissionPayoutKey === "c102"))
      .toMatchObject({ amount: 321.45, isStatementOnly: true, commissionLabel: "Následná provize" });
    expect(items.some(item => item.commissionCode === "B102")).toBe(true);
  });

  it("retains a partial C receipt and forecasts only the balance after a premium decrease", () => {
    const entry = fixture(); entry.inputAmount = 2000;
    entry.commissionPayouts![0].amount = 100;
    const decrease: EntryDoc = { id: "decrease", userEmail: viewer, productKey: "kooperativaAuto",
      entryType: "endorsement", rootContractEntryId: "car", parentContractEntryId: "car",
      policyStartDate: "2025-02-12", previousInputAmount: 2000, newInputAmount: 1000, premiumDelta: -1000, items: [] };
    const items = generateCashflow([entry, decrease], 10, viewer, asOf);
    expect(items.find(item => item.commissionPayoutKey === "c102"))
      .toMatchObject({ amount: 100, commissionCode: "C102", matchedPlannedCode: "B102", payoutStatus: "paid" });
    expect(items.filter(item => item.commissionCode === "B102")).toEqual([expect.objectContaining({
      amount: 50, payoutStatus: "predicted", isPartialPayoutBalance: true,
      commissionPayoutKey: null, matchedPlannedCode: null,
    })]);
    expect(items.find(item => item.commissionCode === "B103")?.amount).toBe(150);
    expect(items.filter(item => item.commissionPeriodStart === "2025-02-12").reduce((sum, item) => sum + item.amount, 0)).toBe(150);
  });

  it("leaves other insurers' C codes outside the Kooperativa rule", () => {
    const entry = fixture(); entry.productKey = "cppAuto";
    expect(generate(entry).find(item => item.commissionPayoutKey === "c102")?.isStatementOnly).toBe(true);
    expect(generate(entry).some(item => item.commissionCode === "B102")).toBe(true);
  });

  it("does not use another recipient's C receipt for the viewer's forecast", () => {
    const entry = fixture(); entry.commissionPayouts![0].writtenBy = manager;
    expect(generate(entry).some(item => item.commissionPayoutKey)).toBe(false);
    expect(generate(entry).some(item => item.commissionCode === "B102")).toBe(true);
    entry.source = "manager"; entry.commissionPayouts![0].writtenBy = null;
    expect(generate(entry, manager).some(item => item.commissionPayoutKey)).toBe(false);
  });

  it("supports a manager's own C payouts on a separately scoped plan", () => {
    const entry = fixture(); entry.source = "manager";
    entry.items = [{ title: "Následná provize", code: "B101", amount: 70 }];
    entry.commissionPayouts![0] = { ...entry.commissionPayouts![0], amount: 75, writtenBy: manager };
    expect(generate(entry, manager).find(item => item.commissionPayoutKey === "c102"))
      .toMatchObject({ amount: 75, predictedAmount: 70, matchedPlannedCode: "B102", isManagerOverride: true });
  });

  it("preserves automatic matching through worker/cache serialization", () => {
    const items = generate(fixture());
    expect(parseCashflowSnapshot(serializeCashflowSnapshot({ items, months: [] }))?.items).toEqual(items);
  });
});
