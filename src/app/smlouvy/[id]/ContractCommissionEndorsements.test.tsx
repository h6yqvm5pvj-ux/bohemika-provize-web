// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractCommissionSection } from "./ContractCommissionSection";
import type { ContractDoc } from "./contractDetailTypes";
import { neonCommissionDisplayFamily } from "./neonDecreaseReceipts";

const owner = "adviser@example.test";
const manager = "manager@example.test";
const original: ContractDoc = {
  id: "original", userEmail: owner, productKey: "neon", entryType: "contract",
  inputAmount: 1_000, effectiveInputAmount: 1_000,
  policyStartDate: "2025-01-01", contractSignedDate: "2024-12-01", durationYears: 10,
};
const decrease: ContractDoc = {
  id: "decrease", userEmail: owner, productKey: "neon", entryType: "endorsement",
  rootContractEntryId: "original", parentContractEntryId: "original",
  policyStartDate: "2027-01-01", previousInputAmount: 1_000,
  newInputAmount: 600, effectiveInputAmount: 600, premiumDelta: -400, changeType: "decrease",
};
const deferred = { title: "📅 Provize po 3 letech", amount: 1_000, code: "B3601" };
const base: ComponentProps<typeof ContractCommissionSection> = {
  product: "neon", isOwnContract: true, isPaymentBasedProduct: false, hideAnnualAutoTotals: false,
  showAnyMeziprovision: false, meziprovisionCards: [], expandedMeziprovisionKeys: [], onToggleMeziprovisionCard: () => {},
  adviserItems: [deferred], adviserTotalDisplay: 1_000, paymentBasedAdviserTotals: null,
  viewerEmail: owner, contractOwnerEmail: owner, contractDurationYears: 10,
  policyStartDate: original.policyStartDate, commissionEntry: original, commissionTimeline: [original, decrease],
  adviserBreakdownPosition: "poradce5", adviserBreakdownMode: "standard", contractAuthorName: "Poradce",
  showAdvisorDetails: true, onToggleAdvisorDetails: () => {}, onOpenNeonImmediateBreakdown: () => {},
};

describe("contract commission premium decreases", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the revised deferred entitlement and total with an inline source link without mutating history", async () => {
    const before = JSON.stringify([original, decrease, deferred]);
    await act(async () => root.render(<ContractCommissionSection {...base} />));
    expect(container.textContent).toContain("600,00 Kč");
    expect(container.querySelector("[data-premium-adjustment]")?.textContent).toContain("Původně 1.000,00 Kč");
    expect(container.querySelector("[data-premium-adjustment] a")?.getAttribute("href")).toBe("#contract-entry-decrease");
    expect(container.textContent).toContain("1. 1. 2027");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(1);
    expect(JSON.stringify([original, decrease, deferred])).toBe(before);
  });

  it("preserves paid rows and computes a partial payment's remainder against the revised entitlement", async () => {
    const records = [{ code: "B3601", amount: 200, expectedAmount: 1_000, difference: -800, writtenBy: owner }];
    await act(async () => root.render(<ContractCommissionSection {...base} commissionPayouts={records} />));
    expect(container.textContent).toContain("Z výpisů 200,00 Kč · zbývá 400,00 Kč");
    expect(container.textContent).toContain("Částečně 200,00 Kč");
    expect(container.textContent).not.toContain("Rozdíl -800,00 Kč");
    expect(records[0].expectedAmount).toBe(1_000);

    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionPayouts={[{ code: "B3601", amount: 700, writtenBy: owner }]} />));
    expect(container.textContent).toContain("Z výpisů 700,00 Kč");
    expect(container.textContent).toContain("Rozdíl +100,00 Kč");
    expect(container.textContent).not.toContain("zbývá");

    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionPayouts={[{ code: "B3601", amount: 1_000, writtenBy: owner }]} />));
    expect(container.querySelector("[data-premium-adjustment]")).toBeNull();
    expect(container.textContent).toContain("Vyplaceno");
    expect(container.textContent).not.toContain("600,00 Kč");
  });

  it("applies the effective date to each NEON anniversary and recomputes recurring aggregates", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base}
      adviserItems={[{ title: "🔁 Následná provize (2.–5. rok)", amount: 100, code: "B101-B104" }]}
      adviserTotalDisplay={400} commissionPayouts={[{ code: "B101", amount: 100, writtenBy: owner }]} />));
    expect(container.querySelector("summary")?.textContent).toContain("Vyplaceno 1/4 · celkem 280,00 Kč");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(3);
    expect(container.textContent).toContain("60,00 Kč – 100,00 Kč");
    expect(container.textContent).toMatch(/Celkem280,00 Kč/);
  });

  it("uses the premium effective for each care year for booked and future installments alike", async () => {
    const care = { title: "Pečovatelská provize (5.–10. rok)", code: "B201-B206", amount: 120 };
    const records = ["B201", "B202"].map((code, i) => ({
      code, statementCode: `B${202 + i}`, statementId: `statement-${i}`, key: `row-${i}`,
      statementDate: `${2030 + i}-02-01`, writtenBy: owner, amount: 72, expectedAmount: 120,
      difference: -48, status: "difference", differenceReason: "commission_amount_mismatch",
    }));
    const contract = { ...original, items: [care], commissionPayouts: records };
    const family = neonCommissionDisplayFamily(contract, [contract, decrease], owner, owner);
    await act(async () => root.render(<ContractCommissionSection {...base} consolidateNeonAmendments
      commissionEntry={family[0]} adviserItems={[care]} adviserTotalDisplay={720}
      commissionTimeline={family} commissionPayouts={family[0].commissionPayouts} />));

    const group = [...container.querySelectorAll("details")].find(el => el.querySelector("summary")?.textContent?.includes(care.title));
    expect(group?.querySelector("summary")?.textContent).toContain("Zapsané výplaty 2/6");
    expect(group?.querySelector("summary")?.textContent).toContain("Očekáváno celkem432,00 Kč");
    const rows = [...group!.querySelectorAll("details[data-tone]")];
    expect(rows).toHaveLength(6);
    for (const [i, row] of rows.entries()) {
      const summary = row.querySelector("summary")?.textContent;
      expect(summary).toContain(`B${201 + i} · plánovaná výplata ${2030 + i}`);
      expect(summary).toContain("Očekáváno 72,00 Kč");
      expect(summary).toContain(i < 2 ? "Vyplaceno dle očekávání" : "Čeká na výplatu");
    }
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Zobrazit souhrn"))?.click());
    expect(container.querySelector('section[aria-label="Porovnání plánu s výplatami"]')?.textContent)
      .toContain("Očekáváno144,00 KčVyplaceno144,00 Kč");
    expect(records[0].expectedAmount).toBe(120);
  });

  it("shows one calculation with combined recurring NEON payments and separate amendment acquisition", async () => {
    const care = { title: "Pečovatelská provize (5.–10. rok)", code: "B201-B206", amount: 299.38 };
    const rootEntry: ContractDoc = { ...original, inputAmount: 900, effectiveInputAmount: 900, policyStartDate: "2020-10-01" };
    const increase: ContractDoc = {
      ...decrease, id: "increase", changeType: "increase", policyStartDate: "2020-12-01",
      previousInputAmount: 900, newInputAmount: 951, premiumDelta: 51, effectiveInputAmount: 951,
      items: [
        { title: "Provize A101", code: "A101", amount: 51 },
        { title: "Provize po 4 letech", code: "B4801", amount: 100 },
        { ...care, amount: 16.96 },
      ],
      commissionPayouts: [{ code: "NV101", amount: 51, expectedAmount: 51, status: "paid", writtenBy: owner, statementNumber: "12" }],
    };
    await act(async () => root.render(<ContractCommissionSection {...base} consolidateNeonAmendments
      commissionEntry={rootEntry} policyStartDate={rootEntry.policyStartDate}
      commissionTimeline={[rootEntry, increase, { ...increase, id: "foreign", userEmail: "other@example.test",
        items: [{ title: "Provize A101", code: "A101", amount: 98767 }] }]}
      adviserItems={[{ title: "Provize A101", code: "A101", amount: 300 }, care]}
      adviserTotalDisplay={2096.28}
      commissionPayouts={[
        { code: "A101", amount: 300, status: "paid", writtenBy: owner, statementDate: "2020-11-25" },
        { code: "B202", expectedAmount: 316.34, amount: 316.34, status: "paid", writtenBy: owner },
      ]} />));
    const summaries = [...container.querySelectorAll("summary")].map(item => item.textContent);
    expect(container.textContent?.match(/Výpočet provizí/g)).toHaveLength(1);
    expect(summaries.filter(text => text?.includes("Pečovatelská provize"))).toHaveLength(1);
    expect(container.textContent).toContain("316,34 Kč");
    expect(container.textContent).toContain("Očekávaná provize celkem2.349,04 Kč");
    expect(container.querySelector('details a[href="#contract-entry-increase"]')?.textContent).toContain("Dodatek od");
    expect(container.textContent).toContain("Vyplaceno 51,00 Kč");
    expect(container.textContent?.match(/Složka provize/g)).toHaveLength(1);
    expect(container.querySelector('[class*="rows"]')?.lastElementChild?.textContent).toContain("Provize po 4 letech");
    expect(container.querySelector('[class*="rows"]')?.lastElementChild?.querySelector("summary")?.textContent)
      .toContain("Provize po 4 letech · plánovaná výplata 2025");
    expect(container.querySelector('a[href="#contract-entry-foreign"]')).toBeNull();
  });

  it.each([
    { a: -99.60, b: -4.80, tone: "matched", labels: ["Odečteno dle očekávání", "Odečteno dle očekávání"], total: "415,60" },
    { a: -130, b: -22, tone: "difference", labels: ["Odečteno více o 30,00 Kč", "Odečteno více o 17,00 Kč"], total: "368,00" },
  ])("links both existing deductions when a decrease is saved and shows their actual amounts ($tone)", async ({ a, b, tone, labels, total }) => {
    const items = [
      { title: "Provize A101", code: "A101", amount: 400 },
      { title: "Provize B0301", code: "B0301", amount: 120 },
    ];
    const payments = items.map(item => ({ code: item.code, amount: item.amount, status: "paid", writtenBy: owner,
      key: item.code, statementDate: "2025-01-31", statementId: "original-payment" }));
    const deductions = items.map((item, index) => ({ code: item.code, amount: index === 0 ? a : b,
      status: "storno", writtenBy: owner, key: item.code, statementId: "may-deductions", statementPeriod: "01.05.2026 - 31.05.2026" }));
    const contract = { ...original, contractNumber: "SYNTHETIC", items, commissionPayouts: [...payments, ...deductions] };
    const amendment = { ...decrease, contractNumber: contract.contractNumber, policyStartDate: "2026-04-09",
      items: items.map((item, index) => ({ ...item, amount: index === 0 ? -100 : -5 })) };
    const onOpenStatement = vi.fn();
    async function render(timeline: ContractDoc[]) {
      const family = neonCommissionDisplayFamily(contract, timeline, owner, owner);
      await act(async () => root.render(<ContractCommissionSection {...base} commissionEntry={contract} adviserItems={items}
        adviserTotalDisplay={520} consolidateNeonAmendments={family.length > 0} commissionTimeline={family}
        commissionPayouts={family[0]?.commissionPayouts ?? contract.commissionPayouts} onOpenStatement={onOpenStatement} />));
    }
    await render([contract]);
    await render([contract, amendment]);
    const rows = [...container.querySelectorAll("details[data-tone]")];
    const amendmentRows = rows.filter(row => row.querySelector("a[href='#contract-entry-decrease']"));
    expect(amendmentRows).toHaveLength(2);
    for (const [index, row] of amendmentRows.entries()) {
      expect(row.getAttribute("data-tone")).toBe(tone);
      expect(row.querySelector("summary")?.textContent).toContain(labels[index]);
      const actual = deductions[index].amount.toLocaleString("cs-CZ", { minimumFractionDigits: 2 });
      expect(row.querySelector("summary")?.textContent).toContain(`Odečteno ${actual} Kč`);
      await act(async () => row.querySelector("button")?.click());
      expect(onOpenStatement).toHaveBeenLastCalledWith("may-deductions", [items[index].code]);
    }
    expect(rows.filter(row => row.textContent?.includes("Vyplaceno dle očekávání"))).toHaveLength(2);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Zobrazit souhrn"))?.click());
    const dialog = container.querySelector("dialog")!;
    expect(dialog.querySelector('section[aria-label="Porovnání plánu s výplatami"]')?.textContent)
      .toContain(`Očekáváno415,00 KčVyplaceno${total} Kč`);
    expect(dialog.textContent).not.toContain("bez spárovaného plánu");
    expect(contract.commissionPayouts).toEqual([...payments, ...deductions]);
  });

  it("shows the Refresh reversal from the preceding period alongside the stored decrease estimate", async () => {
    const items = [{ title: "Provize A101", code: "A101", amount: 450 }, { title: "Provize B0301", code: "B0301", amount: 125 }];
    const payments = items.map(item => ({ key: item.code, code: item.code, amount: item.amount, writtenBy: owner,
      statementId: "initial", statementDate: "2022-09-30", sourceBaseAmount: 3600 }));
    const deductions = payments.map((row, i) => ({ ...row, statementId: "august", amount: i === 0 ? -269.83 : -75.01,
      status: "storno", statementPeriod: "01.08.2024 - 31.08.2024", statementDate: "23.09.2024" }));
    const contract = { ...original, contractNumber: "SYNTHETIC", isRefresh: true, policyStartDate: "2022-09-01",
      effectiveInputAmount: 900, inputAmount: 900, commissionBaseSource: "commission_statement",
      refreshCommissionBase: { calculationAnnualPremium: 3600 }, items, commissionPayouts: [...payments, ...deductions] };
    const amendment = { ...decrease, contractNumber: contract.contractNumber, policyStartDate: "2024-09-01",
      contractSignedDate: "2024-08-01", previousInputAmount: 900, newInputAmount: 400, effectiveInputAmount: 400,
      premiumDelta: -500, items: items.map((item, i) => ({ ...item, amount: i === 0 ? -150 : -45 })) };
    const family = neonCommissionDisplayFamily(contract, [contract, amendment], owner, owner);
    const onOpenStatement = vi.fn();
    await act(async () => root.render(<ContractCommissionSection {...base} consolidateNeonAmendments
      commissionEntry={contract} commissionTimeline={family} commissionPayouts={family[0].commissionPayouts}
      policyStartDate={contract.policyStartDate} adviserItems={items} adviserTotalDisplay={575} onOpenStatement={onOpenStatement} />));
    const rows = [...container.querySelectorAll("details[data-tone]")].filter(row => row.querySelector("a[href='#contract-entry-decrease']"));
    expect(rows).toHaveLength(2);
    for (const [i, row] of rows.entries()) {
      expect(row.querySelector("summary")?.textContent).toContain(i === 0 ? "Odečteno více o 119,83 Kč" : "Odečteno více o 30,01 Kč");
      await act(async () => row.querySelector("button")?.click());
      expect(onOpenStatement).toHaveBeenLastCalledWith("august", [items[i].code]);
    }
  });

  it("shows both historical month-dated top-ups as paid with their original statement codes", async () => {
    const items = [{ code: "A101", title: "Provize A101", amount: 400 }, { code: "B0301", title: "Provize B0301", amount: 120 }];
    const payments = items.map(item => ({ key: item.code, code: item.code, amount: item.amount, writtenBy: owner,
      statementId: "original-payment", statementDate: "2025-01-31" }));
    const topUps = [{ code: "NV101", amount: 40.18 }, { code: "NB0301", amount: 12.15 }].map(row => ({
      ...row, key: row.code, writtenBy: owner, statementId: "increase-payment", sourceBaseAmount: 1200,
      sourceValidFrom: "01.05.2026", sourceSignedAt: "01.05.2026", statementPeriod: "01.05.2026 - 31.05.2026",
    }));
    const contract = { ...original, contractNumber: "SYNTHETIC", items, commissionPayouts: [...payments, ...topUps] };
    const increase = { ...decrease, id: "increase", contractNumber: contract.contractNumber, policyStartDate: "2026-05-14",
      newInputAmount: 1100, effectiveInputAmount: 1100, premiumDelta: 100, changeType: "increase" as const,
      items: items.map(item => ({ ...item, amount: item.amount / 10 })) };
    const family = neonCommissionDisplayFamily(contract, [contract, increase], owner, owner);
    const onOpenStatement = vi.fn();
    await act(async () => root.render(<ContractCommissionSection {...base} consolidateNeonAmendments commissionEntry={contract}
      commissionTimeline={family} commissionPayouts={family[0].commissionPayouts} adviserItems={items} adviserTotalDisplay={520}
      onOpenStatement={onOpenStatement} />));
    const rows = [...container.querySelectorAll('details[data-tone]')].filter(row => row.querySelector('a[href="#contract-entry-increase"]'));
    expect(rows).toHaveLength(2);
    for (const [index, row] of rows.entries()) {
      expect(row.getAttribute("data-tone")).toBe("matched");
      expect(row.querySelector("summary")?.textContent).toContain("Vyplaceno dle očekávání");
      expect(row.textContent).toContain(topUps[index].code);
      await act(async () => row.querySelector("button")?.click());
      expect(onOpenStatement).toHaveBeenLastCalledWith("increase-payment", [topUps[index].code]);
    }
  });

  it.each([false, true])("reprices open NEON components after an increase (B0301 already paid: %s)", async (earlyB0301) => {
    const contract: ContractDoc = { ...original, inputAmount: 600, effectiveInputAmount: 600 };
    const increase: ContractDoc = {
      ...decrease, id: "increase", policyStartDate: "2025-03-18",
      previousInputAmount: 600, newInputAmount: 2450, effectiveInputAmount: 2450, premiumDelta: 1850, changeType: "increase",
      items: [
        { title: "Provize A101", code: "A101", amount: 7570.64 },
        { title: "Provize B0301", code: "B0301", amount: 1924.74 },
        { ...deferred, amount: 4698.63 },
      ],
      commissionPayouts: [
        { code: "NB3601", amount: 4422.24, writtenBy: owner, statementPeriod: "01.03.2028 - 31.03.2028" },
      ],
    };
    const adviserItems = [
      { title: "Provize A101", code: "A101", amount: 2455.34 },
      { title: "Provize B0301", code: "B0301", amount: 624.24 },
      { ...deferred, amount: 1523.88 },
      { title: "Provize po 4 letech", code: "B4801", amount: 274.18 },
      { title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 31.82 },
    ];
    const payouts: ComponentProps<typeof ContractCommissionSection>["commissionPayouts"] = [
      { code: "A101", amount: 2454.85, expectedAmount: 2455.34, statementPeriod: "01.02.2025 - 28.02.2025" },
      { code: "NV101", amount: 7123.69, statementPeriod: "01.03.2025 - 31.03.2025" },
      earlyB0301
        ? { code: "B0301", amount: 624.24, statementPeriod: "01.02.2025 - 28.02.2025" }
        : { code: "B0301", amount: 2398.56, expectedAmount: 624.24, difference: 1774.32, status: "difference",
          differenceReason: "premium_base_mismatch", statementPeriod: "01.04.2025 - 30.04.2025" },
      { code: "NB0301", amount: 1811.39, statementId: "top-up-statement", statementNumber: "TEST",
        sourceBaseAmount: 22200, systemBaseAmount: 29400, career: "Poradce 5",
        statementPeriod: "01.04.2025 - 30.04.2025" },
      { code: "B3601", amount: 5856.48, expectedAmount: 1523.88, statementPeriod: "01.02.2028 - 29.02.2028" },
      { code: "B101", amount: 31.85, expectedAmount: 31.82, statementPeriod: "01.06.2026 - 30.06.2026" },
    ].map(payout => ({ ...payout, writtenBy: owner }));
    const before = structuredClone(payouts);
    const onOpenStatement = vi.fn();
    await act(async () => root.render(<ContractCommissionSection {...base} consolidateNeonAmendments
      commissionEntry={contract} commissionTimeline={[contract, increase]} adviserItems={adviserItems}
      adviserTotalDisplay={5004.92} commissionPayouts={payouts} onOpenStatement={onOpenStatement} />));

    const immediate = container.querySelector("details")!;
    const [baseA101, increaseA101, baseB0301, increaseB0301] = Array.from(immediate.querySelector("div")!.children);
    expect(immediate.querySelector("summary")?.textContent).toContain("Očekáváno celkem12.574,96 Kč");
    expect(baseA101.textContent).toContain("Provize A101");
    expect(baseA101.textContent).toContain("Očekáváno 2.455,34 Kč");
    expect(baseA101.getAttribute("data-tone")).toBe("matched");
    expect(baseA101.querySelector("summary")?.textContent).toContain("Vyplaceno dle očekávání");
    expect(increaseA101.querySelector("summary")?.textContent).toContain("Doplatek za navýšení A101");
    expect(increaseA101.textContent).toContain("Kód ve výpisu NV101");
    expect(increaseA101.getAttribute("data-tone")).toBe("difference");
    expect(increaseA101.querySelector('a[href="#contract-entry-increase"]')?.textContent).toBe("Dodatek od 18. 3. 2025");
    expect(increaseA101.textContent).toContain("Očekáváno 7.570,64 Kč");
    expect(increaseA101.textContent).toContain("Vyplaceno 7.123,69 Kč");
    expect(increaseA101.textContent).toContain("Vyplaceno méně o 446,95 Kč");
    expect(increaseA101.textContent).not.toContain("Částečně 7.123,69 Kč");
    expect(increaseA101.textContent).not.toContain("Rozdíl -446,95 Kč");
    expect(baseB0301.textContent).toContain("Provize B0301");
    if (earlyB0301) {
      expect(baseB0301.textContent).toContain("Očekáváno 624,24 Kč");
      expect(increaseB0301.textContent).toContain("Očekáváno 1.924,74 Kč");
    } else {
      expect(baseB0301.textContent).toContain("Očekáváno 2.548,98 Kč");
      expect(baseB0301.textContent).toContain("Vyplaceno méně o 150,42 Kč");
      expect(increaseB0301.textContent).toContain("NB0301");
      expect(increaseB0301.textContent).toContain("Vyplaceno 1.811,39 Kč");
      expect(increaseB0301.querySelector("summary")?.textContent).toContain("Samostatně očekáváno 0,00 Kč");
      expect(increaseB0301.querySelector("summary")?.textContent).toContain("Doplatek za navýšení B0301");
      expect(increaseB0301.getAttribute("data-tone")).toBe("difference");
      await act(async () => increaseB0301.querySelector("summary")?.click());
      expect(increaseB0301.hasAttribute("open")).toBe(true);
      await act(async () => increaseB0301.querySelector("button")?.click());
      expect(onOpenStatement).toHaveBeenCalledWith("top-up-statement", ["NB0301"]);
      expect(increaseB0301.textContent).toContain("Část provize B0301 za navýšení pojistného činí 1.924,74 Kč");
      expect(container.textContent).not.toContain("+1.774,32 Kč");
    }
    const deferredRow = immediate.nextElementSibling;
    expect(deferredRow?.textContent).toContain("Očekáváno 6.222,51 Kč");
    expect(deferredRow?.nextElementSibling?.textContent).toContain("NB3601");
    expect(deferredRow?.nextElementSibling?.textContent).toContain("Vyplaceno 4.422,24 Kč");
    expect(container.textContent).toContain("1.119,57 Kč");
    expect(container.textContent).toContain("Očekáváno 129,93 Kč");
    const subsequentSummary = [...container.querySelectorAll("summary")].find(summary => summary.textContent?.includes("Následná provize"));
    expect(subsequentSummary?.textContent).toContain("Zapsané výplaty 1/4");
    expect(subsequentSummary?.textContent).toContain("Očekáváno celkem519,72 Kč");
    expect(container.textContent).toContain("Očekávaná provize celkem20.436,76 Kč");
    expect(deferredRow?.nextElementSibling?.querySelector("summary")?.textContent).toContain("Samostatně očekáváno 0,00 Kč");
    expect(container.textContent?.match(/Složka provize/g)).toHaveLength(1);
    expect(payouts).toEqual(before);

    if (!earlyB0301) {
      const openSummary = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Zobrazit souhrn"));
      await act(async () => openSummary?.click());
      const dialog = container.querySelector("dialog")!;
      expect(dialog.open).toBe(true);
      const overview = dialog.querySelector('section[aria-label="Porovnání plánu s výplatami"]');
      expect(overview?.textContent).toMatch(/Očekáváno18.927,40 KčVyplaceno24.099,06 Kč/);
      expect(overview?.textContent).toContain("+5.171,66 Kč");
      expect(dialog.textContent).not.toContain("B4801");
      expect(dialog.textContent).toContain("Doplatek za navýšení A101NV101");
      const summary = [...dialog.querySelectorAll("summary")].find(row => row.textContent?.includes("B0301 · NB0301"))!;
      expect(summary.textContent).toContain("Vyplaceno4.209,95 Kč");
      await act(async () => summary.click());
      expect(summary.parentElement?.hasAttribute("open")).toBe(true);
      expect(summary.parentElement?.textContent).toContain("22.200,00 Kč");
      expect(summary.parentElement?.textContent).toContain("Poradce 5");
      const source = [...summary.parentElement!.querySelectorAll("button")].find(button => button.textContent?.includes("Výpis TEST"));
      onOpenStatement.mockClear();
      await act(async () => source?.click());
      expect(onOpenStatement).toHaveBeenCalledWith("top-up-statement", ["NB0301"]);
      expect(container.querySelector("dialog")).toBeNull();
    }
    expect(payouts).toEqual(before);
  });

  it("scopes paid status and revised amounts separately for advisers and managers", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base} isOwnContract={false}
      viewerEmail={manager} showAnyMeziprovision expandedMeziprovisionKeys={["manager"]}
      meziprovisionCards={[{ key: "manager", email: manager, userName: "Manažer", position: "manazer8", mode: "standard",
        items: [{ ...deferred, amount: 200 }], totalDisplay: 200, totals: null }]}
      commissionPayouts={[
        { code: "B3601", amount: 1_000, writtenBy: owner },
        { code: "B3601", amount: 20, writtenBy: manager },
        { code: "B3601", amount: 200, writtenBy: "other@example.test" },
      ]} />));
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(1);
    expect(container.textContent).toContain("Z výpisů 20,00 Kč · zbývá 100,00 Kč");
    expect(container.textContent).toContain("120,00 Kč");
    expect(container.textContent).toContain("1.000,00 Kč");
  });

  it("does not apply a later amendment to an earlier deferred entitlement", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionTimeline={[original, { ...decrease, policyStartDate: "2029-01-01" }]} />));
    expect(container.querySelector("[data-premium-adjustment]")).toBeNull();
    expect(container.textContent).not.toContain("600,00 Kč");
  });

  it("shows no entitlement when the applicable premium becomes zero", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionTimeline={[original, { ...decrease, newInputAmount: 0, effectiveInputAmount: 0, premiumDelta: -1_000 }]} />));
    expect(container.textContent).toContain("Bez nároku");
    expect(container.textContent).toContain("Celkem0,00 Kč");
  });

  it("revises only eligible first-year acquisition installments and their annual total", async () => {
    const contract: ContractDoc = { ...original, productKey: "cppPPRbez", policyStartDate: "2026-09-17", frequencyRaw: "semiannual" };
    const amendment: ContractDoc = { ...decrease, productKey: "cppPPRbez", newInputAmount: 500, effectiveInputAmount: 500,
      premiumDelta: -500, policyStartDate: "2027-01-01" };
    await act(async () => root.render(<ContractCommissionSection {...base} product="cppPPRbez" isPaymentBasedProduct
      policyStartDate={contract.policyStartDate} paymentFrequency="semiannual" commissionEntry={contract}
      commissionTimeline={[contract, amendment]} adviserTotalDisplay={800} paymentBasedAdviserTotals={{ immediate: 800, subsequent: 0 }}
      adviserItems={[{ title: "💸 Okamžitá (získatelská) provize (z platby)", amount: 400, code: "A101-A102" }]}
      commissionPayouts={[{ code: "A101", amount: 400, writtenBy: owner }]} />));
    expect(container.querySelector("summary")?.textContent).toContain("Zapsané výplaty 1/2 · první rok 600,00 Kč");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(1);
    expect(container.textContent).toContain("200,00 Kč – 400,00 Kč");
    expect(container.textContent).toContain("Celkem v 1. roce600,00 Kč");
  });

  it("does not present an auto premium change as a precise future payout without prior paid history", async () => {
    const contract: ContractDoc = { ...original, productKey: "cppAuto", policyStartDate: "2026-01-01", frequencyRaw: "quarterly" };
    const amendment: ContractDoc = { ...decrease, productKey: "cppAuto", policyStartDate: "2027-07-01",
      newInputAmount: 500, effectiveInputAmount: 500, premiumDelta: -500 };
    await act(async () => root.render(<ContractCommissionSection {...base} product="cppAuto" isPaymentBasedProduct
      policyStartDate={contract.policyStartDate} paymentFrequency="quarterly" commissionEntry={contract}
      commissionTimeline={[contract, amendment]} adviserTotalDisplay={400} paymentBasedAdviserTotals={{ immediate: 0, subsequent: 400 }}
      adviserItems={[{ title: "🔁 Následná provize", amount: 100, code: "B101", excludeFromTotal: true }]} />));
    expect(container.querySelector("details > summary")?.textContent).toContain("Odhad na další pojistný rok368,00–432,00 Kč");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(0);
    expect(container.textContent).toContain("Odhad 92,00–108,00 Kč");
    expect(container.textContent).toContain("V aktuálním pojistném roce bez následných provizí");
    expect(container.textContent).not.toContain("Čeká na zápis329,29 Kč");
  });

  it.each([false, true])("shows next year's semiannual installments (current year fully paid: %s)", async (fullyPaid) => {
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    const contract: ContractDoc = {
      ...original, id: "cpp-auto-forecast", productKey: "cppAuto", inputAmount: 6_098,
      frequencyRaw: "semiannual", position: "poradce6", contractSignedDate: "2022-03-14",
      policyStartDate: "2022-03-14", durationYears: 10,
    };
    const subsequent: ComponentProps<typeof ContractCommissionSection>["adviserItems"][number] = {
      title: "🔁 Následná provize", amount: 329.29, code: "B101",
    };
    await act(async () => root.render(<ContractCommissionSection {...base}
      product="cppAuto" isPaymentBasedProduct paymentFrequency="semiannual"
      policyStartDate={contract.policyStartDate} contractDurationYears={10}
      commissionEntry={contract} commissionTimeline={[contract]}
      adviserItems={[subsequent]} adviserTotalDisplay={658.58}
      paymentBasedAdviserTotals={{ immediate: 658.58, subsequent: 658.58 }}
      commissionPayouts={(fullyPaid ? ["B107", "B108"] : ["B107"]).map(code => ({
        code, amount: 214.16, expectedAmount: 214.16, difference: 0, status: "paid", writtenBy: owner,
      }))} />));

    const details = container.querySelector("details")!;
    const summary = details.querySelector("summary")!;
    expect(details.open).toBe(false);
    expect(summary.textContent).toContain(`Aktuální pojistný rok · Vyplaceno ${fullyPaid ? 2 : 1}/2`);
    expect(summary.textContent).toContain(fullyPaid ? "Odhad na další pojistný rok394,06–462,58 Kč" : "214,16 Kč");
    await act(async () => summary.click());
    const rows = Array.from(container.querySelectorAll('[class*="breakdownRow"]'));
    const rowFor = (code: string) => rows.find(row => row.textContent?.includes(code));
    const secondPolicyYear = container.querySelector('[data-commission-policy-year="2"]');
    const thirdPolicyYear = container.querySelector('[data-commission-policy-year="3"]');

    expect(secondPolicyYear).toBeNull();
    expect(thirdPolicyYear).toBeNull();
    expect(rowFor("B107")?.textContent).toContain("Vyplaceno 214,16 Kč");
    expect(rowFor("B108")?.textContent).toContain(fullyPaid ? "Vyplaceno 214,16 Kč" : "Očekáváno 214,16 Kč");
    expect(rowFor("B108")?.textContent).not.toContain("±8 %");
    const nextYear = container.querySelector('[data-commission-policy-year="6"]');
    expect(nextYear?.textContent).toContain("0/2 vyplaceno");
    expect(rowFor("B109")?.textContent).toContain("14. 3. 2027");
    expect(rowFor("B110")?.textContent).toContain("14. 9. 2027");
    for (const code of ["B109", "B110"]) {
      expect(rowFor(code)?.textContent).toContain("Odhad 197,03–231,29 Kč");
      expect(rowFor(code)?.textContent).toContain("Čeká na zápis");
    }
    expect(rowFor("B111")).toBeUndefined();
    expect(container.querySelector('[data-commission-policy-year="7"]')).toBeNull();
    expect(rows).toHaveLength(4);
    const remaining = fullyPaid ? "0,00 Kč" : "214,16 Kč";
    expect(container.textContent).toContain(`Zbývá v aktuálním pojistném roce${remaining}`);
  });

  it("shows the next annual installment without an amount when the last receipt is too old for an estimate", async () => {
    const contract: ContractDoc = {
      ...original, id: "annual-auto-window", productKey: "cppAuto", inputAmount: 10_000,
      frequencyRaw: "annual", position: "poradce6", contractSignedDate: "2022-06-29",
      policyStartDate: "2022-06-29", durationYears: 15,
    };
    const renderAt = async (day: string) => {
      vi.setSystemTime(new Date(`${day}T12:00:00Z`));
      await act(async () => root.render(<ContractCommissionSection {...base} key={day}
        product="cppAuto" isPaymentBasedProduct paymentFrequency="annual"
        policyStartDate={contract.policyStartDate} contractDurationYears={15}
        commissionEntry={contract} commissionTimeline={[contract]}
        adviserItems={[{ title: "🔁 Následná provize", amount: 1_080, code: "B101" }]}
        commissionPayouts={[{ code: "B104", amount: 1_572.91, expectedAmount: 1_572.91,
          difference: 0, status: "paid", writtenBy: owner }]} />));
      await act(async () => container.querySelector<HTMLElement>("details > summary")!.click());
    };
    const rowFor = (code: string) => Array.from(container.querySelectorAll('[class*="breakdownRow"]'))
      .find(row => row.textContent?.includes(code));

    await renderAt("2026-11-16");
    expect(rowFor("B104")?.textContent).toContain("Vyplaceno");
    expect(rowFor("B105")?.textContent).toContain("Odhad");
    expect(container.querySelector("summary")?.textContent).toContain("Odhad na další pojistný rok");
    expect(rowFor("B106")).toBeUndefined();
    expect(container.querySelector('[data-commission-policy-year="7"]')).toBeNull();

    await renderAt("2027-07-01");
    expect(rowFor("B104")?.textContent).toContain("Vyplaceno");
    expect(rowFor("B105")?.textContent).toContain("Čeká na zápis");
    expect(rowFor("B106")?.textContent).toContain("Čeká na zápis");
    expect(rowFor("B106")?.textContent).toContain("— Kč");
    expect(rowFor("B107")).toBeUndefined();
  });

  it.each([
    { frequency: "annual" as const, secondYear: ["B101"], thirdYear: ["B102"] },
    { frequency: "quarterly" as const, secondYear: ["B101", "B102", "B103", "B104"], thirdYear: ["B105", "B106", "B107", "B108"] },
  ])("groups auto subsequent codes by annual period for $frequency payment", async ({ frequency, secondYear, thirdYear }) => {
    vi.setSystemTime(new Date("2024-10-31T12:00:00Z"));
    const contract: ContractDoc = {
      ...original, id: `cpp-auto-${frequency}`, productKey: "cppAuto", inputAmount: 6_098,
      frequencyRaw: frequency, position: "poradce6", contractSignedDate: "2022-03-14",
      policyStartDate: "2022-03-14", durationYears: 4,
    };
    await act(async () => root.render(<ContractCommissionSection {...base}
      product="cppAuto" isPaymentBasedProduct paymentFrequency={frequency}
      policyStartDate={contract.policyStartDate} contractDurationYears={4}
      commissionEntry={contract} commissionTimeline={[contract]}
      adviserItems={[{ title: "🔁 Následná provize", amount: 329.29, code: "B101" }]}
      adviserTotalDisplay={658.58} paymentBasedAdviserTotals={{ immediate: 0, subsequent: 658.58 }}
      commissionPayouts={secondYear.map(code => ({ code, amount: 329.29, status: "paid", writtenBy: owner }))} />));

    const details = container.querySelector("details")!;
    await act(async () => details.querySelector("summary")!.click());
    const codesForYear = (year: number) => {
      const group = container.querySelector(`[data-commission-policy-year="${year}"]`);
      return group?.textContent ?? "";
    };

    for (const code of secondYear) expect(codesForYear(2)).toContain(code);
    for (const code of thirdYear) expect(codesForYear(3)).toContain(code);
    expect(codesForYear(2)).not.toContain(thirdYear[0]);
  });

  it.each([
    { amount: 183.71, expectedAmount: 183.71, difference: 0, status: "paid", expectedStatus: "Vyplaceno" },
    { amount: 367.42, expectedAmount: 183.71, difference: 183.71, status: "difference", expectedStatus: "Vyplaceno" },
  ])("shows received auto renewals without comparing them with a fixed expected amount: %j", async payout => {
    const contract: ContractDoc = {
      ...original, id: "cpp-auto", productKey: "cppAuto", inputAmount: 3049,
      frequencyRaw: "semiannual", position: "poradce6", contractSignedDate: "2022-03-14",
      policyStartDate: "2022-03-14", durationYears: 6,
    };
    const subsequent: ComponentProps<typeof ContractCommissionSection>["adviserItems"][number] = {
      title: "🔁 Následná provize", amount: 329.29, code: "B101", excludeFromTotal: true,
    };
    await act(async () => root.render(<ContractCommissionSection {...base}
      product="cppAuto" isPaymentBasedProduct paymentFrequency="semiannual"
      policyStartDate={contract.policyStartDate} commissionEntry={contract} commissionTimeline={[contract]}
      adviserItems={[subsequent]} adviserTotalDisplay={329.29}
      paymentBasedAdviserTotals={{ immediate: 0, subsequent: 329.29 }}
      commissionPayouts={[{ ...payout, code: "B101", differenceReason: payout.status === "difference" ? "commission_amount_mismatch" : null, writtenBy: owner }]} />));

    const installment = Array.from(container.querySelectorAll('[class*="breakdownRow"]'))
      .find(row => row.textContent?.includes("B101"));
    expect(installment?.textContent).toContain(new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(payout.amount).replace(/\u00a0/g, " ").trim());
    expect(installment?.textContent).toContain(payout.expectedStatus);
    expect(installment?.textContent).not.toContain("Očekáváno");
    expect(installment?.textContent).not.toContain("Rozdíl");
    expect(installment?.textContent).not.toContain("Částečně");
  });

  it("uses an ambiguous recurring code's exact period instead of marking later years paid too", async () => {
    const contract: ContractDoc = { ...original, productKey: "maxdomov", policyStartDate: "2026-01-01",
      policyEndDate: "2029-01-01", frequencyRaw: "annual" };
    const amendment: ContractDoc = { ...decrease, productKey: "maxdomov", policyStartDate: "2027-07-01",
      newInputAmount: 500, effectiveInputAmount: 500, premiumDelta: -500 };
    await act(async () => root.render(<ContractCommissionSection {...base} product="maxdomov" isPaymentBasedProduct
      policyStartDate={contract.policyStartDate} paymentFrequency="annual" commissionEntry={contract}
      commissionTimeline={[contract, amendment]} adviserTotalDisplay={0} paymentBasedAdviserTotals={{ immediate: 0, subsequent: 100 }}
      adviserItems={[{ title: "🔁 Následná provize (z platby)", amount: 100, code: "B101", excludeFromTotal: true }]}
      commissionPayouts={[{ code: "B101", amount: 100, writtenBy: owner }]} />));
    expect(container.querySelector("summary")?.textContent).toContain("Vyplaceno 1/3");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(2);
    expect(container.textContent).toContain("Celkem následně ročně50,00 Kč – 100,00 Kč");
  });
});
