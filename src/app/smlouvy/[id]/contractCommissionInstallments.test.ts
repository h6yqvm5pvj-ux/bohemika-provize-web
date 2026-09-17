import { describe, expect, it } from "vitest";
import { acquisitionCommissionInstallments, payoutsForAcquisitionInstallment } from "./contractCommissionInstallments";
import { payoutStatusForCodes } from "./ContractCommissionSection";
import type { CommissionResultItemDTO, Product } from "@/app/types/domain";
import type { ContractCommissionPayout } from "./contractDetailTypes";

const item: CommissionResultItemDTO = { title: "💸 Okamžitá (získatelská) provize (z platby)", amount: 440.307, code: "A101-A102" };
const schedule = () => acquisitionCommissionInstallments({ item, product: "cppPPRbez", frequency: "semiannual", policyStartDate: "2026-09-17" });
const states = (records: ContractCommissionPayout[]) => schedule().map((part) =>
  payoutStatusForCodes(payoutsForAcquisitionInstallment(records, part), part.codes, part.amount));

describe("acquisition commission installments", () => {
  it.each([
    "domexneuron", "domex", "cppbytex", "cpphafan", "koopmajetekobcan", "koopfit", "koopodzam", "kooppmop", "maxdomov", "cppPPRbez", "cppsimplex", "cppPPRs", "zamex",
    "cppAuto", "slaviaauto", "slaviaflotila", "csobAuto", "uniqaAuto", "uniqaflotila", "kooperativaAuto", "koopflotila",
  ] satisfies Product[])("supports all payment-based products: %s", (product) => {
    for (const [frequency, count] of [["monthly", 12], ["quarterly", 4], ["semiannual", 2]] as const) {
      const parts = acquisitionCommissionInstallments({ item, product, frequency });
      expect(parts).toHaveLength(count);
      expect(parts.at(-1)?.code).toBe(`A${100 + count}`);
      expect(parts[0].amount).toBe(item.amount);
    }
    expect(acquisitionCommissionInstallments({ item, product, frequency: "annual" })).toEqual([]);
  });

  it.each(["neon", "flexi", "maximaMaxEfekt", "allianzAuto", "pillowAuto", "pillowmajetek", "allianzmujdomov", "conseqzenit"] satisfies Product[])(
    "does not split upfront or annual commissions for %s", (product) => {
      expect(acquisitionCommissionInstallments({ item, product, frequency: "monthly" })).toEqual([]);
    }
  );

  it("uses the contract frequency for legacy items with only A101 and keeps full precision", () => {
    const parts = acquisitionCommissionInstallments({ item: { ...item, title: "🚗 Okamžitá provize", code: "A101" }, product: "cppAuto", frequency: "quarterly" });
    expect(parts.map((part) => part.code)).toEqual(["A101", "A102", "A103", "A104"]);
    expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBeCloseTo(1761.228, 6);
  });

  it("does not create another schedule from annual summaries, subsequent or bonus rows", () => {
    for (const title of ["📅 Okamžitá (získatelská) provize za rok", "🔁 Následná provize (z platby)", "Provize po 3 letech"]) {
      expect(acquisitionCommissionInstallments({ item: { ...item, title }, product: "cppPPRbez", frequency: "quarterly" })).toEqual([]);
    }
  });

  it("labels periods across years without shifting an end-of-month start", () => {
    expect(schedule().map((part) => part.period)).toEqual(["září 2026", "březen 2027"]);
    const parts = acquisitionCommissionInstallments({ item, product: "cppPPRbez", frequency: "monthly", policyStartDate: "2026-01-31" });
    expect(parts.slice(0, 3).map((part) => part.period)).toEqual(["leden 2026", "únor 2026", "březen 2026"]);
    expect(acquisitionCommissionInstallments({ item, product: "cppPPRbez", frequency: "semiannual", policyStartDate: "1. 9. 2026" })[0].period).toBe("září 2026");
    expect(acquisitionCommissionInstallments({ item, product: "cppPPRbez", frequency: "semiannual", policyStartDate: "unknown" })[0].period).toBeNull();
  });

  it("populates each installment from its own statement and never marks the entire year from one payment", () => {
    const records = [{ code: "A101", amount: 440.31, statementId: "old-statement" }];
    expect(states(records).map((state) => state.status)).toEqual(["paid", "pending"]);
    records.push({ code: "A102", amount: 440.31, statementId: "new-statement" });
    expect(states(records).map((state) => state.status)).toEqual(["paid", "paid"]);
    expect(states(records).map((state) => state.records[0].statementId)).toEqual(["old-statement", "new-statement"]);
  });

  it("supports role aliases, partial payments and top-ups without leaking another installment", () => {
    const records = [{ code: "APZ102", amount: 200, title: "A101" }];
    expect(states(records).map((state) => state.status)).toEqual(["pending", "partial"]);
    const toppedUp = states([...records, { code: "AZ102", amount: 240.31 }]);
    expect(toppedUp[1].status).toBe("paid");
    expect(toppedUp[1].paidAmount).toBeCloseTo(440.31, 2);
  });

  it("supports short auto commission codes and keeps ambiguous ranges unassigned", () => {
    const parts = acquisitionCommissionInstallments({ item, product: "csobAuto", frequency: "quarterly" });
    const records = [{ code: "AC2", amount: 440.31 }, { code: "A101-A104", amount: 1761.24 }];
    expect(parts.map((part) => payoutsForAcquisitionInstallment(records, part).length)).toEqual([0, 1, 0, 0]);
  });

  it("keeps a reversed installment unpaid, then picks up its replacement from a later statement", () => {
    const records = [{ code: "A101", amount: 440.31 }, { code: "A101", amount: -440.31, status: "storno" }];
    expect(states(records).map((state) => state.status)).toEqual(["storno", "pending"]);
    expect(states([...records, { code: "A101", amount: 440.31, statementId: "replacement" }])[0].records).toEqual([
      expect.objectContaining({ statementId: "replacement" }),
    ]);
  });

  it("does not mark small fully reversed manager commissions as paid", () => {
    expect(payoutStatusForCodes([{ code: "A101", amount: 5 }, { code: "A101", amount: -5, status: "storno" }], ["A101"], 5).status).toBe("storno");
  });
});
