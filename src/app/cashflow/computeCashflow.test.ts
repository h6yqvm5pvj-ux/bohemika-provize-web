import { runReferenceItems } from "../../../scripts/cashflow-worker/reference";
import { FLEXI_RENOVATION_MISSING_BASE } from "@/app/lib/flexiRenovation";
import { isAutoProduct } from "@/app/lib/productCatalog";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCashflow,
  type CashflowComputationOptions,
  type CashflowSnapshot,
} from "./computeCashflow";
import { SUBSCRIPTION_CASHFLOW_OWNER_EMAIL } from "./subscriptionCashflow";
import type { EntryDoc } from "./types";

const asOf = new Date(2026, 8, 12, 12);
const email = SUBSCRIPTION_CASHFLOW_OWNER_EMAIL;
const memberEmail = "member@example.cz";

function snapshotFixture(): CashflowSnapshot {
  const ownAuto: EntryDoc = {
    id: "own-auto",
    userEmail: email,
    productKey: "kooperativaAuto",
    frequencyRaw: "quarterly",
    policyStartDate: new Date(2026, 1, 25),
    contractSignedDate: new Date(2026, 1, 23),
    position: "poradce2",
    inputAmount: 7200,
    status: "storno",
    stornoDate: new Date(2026, 3, 21),
    items: [{ title: "Okamžitá provize", amount: 609.56, code: "A101" }],
    commissionPayouts: [
      { key: "paid", code: "APZ101", amount: 609.56, status: "paid", payoutMonthKey: "2026-3", writtenBy: email },
      { key: "storno", code: "APZ101", amount: -609.56, status: "storno", payoutMonthKey: "2026-4", writtenBy: email },
    ],
  };
  const inherited: EntryDoc = {
    id: "inherited-life",
    userEmail: email,
    productKey: "neon",
    acquisitionType: "inherited",
    originalAdviserEmail: "old@example.cz",
    originalPosition: "poradce3",
    servicingOwnerEmail: email,
    transferEffectiveDate: "2022-02-01",
    commissionMode: "standard",
    frequencyRaw: "annual",
    inputAmount: 1000,
    policyStartDate: new Date(2020, 0, 15),
    contractSignedDate: new Date(2020, 0, 1),
    items: [
      { title: "Okamžitá provize", amount: 1000, code: "A101" },
      { title: "Následná provize (2.–5. rok)", amount: 20, code: "B101-B104" },
      { title: "Pečovatelská provize (5.–10. rok)", amount: 10, code: "B201-B206" },
    ],
  };
  const teamAuto: EntryDoc = {
    id: "team-auto",
    userEmail: memberEmail,
    productKey: "cppAuto",
    frequencyRaw: "monthly",
    policyStartDate: new Date(2025, 0, 31),
    contractSignedDate: new Date(2025, 0, 20),
    ownerCurrentPosition: "poradce4",
    position: "poradce2",
    items: [{ title: "Okamžitá provize", amount: 100, code: "A101" }],
    managerOverrides: [{
      email,
      position: "manazer5",
      commissionMode: "standard",
      total: 999999,
      items: [
        { title: "Okamžitá provize", amount: 12, code: "A101" },
        { title: "Následná provize", amount: 8, code: "B101" },
        { title: "Celkem", amount: 999999, code: "TOTAL" },
      ],
    }],
  };
  return {
    email,
    myPosition: "manazer8",
    myCommissionMode: "accelerated",
    hasAnyTeam: true,
    ownEntries: [
      ownAuto,
      inherited,
      {
        ...inherited,
        id: "transferred-life",
        acquisitionType: null,
        originalPosition: "poradce5",
      },
      {
        id: "missing-start",
        userEmail: email,
        productKey: "cppAuto",
        frequencyRaw: "annual",
        items: [{ title: "Okamžitá provize", amount: 90, code: "A101" }],
      },
    ],
    teamEntriesRaw: [
      { ...ownAuto },
      teamAuto,
      { ...teamAuto, id: "no-override", managerOverrides: [] },
      {
        ...inherited,
        id: "team-life",
        userEmail: memberEmail,
        acquisitionType: null,
        originalAdviserEmail: null,
        servicingOwnerEmail: null,
        ownerCurrentPosition: "poradce2",
        managerOverrides: [{
          email,
          position: "manazer4",
          commissionMode: "accelerated",
          total: 40,
          items: [{ title: "Následná provize (2.–5. rok)", amount: 10, code: "B101-B104" }],
        }],
      },
    ],
    tipPayouts: [
      { id: "valid", payoutDate: new Date(2026, 7, 25).getTime(), amount: 350, productKey: "neon", sourceOwnerEmail: "  Jan.Novak@Example.cz ", clientName: " Klient " },
      { payoutDate: new Date(2026, 8, 25).getTime(), amount: 125, adviserEmail: "other@example.cz" },
      { id: "invalid-date", payoutDate: Number.NaN, amount: 100 },
      { id: "negative", payoutDate: new Date(2026, 8, 25).getTime(), amount: -100 },
    ],
    subscriptionPayments: [
      { id: "old", userEmail: "subscriber@example.cz", plan: "monthly", amountCzk: 300, periodFrom: "2026-01-31" },
      { id: "current", userEmail: "subscriber@example.cz", plan: "monthly", amountCzk: 450, periodFrom: "2026-04-30", periodUntil: "2026-07-29", paymentDateMs: new Date(2026, 4, 2).getTime() },
      { id: "yearly", userEmail: "yearly@example.cz", plan: "yearly", amountCzk: 900, periodFrom: "2026-09-12" },
      { id: "invalid", userEmail: "invalid@example.cz", plan: "unknown", amountCzk: 900, periodFrom: "2026-09-12" },
      { id: "invalid-date", userEmail: "invalid@example.cz", plan: "yearly", amountCzk: 900, periodFrom: "2026-02-30" },
    ],
  };
}

// Dates and timestamps embedded in generated IDs use local calendar fields so
// the frozen legacy samples also run in UTC, without changing production dates.
function canonical(value: unknown): unknown {
  if (value instanceof Date) {
    return [value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds()];
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      key === "id" && typeof child === "string"
        ? child.replace(/-(\d{13})-/g, (_match, timestamp) => `-${JSON.stringify(canonical(new Date(Number(timestamp))))}-`)
        : canonical(child),
    ]));
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

const legacyCases: Array<[string, CashflowComputationOptions, string]> = [
  ["combined", { scopeFilter: "combined", productFilter: "all" }, "5eef7a68e4ffbe9e974996ad20e5ef78708c987e8e942621671e565679639525"],
  ["own", { scopeFilter: "own", productFilter: "all" }, "4d4b6424c08418e66f6abf092a26e172162015cce11cdf71426ea3016187679c"],
  ["team", { scopeFilter: "team", productFilter: "all" }, "cfdd267677f99a0145ee84c8c7479f7cf28508b8fb8d60c9d4d0129b71c03a6a"],
  ["life", { scopeFilter: "combined", productFilter: "life" }, "aaa1dfd9827a833d275159c62670edc4eda4936b5492840805e06133fcf30dba"],
  ["auto", { scopeFilter: "combined", productFilter: "auto" }, "a02faff539d2c3e9848181da46d5fc0368270064ec79a3a5de080dc1ac28ebe0"],
  ["tip", { scopeFilter: "own", productFilter: "tip" }, "d81fff1d49edd4125931996b4ef5c4fee843a509193dc9fd701055bee03408e4"],
  ["team tip", { scopeFilter: "team", productFilter: "tip" }, "d81fff1d49edd4125931996b4ef5c4fee843a509193dc9fd701055bee03408e4"],
  ["subscription", { scopeFilter: "own", productFilter: "subscription" }, "cd243808d363a2723b14790f08344ff211424828db11c14d3fb8525a58555b19"],
  ["tipster", { scopeFilter: "combined", productFilter: "all", tipsterMode: true }, "d81fff1d49edd4125931996b4ef5c4fee843a509193dc9fd701055bee03408e4"],
];

describe("computeCashflow", () => {
  it("shows only the viewer's received team FLEXI payments while their commission base is unknown", () => {
    const snapshot = snapshotFixture();
    snapshot.teamEntriesRaw = [{
      id: "flexi-pending", userEmail: memberEmail, productKey: "flexi",
      commissionCalculationStatus: FLEXI_RENOVATION_MISSING_BASE, inputAmount: 1500,
      policyStartDate: "2026-08-01", frequencyRaw: "monthly", managerOverrides: [],
      commissionPayouts: [
        { key: "manager-paid", code: "A101", amount: 234.56, status: "paid", payoutMonthKey: "2026-09", writtenBy: email },
        { key: "owner-paid", code: "A101", amount: 2345.67, status: "paid", payoutMonthKey: "2026-09", writtenBy: memberEmail },
      ],
    }];
    const own = { ...snapshot.teamEntriesRaw[0], id: "own-flexi-pending", userEmail: email };
    snapshot.ownEntries = [own];
    snapshot.teamEntriesRaw.push(own);
    const rows = computeCashflow(snapshot, { scopeFilter: "team", productFilter: "all", asOf })
      .filter(row => row.productKey === "flexi");
    expect(rows).toEqual([expect.objectContaining({
      entryId: "flexi-pending", source: "manager", amount: 234.56, payoutStatus: "paid", predictedAmount: null,
    })]);
  });

  it("excludes retired own, team and TIP records from a cached snapshot", () => {
    const clean = snapshotFixture();
    const cached = snapshotFixture();
    const retiredProduct = "comfortcc" as EntryDoc["productKey"];
    cached.ownEntries.push({ ...cached.ownEntries[0], id: "retired-own", productKey: retiredProduct });
    cached.teamEntriesRaw.push({ ...cached.teamEntriesRaw[1], id: "retired-team", productKey: retiredProduct });
    cached.tipPayouts.push({ ...cached.tipPayouts[0], id: "retired-tip", productKey: retiredProduct });
    const options: CashflowComputationOptions = { scopeFilter: "combined", productFilter: "all", asOf };
    expect(computeCashflow(cached, options)).toEqual(computeCashflow(clean, options));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
  });
  afterEach(() => vi.useRealTimers());

  // Frozen fingerprints guard the full cashflow output. Combined, team and auto
  // reflect the corrected policy-period boundary for monthly auto installments.
  // The life fingerprint includes NEON care payouts after completed policy years.
  it.each(legacyCases)("preserves every output field for %s", (_name, options, expected) => {
    const legacyFields = computeCashflow(snapshotFixture(), { ...options, asOf }).map(item => {
      // Entitlement periods were previously exposed only for Kooperativa B1
      // rows. Compare every original field while allowing this new metadata.
      if (item.productKey === "kooperativaAuto" && /^B1\d{2,}$/.test(item.commissionCode ?? "")) return item;
      return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "commissionPeriodStart"));
    });
    if (["combined", "own", "team", "auto"].includes(_name)) {
      // Only B/C auto forecasts intentionally change. Preserve the complete
      // frozen output of every acquisition, life, TIP and subscription row.
      const unchanged = (item: Record<string, unknown>) => !(isAutoProduct(item.productKey as EntryDoc["productKey"]) &&
        /^B/.test(baseCommissionCodeForPayoutComparison(item.commissionCode, item.productKey as EntryDoc["productKey"])));
      const reference = runReferenceItems(snapshotFixture(), { ...options, tipsterMode: options.tipsterMode ?? false,
        showPastYears: true, intelligentPredictionEnabled: false, contractNumberQuery: "" }, asOf).map(item => {
        if (item.productKey === "kooperativaAuto" && /^B1\d{2,}$/.test(item.commissionCode ?? "")) return item;
        return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "commissionPeriodStart"));
      });
      expect(fingerprint(legacyFields.filter(unchanged))).toBe(fingerprint(reference.filter(unchanged)));
    } else expect(fingerprint(legacyFields)).toBe(expected);
  });

  it("keeps original transfer positions and uses current own and manager positions", () => {
    const items = computeCashflow(snapshotFixture(), { scopeFilter: "combined", productFilter: "all", asOf });
    const byEntry = (id: string) => items.find((item) => item.entryId === id);
    expect(byEntry("own-auto")?.predictionPosition).toBe("manazer8");
    expect(byEntry("inherited-life")?.predictionPosition).toBe("poradce3");
    expect(byEntry("transferred-life")?.predictionPosition).toBe("poradce5");
    expect(byEntry("inherited-life")?.predictionCommissionMode).toBe("standard");
    expect(byEntry("team-auto")).toMatchObject({ source: "manager", predictionPosition: "manazer8", predictionBaselinePosition: "poradce4" });
    expect(byEntry("team-life")?.predictionCommissionMode).toBe("standard");
    expect(byEntry("no-override")).toBeUndefined();
    expect(items.some((item) => item.amount === 999999)).toBe(false);
    expect(items.filter((item) => item.entryId === "own-auto").map((item) => item.amount)).toEqual([609.56, -609.56]);
  });

  it("normalizes tip payouts and preserves existing tipster filtering", () => {
    const items = computeCashflow(snapshotFixture(), { scopeFilter: "team", productFilter: "life", tipsterMode: true, asOf });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ amount: 350, isTipPayout: true, clientName: "Klient", tipSourceAdviserEmail: "jan.novak@example.cz", tipSourceAdviserName: "Jan Novak" });
    expect(items[1]).toMatchObject({ amount: 125, isTipPayout: true, productKey: "unknown" });
  });

  it("forecasts the latest subscription amount and includes actual payments once", () => {
    const items = computeCashflow(snapshotFixture(), { scopeFilter: "own", productFilter: "subscription", asOf });
    expect(items.filter((item) => item.payoutStatus === "paid").map((item) => item.amount)).toEqual([300, 450, 900]);
    const monthlyForecasts = items.filter((item) => item.subscriptionPlan === "monthly" && item.payoutStatus === "predicted");
    expect(monthlyForecasts.every((item) => item.amount === 450)).toBe(true);
    expect(monthlyForecasts[0].subscriptionPeriodFrom).toBe("2026-07-30");
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.every((item) => item.date <= new Date(2036, 8, 12, 12))).toBe(true);
  });

  it("excludes subscriptions for a different owner and for team scope", () => {
    const snapshot = snapshotFixture();
    expect(computeCashflow(snapshot, { scopeFilter: "team", productFilter: "subscription", asOf })).toEqual([]);
    snapshot.email = "other@example.cz";
    expect(computeCashflow(snapshot, { scopeFilter: "own", productFilter: "subscription", asOf })).toEqual([]);
  });

  it("uses the explicit date for horizons, storno cutoff and missing start dates", () => {
    const snapshot = snapshotFixture();
    snapshot.ownEntries.push({
      id: "storno-without-date",
      userEmail: email,
      productKey: "cppAuto",
      frequencyRaw: "annual",
      policyStartDate: new Date(2025, 0, 15),
      status: "storno",
      items: [{ title: "Okamžitá provize", amount: 90, code: "A101" }],
    });
    const options = { scopeFilter: "combined", productFilter: "all", asOf } as const;
    const expected = computeCashflow(snapshot, options);
    vi.setSystemTime(new Date(2031, 0, 1));
    expect(computeCashflow(snapshot, options)).toEqual(expected);
    expect(computeCashflow(snapshot, { scopeFilter: "combined", productFilter: "all" })).not.toEqual(expected);
    expect(expected.find((item) => item.entryId === "missing-start")?.date).toEqual(new Date(2026, 9, 25));
    const stornoItems = expected.filter((item) => item.entryId === "storno-without-date");
    expect(stornoItems.length).toBeGreaterThan(0);
    expect(stornoItems.every((item) => item.date < new Date(2026, 8, 1))).toBe(true);
  });

  it("does not mutate the supplied snapshot or computation date", () => {
    const snapshot = snapshotFixture();
    const before = structuredClone(snapshot);
    const freeze = (value: unknown): void => {
      if (value && typeof value === "object") {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(snapshot);
    const time = asOf.getTime();
    computeCashflow(snapshot, { scopeFilter: "combined", productFilter: "all", asOf });
    expect(snapshot).toEqual(before);
    expect(asOf.getTime()).toBe(time);
  });
});
