import { describe, expect, it } from "vitest";
import { generateCashflow } from "./generator";
import { payoutPlanTargetKey } from "./payoutPlanMatching";
import type { EntryDoc } from "./types";
import { buildPayoutPlanPreview, updatePayoutPlanMatch } from "@/lib/server/cashflowPayoutMatching";
import { serializeCashflowSnapshot, parseCashflowSnapshot } from "./cashflowSnapshotWire";

const viewerEmail = "advisor@example.test";
const managerEmail = "manager@example.test";
const asOf = new Date(2026, 8, 18);
const fixture = (): EntryDoc => ({
  id: "car", userEmail: viewerEmail, productKey: "kooperativaAuto", source: "own",
  frequencyRaw: "annual", policyStartDate: new Date(2023, 1, 12), contractSignedDate: new Date(2023, 1, 10),
  items: [{ title: "Okamžitá provize", amount: 300, code: "A101" }, { title: "Následná provize", amount: 300, code: "B101" }],
  commissionPayouts: [{ key: "c109", code: "C109", amount: 321.45, status: "paid", payoutMonthKey: "2024-3", writtenBy: viewerEmail, statementId: "statement", statementPeriod: "01.02.2024 - 29.02.2024" }],
});
const generate = (entry: EntryDoc, email = viewerEmail) => generateCashflow([entry], 10, email, asOf);
const assign = (entry: EntryDoc, email = viewerEmail, payoutKey = "c109", targetIndex = 0) => {
  const preview = buildPayoutPlanPreview(entry, email, asOf);
  return updatePayoutPlanMatch({ entry, viewerEmail: email, actorEmail: email, payoutKey, targetKey: preview.targets[targetIndex].key, revision: preview.revision, asOf });
};

describe("confirmed Kooperativa C payout matching", () => {
  it("distinguishes likely subsequent C payments from a confirmed forecast match for an inherited annual contract", () => {
    const entry = fixture();
    entry.policyStartDate = new Date(2024, 4, 3);
    entry.contractSignedDate = new Date(2024, 4, 3);
    entry.acquisitionType = "inherited";
    entry.transferEffectiveDate = "2025-06-27";
    entry.commissionPayouts = [
      { key: "later-c102", code: "C102", amount: 1065.13, status: "paid", writtenBy: viewerEmail, payoutMonthKey: "2025-9", statementPeriod: "01.08.2025 - 31.08.2025" },
      { key: "later-c103", code: "C103", amount: 965.98, status: "paid", writtenBy: viewerEmail, payoutMonthKey: "2026-3", statementPeriod: "01.02.2026 - 28.02.2026" },
    ];
    const before = structuredClone(entry);
    const preview = buildPayoutPlanPreview(entry, viewerEmail, asOf);
    expect(preview.payouts.every(p => p.meaning?.kind === "subsequentCandidate" && p.targetKey === null && p.planNotice?.includes("starší"))).toBe(true);
    expect(preview.targets[0].periodStart).toBe("2026-05-03");
    const items = generate(entry);
    const actual = items.filter(item => item.commissionPayoutKey);
    expect(actual.map(item => item.amount)).toEqual([1065.13, 965.98]);
    expect(actual.every(item => item.payoutPlanStatus === "unmatched" && item.commissionLabel?.includes("Pravděpodobná následná"))).toBe(true);
    expect(items.some(item => item.commissionCode === "B102")).toBe(true);
    expect(entry).toEqual(before);
  });

  it("does not infer a match from the C counter, same month, identical amount or a sole candidate", () => {
    const entry = fixture();
    entry.policyEndDate = new Date(2024, 3, 1);
    entry.commissionPayouts![0] = { ...entry.commissionPayouts![0], code: "C101", amount: 300 };
    const preview = buildPayoutPlanPreview(entry, viewerEmail, asOf);
    expect(preview.targets).toHaveLength(1);
    expect(preview.payouts[0]).toMatchObject({ blockReason: null, targetKey: null });
    expect(generate(entry).find(item => item.commissionCode === "C101")).toMatchObject({ isStatementOnly: true, payoutPlanStatus: "unmatched" });
    expect(generate(entry).some(item => item.commissionCode === "B101")).toBe(true);
  });

  it("replaces exactly one forecast and retains the original C code, amount, statement and payout month", () => {
    const entry = fixture();
    const before = generate(entry);
    const sourceBefore = structuredClone(entry.commissionPayouts);
    entry.cashflowPayoutMatches = assign(entry);
    const after = generate(entry);
    expect(entry.commissionPayouts).toEqual(sourceBefore);
    expect(after).toHaveLength(before.length - 1);
    expect(after.filter(item => item.commissionCode === "B101")).toHaveLength(0);
    expect(after.find(item => item.commissionPayoutKey === "c109")).toMatchObject({
      commissionCode: "C109", commissionCodeAliases: ["C109"], amount: 321.45,
      predictedAmount: 300, matchedPlannedCode: "B101", payoutPlanStatus: "matched",
      isStatementOnly: false, commissionPeriodStart: "2024-02-12", payoutStatus: "paid",
      date: new Date(2024, 2, 25), originalDate: new Date(2024, 2, 25),
      commissionStatementPeriod: "01.02.2024 - 29.02.2024",
    });
    expect(after.filter(item => item.payoutStatus === "paid").reduce((sum, item) => sum + item.amount, 0)).toBe(321.45);
    expect(after.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(before.reduce((sum, item) => sum + item.amount, 0) - 300);
  });

  it("keeps payment in its real month even when the confirmed forecast is later", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry, viewerEmail, "c109", 1);
    const actual = generate(entry).find(item => item.commissionPayoutKey === "c109")!;
    expect(actual.date).toEqual(new Date(2024, 2, 25));
    expect(actual.originalDate).toEqual(new Date(2025, 2, 25));
    expect(actual.matchedPlannedCode).toBe("B102");
    expect(generate(entry).some(item => item.commissionCode === "B101")).toBe(true);
  });

  it("undoes a match without changing the statement payout", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry);
    const preview = buildPayoutPlanPreview(entry, viewerEmail, asOf);
    entry.cashflowPayoutMatches = updatePayoutPlanMatch({ entry, viewerEmail, actorEmail: viewerEmail, revision: preview.revision, payoutKey: "c109", targetKey: null, asOf });
    expect(generate(entry).some(item => item.commissionCode === "B101")).toBe(true);
    expect(generate(entry).find(item => item.commissionPayoutKey === "c109")?.isStatementOnly).toBe(true);
  });

  it.each(["amount", "period", "key", "frequency", "recipient", "storno", "duplicate", "alreadyPaidTarget"])("invalidates a confirmed association when %s changes", change => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry);
    const payout = entry.commissionPayouts![0];
    if (change === "amount") payout.amount = 400;
    if (change === "period") payout.statementPeriod = "01.03.2024 - 31.03.2024";
    if (change === "key") payout.key = "replaced-row";
    if (change === "frequency") entry.frequencyRaw = "quarterly";
    if (change === "recipient") payout.writtenBy = managerEmail;
    if (change === "storno") entry.commissionPayouts!.push({ ...payout, key: "reversal", amount: -321.45, status: "storno", payoutMonthKey: "2024-4" });
    if (change === "duplicate") entry.commissionPayouts!.push({ ...payout, key: "duplicate" });
    if (change === "alreadyPaidTarget") entry.commissionPayouts!.push({ ...payout, key: "b101", code: "B101" });
    expect(generate(entry).filter(item => item.payoutPlanStatus === "matched")).toHaveLength(0);
  });

  it("keeps corrections independent and rejects assigning a reversed positive payout", () => {
    const entry = fixture();
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "reversal", amount: -321.45, status: "storno" });
    const rows = generate(entry).filter(item => item.payoutStatus === "paid");
    expect(rows.map(item => item.amount)).toEqual([321.45, -321.45]);
    expect(rows[1].payoutPlanStatus).toBe("correction");
    expect(() => assign(entry)).toThrow(/oprava nebo storno/);
    expect(() => assign(entry, viewerEmail, "reversal")).toThrow(/Storno ani srážku/);
  });

  it("retains the confirmation after an identical statement is reprocessed", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry);
    Object.assign(entry.commissionPayouts![0], { writtenAtMs: Date.now(), expectedAmount: 123, difference: 198.45, status: "difference" });
    expect(generate(entry).find(item => item.commissionPayoutKey === "c109")?.payoutPlanStatus).toBe("matched");
  });

  it.each(["policyStartDate", "frequencyRaw"] as const)("requires an explicit %s instead of treating a generated fallback as a verified period", field => {
    const entry = fixture();
    delete entry[field];
    const preview = buildPayoutPlanPreview(entry, viewerEmail, asOf);
    expect(preview.payouts[0].blockReason).toContain("doplň počátek pojištění");
    expect(() => assign(entry)).toThrow(/nelze určit období/);
  });

  it("does not apply this interpretation to any other product", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry);
    entry.productKey = "cppAuto";
    expect(generate(entry).find(item => item.commissionPayoutKey === "c109")?.payoutPlanStatus).toBeUndefined();
    expect(generate(entry).some(item => item.commissionCode === "B101")).toBe(true);
  });

  it("separates recipient schedules and preserves another recipient's saved match", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry);
    entry.managerOverrides = [{ email: managerEmail, position: "manazer4", commissionMode: "standard", items: [{ title: "Následná provize", code: "B101", amount: 70 }], total: 70 }];
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "manager-c109", amount: 75, writtenBy: managerEmail });
    const preview = buildPayoutPlanPreview(entry, managerEmail, asOf);
    expect(preview.payouts.map(p => p.key)).toEqual(["manager-c109"]);
    expect(preview.targets[0].amount).toBe(70);
    expect(() => assign(entry, managerEmail, "c109")).toThrow(/příjemce/);
    entry.cashflowPayoutMatches = assign(entry, managerEmail, "manager-c109");
    expect(entry.cashflowPayoutMatches).toHaveLength(2);
    expect(buildPayoutPlanPreview(entry, viewerEmail, asOf).payouts[0].targetKey).toBeTruthy();
    expect(buildPayoutPlanPreview(entry, managerEmail, asOf).payouts[0].targetKey).toBeTruthy();
  });

  it("rejects a second assignment to an occupied target and stale browser revisions", () => {
    const entry = fixture();
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "c110", code: "C110" });
    const preview = buildPayoutPlanPreview(entry, viewerEmail, asOf);
    entry.cashflowPayoutMatches = assign(entry);
    expect(() => updatePayoutPlanMatch({ entry, viewerEmail, actorEmail: viewerEmail, revision: preview.revision, payoutKey: "c110", targetKey: preview.targets[0].key, asOf })).toThrow(/mezitím změnily/);
    expect(() => assign(entry, viewerEmail, "c110")).toThrow(/jiná výplata/);
  });

  it("never offers acquisition commissions, settled targets or periods before a transfer", () => {
    const entry = fixture();
    entry.acquisitionType = "inherited"; entry.transferEffectiveDate = "2025-04-01";
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "b103", code: "B103", payoutMonthKey: "2026-3" });
    const preview = buildPayoutPlanPreview(entry, viewerEmail, asOf);
    expect(preview.targets.length).toBeGreaterThan(0);
    expect(preview.targets.every(target => target.code.startsWith("B") && target.periodStart >= "2025-04-01" && target.code !== "B103")).toBe(true);
  });

  it("survives the worker/cache wire format with its matching metadata", () => {
    const entry = fixture();
    entry.cashflowPayoutMatches = assign(entry);
    const items = generate(entry);
    const parsed = parseCashflowSnapshot(serializeCashflowSnapshot({ items, months: [] }));
    expect(parsed?.items).toEqual(items);
    expect(payoutPlanTargetKey(items.find(item => item.commissionCode === "B102")!)).toBe("B102|2025-03|2025-02-12");
  });
});
