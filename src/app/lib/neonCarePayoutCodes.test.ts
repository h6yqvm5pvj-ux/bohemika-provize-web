import { describe, expect, it } from "vitest";
import { createCommissionCodeProjection, projectConfirmedCommissionCodes } from "./commissionPayoutCodeAdjustment";

const writer = "advisor@example.test";
const entry = { productKey: "neon" as const, policyStartDate: "2018-01-10", frequencyRaw: "monthly",
  items: [{ title: "Pečovatelská provize (5.–10. rok)", code: "B201-B206", amount: 120 }] };
const receipt = (code: string, month: string) => ({ code, payoutMonthKey: month, writtenBy: writer, amount: 110,
  status: "difference", expectedAmount: 125, difference: -15, statementId: `test-${month}`, key: `test-${month}-${code}` });
const first = receipt("B202", "2023-11");
const second = receipt("B203", "2024-2");

describe("NEON care receipts by planned payout year", () => {
  it("matches old and incoming receipts to separate years, preserving the original payment and its variance", () => {
    const raw = [second, first];
    const projected = projectConfirmedCommissionCodes(entry, raw);
    expect(projected.map(p => [p.statementCode, p.code])).toEqual([["B203", "B202"], ["B202", "B201"]]);
    projected.forEach((p, index) => expect({ ...p, code: p.statementCode }).toMatchObject(raw[index]));
    expect(createCommissionCodeProjection(entry, raw)({ ...second })).toEqual(projected[0]);
    expect(projectConfirmedCommissionCodes(entry, projected)).toBe(projected);
    expect(raw.map(p => p.code)).toEqual(["B203", "B202"]);
  });

  it("keeps a missing year open and preserves correctly numbered payments", () => {
    const named = receipt("B201", "2023-03");
    const later = receipt("B204", "2025-02");
    expect(projectConfirmedCommissionCodes(entry, [named, later]).map(p => p.code)).toEqual(["B201", "B203"]);
  });

  it("keeps a late payment on its original installment unless that installment was already paid", () => {
    const late = receipt("B201", "2024-11");
    expect(projectConfirmedCommissionCodes(entry, [late])[0]).toBe(late);
    const earlier = receipt("B201", "2023-02");
    expect(projectConfirmedCommissionCodes(entry, [earlier, late]).map(p => p.code)).toEqual(["B201", "B202"]);
  });

  it("does not use one recipient's payment to occupy another recipient's slot", () => {
    const other = { ...receipt("B201", "2023-11"), writtenBy: "manager@example.test" };
    expect(projectConfirmedCommissionCodes(entry, [first, other]).map(p => p.code)).toEqual(["B201", "B201"]);
    const ambiguous = [second, first, { ...other, writtenBy: writer }];
    expect(projectConfirmedCommissionCodes(entry, ambiguous)).toBe(ambiguous);
  });

  it("leaves collisions, reversals and their dependent moves under their source codes", () => {
    for (const blocked of [receipt("B201", ""), receipt("B201", "2021-02"),
      { ...first, amount: -110, status: "storno", payoutMonthKey: "2025-1" }, { ...first, key: "another" }]) {
      const rows = [second, first, blocked];
      expect(projectConfirmedCommissionCodes(entry, rows)).toBe(rows);
    }
  });

  it("uses the payout year across December and January, including a legacy statement period", () => {
    const december = { ...entry, policyStartDate: "2018-12-12" };
    const paid = { ...first, payoutMonthKey: undefined, statementPeriod: "01.12.2023 - 31.12.2023" };
    expect(projectConfirmedCommissionCodes(december, [paid])[0]).toMatchObject({ code: "B201", statementCode: "B202" });
    const early = [receipt("B202", "2023-08")];
    expect(projectConfirmedCommissionCodes(december, early)).toBe(early);
  });

  it("only assigns an out-of-range B207 at the end of a corroborated sequence", () => {
    const last = receipt("B207", "2028-02");
    expect(projectConfirmedCommissionCodes(entry, [last])[0]).toBe(last);
    const previous = receipt("B206", "2027-02");
    expect(projectConfirmedCommissionCodes(entry, [last, previous]).map(p => p.code)).toEqual(["B206", "B205"]);
  });

  it("requires an eligible care plan, recipient, policy date and year", () => {
    for (const contract of [{ ...entry, items: [] }, { ...entry, productKey: "flexi" as const },
      { ...entry, entryType: "endorsement" }, { ...entry, parentContractEntryId: "parent", rootContractEntryId: "root" },
      { ...entry, policyStartDate: "invalid" }, { ...entry, policyEndDate: "2022-01-01" }, { ...entry, durationYears: 3 },
      { ...entry, acquisitionType: "inherited", transferEffectiveDate: "2022-05-01" }]) {
      expect(projectConfirmedCommissionCodes(contract, [first])[0]).toBe(first);
    }
    const unchanged = [receipt("B105", "2023-11"), receipt("B201-B206", "2023-11"), { ...first, writtenBy: "" }];
    expect(projectConfirmedCommissionCodes(entry, unchanged)).toBe(unchanged);
    const malformed = [{ ...first, payoutMonthKey: null, statementDate: 123 as unknown as string }];
    expect(projectConfirmedCommissionCodes(entry, malformed)).toBe(malformed);
  });
});
