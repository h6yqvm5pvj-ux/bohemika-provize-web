import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCashflow } from "./generator";
import type { EntryDoc } from "./types";
import type { Product } from "../types/domain";

const base = (overrides: Partial<EntryDoc> = {}): EntryDoc => ({
  id: "inherited", acquisitionType: "inherited", productKey: "neon",
  originalPosition: "poradce4", userEmail: "owner@example.cz", source: "own",
  contractSignedDate: new Date(2020, 0, 1), policyStartDate: new Date(2020, 0, 15),
  transferEffectiveDate: "2022-02-01", frequencyRaw: "annual",
  items: [
    { title: "Okamžitá provize", amount: 1000, code: "A101" },
    { title: "Provize po 3 letech", amount: 300, code: "B3601" },
    { title: "Provize po 4 letech", amount: 400, code: "B4801" },
    { title: "Následná provize (2.–5. rok)", amount: 20, code: "B101-B104" },
    { title: "Pečovatelská provize (5.–10. rok)", amount: 10, code: "B201-B206" },
  ], ...overrides,
});
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

describe("cashflow for inherited contracts", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 10)); });
  afterEach(() => vi.useRealTimers());

  it("keeps the original contract age and excludes an old period whose payout arrives after acquisition", () => {
    const rows = generateCashflow([base()]);
    expect(iso(rows[0].date)).toBe("2023-02-25");
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.amount === 20 || row.amount === 10)).toBe(true);
    expect(rows.some((row) => /A101|B3601|B4801/.test(row.commissionCode ?? ""))).toBe(false);
  });

  it("includes a premium period beginning on the acquisition day, also in Prague timezone", () => {
    const rows = generateCashflow([base({ transferEffectiveDate: "2022-01-15" })]);
    expect(iso(rows[0].date)).toBe("2022-02-25");
  });

  it.each(["domex", "maxdomov", "cppsimplex"] as Product[])("continues %s instalments even without an acquisition row", (productKey) => {
    const rows = generateCashflow([base({ productKey, frequencyRaw: "quarterly", transferEffectiveDate: "2022-02-01",
      items: [{ title: "Následná provize (z platby)", amount: 30, code: "B101-B104" }],
    })]);
    expect(iso(rows[0].date)).toBe("2022-05-25");
    expect(rows[0].amount).toBe(30);
  });

  it.each(["allianzAuto", "pillowAuto", "uniqaAuto", "uniqaflotila"] as Product[])("continues annual %s renewals with subsequent rows only", (productKey) => {
    const rows = generateCashflow([base({ productKey,
      items: [{ title: "Následná provize", amount: 30, code: "B101" }],
    })]);
    expect(iso(rows[0].date)).toBe("2023-02-25");
    expect(rows[0].amount).toBe(30);
  });

  it.each(["cppAuto", "slaviaauto", "csobAuto", "kooperativaAuto"] as Product[])("does not restart %s or predict acquisition-year instalments", (productKey) => {
    const rows = generateCashflow([base({ productKey, frequencyRaw: "monthly", transferEffectiveDate: "2020-08-01",
      items: [{ title: "Následná provize", amount: 30, code: "B101" }],
    })]);
    expect(iso(rows[0].date)).toBe("2021-02-25");
    expect(rows[0].commissionCode).toBe("B101");
  });

  it("handles a month-end start without moving the premium period into March", () => {
    const rows = generateCashflow([base({ productKey: "cppAuto", frequencyRaw: "monthly",
      policyStartDate: new Date(2020, 0, 31), transferEffectiveDate: "2022-02-28",
      items: [{ title: "Následná provize", amount: 30, code: "B101" }],
    })]);
    expect(iso(rows[0].date)).toBe("2022-03-25");
    const after = generateCashflow([base({ productKey: "cppAuto", frequencyRaw: "monthly",
      policyStartDate: new Date(2020, 0, 31), transferEffectiveDate: "2022-03-01",
      items: [{ title: "Následná provize", amount: 30, code: "B101" }],
    })]);
    expect(iso(after[0].date)).toBe("2022-04-25");
  });

  it("respects the end of a limited subsequent commission window", () => {
    const rows = generateCashflow([base({ productKey: "domex", transferEffectiveDate: "2026-01-01",
      items: [{ title: "Následná provize (z platby)", amount: 30 }],
    })]);
    expect(rows).toEqual([]);
  });

  it("keeps actual statement money, including unexpected codes, separate from predictions", () => {
    const rows = generateCashflow([base({ items: [], commissionPayouts: [
      { key: "real", code: "A101", amount: 95, status: "paid", payoutMonthKey: "2026-9", writtenBy: "owner@example.cz" },
      { key: "someone-else", code: "A101", amount: 500, status: "paid", payoutMonthKey: "2026-9", writtenBy: "old@example.cz" },
    ] })], 10, "owner@example.cz");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 95, payoutStatus: "paid", isStatementOnly: true });
  });

  it("produces no predictions without an acquisition date, while ordinary contracts keep acquisition commissions", () => {
    expect(generateCashflow([base({ transferEffectiveDate: null })])).toEqual([]);
    const ordinary = generateCashflow([base({ acquisitionType: null, transferEffectiveDate: null })]);
    expect(ordinary.some((row) => row.commissionCode === "A101")).toBe(true);
    expect(ordinary.some((row) => row.commissionCode === "B3601")).toBe(true);
  });
});
