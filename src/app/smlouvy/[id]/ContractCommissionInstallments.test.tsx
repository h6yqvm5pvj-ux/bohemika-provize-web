// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectConfirmedCommissionCodes } from "@/app/lib/commissionPayoutCodeAdjustment";
import { ContractCommissionSection } from "./ContractCommissionSection";
import { projectContractCommissionPayouts } from "./contractCommissionInstallments";

const owner = "adviser@example.test";
const manager = "manager@example.test";
const item = { title: "💸 Okamžitá (získatelská) provize (z platby)", amount: 440.307, code: "A101-A102" };
const props: ComponentProps<typeof ContractCommissionSection> = {
  product: "cppPPRbez", isOwnContract: true, isPaymentBasedProduct: true, hideAnnualAutoTotals: false,
  showAnyMeziprovision: false, meziprovisionCards: [], expandedMeziprovisionKeys: [], onToggleMeziprovisionCard: () => {},
  adviserItems: [item], paymentFrequency: "semiannual", policyStartDate: "2026-09-17",
  viewerEmail: owner, contractOwnerEmail: owner, adviserBreakdownPosition: "poradce5", adviserBreakdownMode: "standard",
  paymentBasedAdviserTotals: { immediate: 880.614, subsequent: 293.538 }, adviserTotalDisplay: 880.614,
  contractAuthorName: "Poradce", showAdvisorDetails: true, onToggleAdvisorDetails: () => {}, onOpenNeonImmediateBreakdown: () => {},
};

describe("contract commission installment interaction", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the seventh year paid under corrected B106 and opens the original B105 source", async () => {
    const onOpenStatement = vi.fn();
    const entry = { id: "synthetic", userEmail: owner, productKey: "cppAuto" as const, frequencyRaw: "annual" as const,
      policyStartDate: "2020-07-08", contractSignedDate: "2020-07-07",
      commissionPayoutCodeAdjustment: { kind: "cpp-auto-annual-sequence-offset" as const, writtenBy: owner, fromPayoutMonthKey: "2021-6", confirmedAtMs: 1 } };
    const payouts = projectConfirmedCommissionCodes(entry, ["A102", "B101", "B102", "B103", "B104", "B105"].map((code, index) => ({
      code, amount: 100, status: "paid", writtenBy: owner, payoutMonthKey: `${2021 + index}-6`, statementId: `synthetic-${index}`,
    })));
    await act(async () => root.render(<ContractCommissionSection {...props} product="cppAuto" paymentFrequency="annual"
      policyStartDate={entry.policyStartDate} commissionEntry={entry} paymentBasedAdviserTotals={null}
      adviserItems={[{ title: "Následná provize", code: "B101", amount: 100 }]}
      commissionPayouts={payouts} onOpenStatement={onOpenStatement} />));
    const row = [...container.querySelectorAll("div")].find(element => element.className.includes("breakdownRow") && element.textContent?.includes("B106"))!;
    expect(row).toBeDefined();
    expect(row.querySelector('[data-status="paid"]')).not.toBeNull();
    expect(row.textContent).toContain("B105 → B106");
    await act(async () => row.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("synthetic-5", ["B105"]);
  });

  it("marks A104 covered by doubled A102 and opens the original source code", async () => {
    const onOpenStatement = vi.fn();
    await act(async () => root.render(<ContractCommissionSection {...props} product="zamex" paymentFrequency="quarterly"
      adviserItems={[{ title: "Okamžitá provize", code: "A101-A104", amount: 135.8 }]}
      commissionPayouts={[
        { code: "A101", amount: 135.8, status: "paid", writtenBy: owner },
        { code: "A102", amount: 271.59, status: "difference", differenceReason: "commission_amount_mismatch", writtenBy: owner, statementId: "synthetic", statementNumber: "SYNTHETIC" },
        { code: "A103", amount: 135.8, status: "paid", writtenBy: owner },
      ]} onOpenStatement={onOpenStatement} />));
    const group = container.querySelector("details")!;
    expect(group.querySelector("summary")?.textContent).toContain("Zapsané výplaty 4/4");
    expect(group.querySelector("summary")?.textContent).toContain("Vyplaceno");
    expect(group.textContent).toContain("Souhrnná výplata pod kódem A102");
    expect(group.textContent).toContain("271,59");
    const fourth = [...group.querySelectorAll("div")].find(row => row.className.includes("breakdownRow") && row.textContent?.includes("4. splátka"))!;
    expect(fourth.textContent).toContain("Vyplaceno");
    await act(async () => fourth.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("synthetic", ["A102"]);
  });

  it("shows paid quarterly acquisition installments under the confirmed periods and opens the source B code", async () => {
    const onOpenStatement = vi.fn();
    const entry = { id: "synthetic", userEmail: owner, productKey: "cppAuto" as const, frequencyRaw: "quarterly" as const,
      policyStartDate: "2023-02-08",
      commissionPayoutCodeAdjustment: {
        kind: "cpp-auto-quarterly-sequence-offset" as const, writtenBy: owner, confirmedAtMs: 1,
        sourceStatementIds: ["s1", "s2", "s3", "s4"],
      } };
    const payouts = projectConfirmedCommissionCodes(entry, ["A101", "B101", "B102", "B103", "B104"].map((code, index) => ({
      code, amount: index ? 80 : 100, expectedAmount: index ? 80 : 100, status: "paid", writtenBy: owner,
      statementId: `s${index}`, statementNumber: `TEST-${index}`,
    })));
    await act(async () => root.render(<ContractCommissionSection {...props} product="cppAuto" paymentFrequency="quarterly"
      policyStartDate={entry.policyStartDate} commissionEntry={entry} paymentBasedAdviserTotals={null}
      adviserItems={[{ title: "Okamžitá provize", code: "A101", amount: 100 }, { title: "Následná provize", code: "B101", amount: 100 }]}
      commissionPayouts={payouts} onOpenStatement={onOpenStatement} />));
    const group = [...container.querySelectorAll("details")].find(node => node.querySelector("summary")?.textContent?.includes("Získatelská provize"))!;
    expect(group.querySelector("summary")?.textContent).toContain("Zapsané výplaty 4/4");
    expect(group.querySelector("summary")?.textContent).toContain("Vyplaceno");
    const second = [...group.querySelectorAll("div")].find(node => node.className.includes("breakdownRow") && node.textContent?.includes("A102"))!;
    expect(second.textContent).toContain("Očekáváno 80,00 Kč");
    expect(second.textContent).toContain("B101 → A102");
    await act(async () => second.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("s1", ["B101"]);
  });

  it("shows A104 covered by the quarterly A103 payment with a doubled statement base", async () => {
    const onOpenStatement = vi.fn();
    const entry = { id: "synthetic-quarterly", userEmail: owner, productKey: "cppAuto" as const,
      frequencyRaw: "quarterly" as const, contractNumber: "123456789", policyStartDate: "2024-06-06",
      commissionPayouts: [
        { code: "A101", amount: 123.2, status: "paid", writtenBy: owner, sourceBaseAmount: 1100 },
        { code: "A102", amount: 124.32, status: "paid", writtenBy: owner, sourceBaseAmount: 1110 },
        { code: "A103", amount: 248.64, status: "difference", differenceReason: "premium_base_mismatch",
          expectedAmount: 124.32, systemBaseAmount: 1100, writtenBy: owner, statementId: "combined", statementNumber: "TEST" },
      ] };
    const statements = [{ id: "combined", fileName: "statement.html", statementNumber: "TEST", statementDate: null,
      period: "01.04.2025 - 30.04.2025", periodStartMs: null, periodEndMs: null, payoutMonthKey: "2025-5",
      autoPremiumRows: [{ rowId: "1", contractNumber: entry.contractNumber, client: null, productCode: "CPP_ACPIV",
        productKey: entry.productKey, commissionCode: "APZ103", basePremium: 2220, commission: 248.64,
        signedAt: null, validFrom: null, source: "own" as const }] }];
    const payouts = projectContractCommissionPayouts(entry, statements, owner);
    await act(async () => root.render(<ContractCommissionSection {...props} product="cppAuto" paymentFrequency="quarterly"
      policyStartDate={entry.policyStartDate} commissionEntry={entry} paymentBasedAdviserTotals={null}
      adviserItems={[{ title: "Okamžitá provize", code: "A101-A104", amount: 124.32 }]}
      commissionPayouts={payouts} onOpenStatement={onOpenStatement} />));
    const group = container.querySelector("details")!;
    expect(group.querySelector("summary")?.textContent).toContain("Zapsané výplaty 4/4");
    const fourth = [...group.querySelectorAll("div")].find(row => row.className.includes("breakdownRow") && row.textContent?.includes("4. splátka"))!;
    expect(fourth.textContent).toContain("Souhrnná výplata pod kódem A103");
    expect(fourth.textContent).toContain("Vyplaceno 124,32 Kč");
    await act(async () => fourth.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("combined", ["A103"]);
  });

  it("shows the corrected 2025 and 2026 periods and links each original statement code", async () => {
    const onOpenStatement = vi.fn();
    const entry = { id: "semiannual", userEmail: owner, productKey: "cppAuto" as const, frequencyRaw: "semiannual" as const,
      contractNumber: "123456789", policyStartDate: "2023-03-01", contractSignedDate: "2023-03-01", inputAmount: 4000,
      items: [{ title: "Následná provize", code: "B101", amount: 480 }] };
    const payouts = ["2025-5", "2024-10", "2025-10", "2026-1"].map((payoutMonthKey, index) => ({
      code: `B${101 + index}`, amount: [500, 960, 500, 520][index], sourceBaseAmount: index === 1 ? null : 4000,
      status: "paid", writtenBy: owner, payoutMonthKey, statementId: `statement-${index}`,
    }));
    const statements = [{ id: "statement-1", fileName: "statement.html", statementNumber: "1",
      statementDate: null, period: "01.09.2024 - 30.09.2024", periodStartMs: null, periodEndMs: null, payoutMonthKey: "2024-10",
      autoPremiumRows: [{ rowId: "1", contractNumber: entry.contractNumber, client: null, productCode: "CPP_ACPIV",
        productKey: "cppAuto" as const, commissionCode: "B102", basePremium: 8000, commission: 960,
        signedAt: null, validFrom: null, source: "own" as const }] }];
    const projected = projectContractCommissionPayouts({ ...entry, commissionPayouts: payouts }, statements, owner);
    expect(projectContractCommissionPayouts({ ...entry, commissionPayouts: payouts }, statements, manager)).toEqual(payouts);
    await act(async () => root.render(<ContractCommissionSection {...props} product="cppAuto"
      policyStartDate={entry.policyStartDate} commissionEntry={entry} paymentBasedAdviserTotals={null}
      adviserItems={[{ title: "Následná provize", code: "B101", amount: 480 }]}
      commissionPayouts={projected} onOpenStatement={onOpenStatement} />));
    const row = (code: string) => [...container.querySelectorAll("div")]
      .find(element => element.className.includes("breakdownRow") && element.querySelector('[class*="installmentCode"]')?.textContent === code);
    expect(row("B101")?.textContent).toContain("Pokryto výplatou B102");
    expect(row("B103")?.textContent).toContain("B101 → B103");
    expect(row("B104")?.textContent).toContain("B103 → B104");
    expect(row("B105")?.textContent).toContain("B104 → B105");
    expect(row("B106")?.textContent).toContain("Čeká na zápis");
    expect(row("B106")?.querySelector("button")).toBeNull();
    expect(row("B102")?.textContent).toContain("Souhrnná výplata pokrývá období B101 a B102.");
    await act(async () => row("B102")?.querySelector("button")?.click());
    expect(onOpenStatement).toHaveBeenCalledWith("statement-1", ["B102"]);
    await act(async () => row("B103")?.querySelector("button")?.click());
    expect(onOpenStatement).toHaveBeenLastCalledWith("statement-0", ["B101"]);

    await act(async () => root.render(<ContractCommissionSection {...props} product="cppAuto"
      policyStartDate={entry.policyStartDate} commissionEntry={entry} paymentBasedAdviserTotals={null}
      adviserItems={[{ title: "Následná provize", code: "B101", amount: 480 }]}
      commissionPayouts={projected.slice(1, 2)} onOpenStatement={onOpenStatement} />));
    const firstInstallment = [...container.querySelectorAll("div")].find(element =>
      element.className.includes("breakdownRow") && element.querySelector('[class*="installmentCode"]')?.textContent === "B101");
    expect(firstInstallment?.textContent).toContain("Pokryto výplatou B102");
    await act(async () => firstInstallment?.querySelector("button")?.click());
    expect(onOpenStatement).toHaveBeenLastCalledWith("statement-1", ["B102"]);
  });

  it("starts collapsed, opens the source statement and updates automatically when another payout arrives", async () => {
    const onOpenStatement = vi.fn();
    const records = [{ code: "A101", amount: 440.31, statementId: "first", statementNumber: "76", writtenBy: owner }];
    await act(async () => root.render(<ContractCommissionSection {...props} commissionPayouts={records} onOpenStatement={onOpenStatement} />));
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("Zapsané výplaty 1/2");
    expect(details.querySelector("summary")?.textContent).toContain("Částečně vyplaceno");
    await act(async () => details.querySelector("summary")!.click());
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("Období splátky · březen 2027");
    await act(async () => details.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("first", ["A101"]);

    await act(async () => root.render(<ContractCommissionSection {...props} onOpenStatement={onOpenStatement}
      commissionPayouts={[...records, { code: "A102", amount: 440.31, statementId: "second", writtenBy: owner }]} />));
    expect(details.querySelector("summary")?.textContent).toContain("Zapsané výplaty 2/2");
    expect(details.querySelector("summary")?.textContent).not.toContain("Částečně");
    expect(details.open).toBe(true);
  });

  it("settles only the exact B installment from a Kooperativa C receipt and keeps recipients separate", async () => {
    const subsequent = { title: "Následná provize", code: "B102", amount: 742.54 };
    await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto"
      paymentFrequency="annual" adviserItems={[subsequent]} paymentBasedAdviserTotals={null}
      commissionPayouts={[
        { code: "C101", amount: 1065.13, writtenBy: owner },
        { code: "C102", amount: 1065.13, writtenBy: manager },
      ]} />));
    expect(container.textContent).toContain("Čeká na zápis");
    expect(container.textContent).not.toContain("Vyplaceno");
    await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto"
      paymentFrequency="annual" adviserItems={[subsequent]} paymentBasedAdviserTotals={null}
      commissionPayouts={[{ code: "C102", amount: 1065.13, writtenBy: owner }]} />));
    expect(container.textContent).toContain("Vyplaceno");
    expect(container.textContent).not.toContain("Čeká na zápis");
  });

  it("separates the adviser, each manager and legacy records when calculating paid counts", async () => {
    await act(async () => root.render(<ContractCommissionSection {...props}
      isOwnContract={false} showAnyMeziprovision viewerEmail={manager}
      expandedMeziprovisionKeys={["manager"]}
      meziprovisionCards={[{ key: "manager", email: manager, userName: "Manažer", position: "manazer8", mode: "standard", items: [item], totals: null, totalDisplay: 880.614 }]}
      commissionPayouts={[
        { code: "A101", amount: 440.31, statementId: "adviser", writtenBy: owner },
        { code: "A102", amount: 440.31, statementId: "manager", writtenBy: manager },
        { code: "A101", amount: 440.31, statementId: "unrelated", writtenBy: "other@example.test" },
        { code: "A101", amount: 440.31, statementId: "legacy-without-owner" },
      ]} onOpenStatement={vi.fn()} />));
    const details = Array.from(container.querySelectorAll("details"));
    expect(details).toHaveLength(2);
    expect(details.map((detail) => detail.querySelector("summary")?.textContent)).toEqual([
      expect.stringContaining("Zapsané výplaty 1/2"), expect.stringContaining("Zapsané výplaty 1/2"),
    ]);
    expect(details[0].textContent).toContain("březen 2027");
    expect(details[0].querySelectorAll("button")).toHaveLength(1);
    expect(details[1].querySelectorAll("button")).toHaveLength(0);
  });

  it("keeps annual commission rows simple and the NEON recurring breakdown intact", async () => {
    await act(async () => root.render(<ContractCommissionSection {...props} paymentFrequency="annual" />));
    expect(container.querySelector("details")).toBeNull();
    await act(async () => root.render(<ContractCommissionSection {...props} product="neon" paymentFrequency="monthly"
      adviserItems={[{ title: "🔁 Následná provize (2.–5. rok)", amount: 169.38, code: "B101-B104" }]}
      commissionPayouts={[{ code: "B101", amount: 169.38, writtenBy: owner }]} />));
    expect(container.querySelector("details summary")?.textContent).toContain("Vyplaceno 1/4");
    expect(container.textContent).toContain("5. rok");
    expect(container.textContent).not.toContain("Získatelská provize");
  });

  it("expands a generic subsequent commission into cashflow B installments and statement links", async () => {
    const onOpenStatement = vi.fn();
    const subsequent = { title: "🔁 Následná provize", code: "B101", amount: 50 };
    const commissionEntry = {
      id: "cpp-auto-subsequent",
      productKey: "cppAuto" as const,
      frequencyRaw: "semiannual" as const,
      policyStartDate: "2025-07-31",
      contractSignedDate: "2025-07-20",
      items: [subsequent],
    };
    await act(async () => root.render(<ContractCommissionSection {...props}
      product="cppAuto" isPaymentBasedProduct={false} paymentFrequency="semiannual"
      policyStartDate="2025-07-31" contractDurationYears={2}
      adviserItems={[subsequent]} paymentBasedAdviserTotals={null}
      commissionEntry={commissionEntry} onOpenStatement={onOpenStatement}
      commissionPayouts={[{ code: "B101", amount: 50, statementId: "b101-statement", statementNumber: "55", writtenBy: owner }]} />));

    const details = container.querySelector("details")!;
    expect(details.querySelector("summary")?.textContent).toContain("Následná provize");
    expect(details.querySelector("summary")?.textContent).toContain("Vyplaceno 1/");
    await act(async () => details.querySelector("summary")!.click());
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("B101");
    expect(details.textContent).toContain("B102");
    await act(async () => details.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("b101-statement", ["B101"]);
  });
  it("groups a dated quarterly-to-annual change by actual policy years while preserving the first year", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2024, 9, 1, 12));
    try {
      const commissionEntry = { id: "synthetic-auto", productKey: "kooperativaAuto" as const, userEmail: owner,
        policyStartDate: "2023-09-01", contractSignedDate: "2023-09-01", frequencyRaw: "quarterly" as const,
        paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" as const }] };
      await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto"
        paymentFrequency="quarterly" policyStartDate="2023-09-01" commissionEntry={commissionEntry}
        adviserItems={[{ title: "Okamžitá provize", code: "A101", amount: 100 }, { title: "Následná provize", code: "B101", amount: 100 }]}
        commissionPayouts={[]} />));
      expect(container.querySelector('[data-commission-policy-year="2"]')?.textContent).toContain("1 provize v ročním období");
      expect(container.querySelector('[data-commission-policy-year="2"]')?.textContent).toContain("B101");
      expect(container.querySelector('[data-commission-policy-year="3"]')?.textContent).toContain("B102");
      expect(container.querySelector('[data-commission-policy-year="4"]')).toBeNull();
      expect(container.querySelector('[data-commission-policy-year="2"]')?.textContent).not.toContain("B102");
      expect(container.textContent).toContain("Zapsané výplaty 0/4");
      expect(container.textContent).toContain("červen 2024");
    } finally { vi.useRealTimers(); }
  });

  it("counts all received acquisition installments and colors their bars even when three amounts differ", async () => {
    await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto" paymentFrequency="quarterly"
      adviserItems={[{ title: "Okamžitá provize", code: "A101", amount: 150 }]}
      commissionPayouts={[
        { code: "A101", amount: 150, status: "paid", writtenBy: owner },
        { code: "A102", amount: 40, status: "difference", writtenBy: owner },
        { code: "A103", amount: 90, status: "difference", writtenBy: owner },
        { code: "A104", amount: 90, status: "difference", writtenBy: owner },
      ]} />));
    const summary = container.querySelector("details summary")!;
    expect(summary.textContent).toContain("Zapsané výplaty 4/4");
    expect(summary.querySelectorAll('[data-received="true"]')).toHaveLength(4);
    expect(summary.querySelectorAll('[data-status="difference"]')).toHaveLength(3);
    expect(summary.textContent).toContain("Rozdíl");
    expect(container.querySelectorAll('[data-received="true"]').length).toBe(4);
    expect(container.textContent).toContain("Vyplaceno 40");
  });

  it("does not count an unrecorded, foreign or fully reversed payment as received", async () => {
    await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto" paymentFrequency="quarterly"
      adviserItems={[{ title: "Okamžitá provize", code: "A101", amount: 150 }]}
      commissionPayouts={[
        { code: "A101", amount: 150, status: "paid", writtenBy: owner },
        { code: "A101", amount: -150, status: "storno", writtenBy: owner },
        { code: "A102", amount: 40, status: "difference", writtenBy: owner },
        { code: "A103", amount: 150, status: "paid", writtenBy: "foreign@example.test" },
      ]} />));
    const summary = container.querySelector("details summary")!;
    expect(summary.textContent).toContain("Zapsané výplaty 1/4");
    expect(summary.querySelectorAll('[data-received="true"]')).toHaveLength(1);
    expect(summary.querySelector('[data-status="storno"]')?.hasAttribute("data-received")).toBe(false);
  });

  it("shows actual annual receipts and uses the latest receipt for the next estimate without a false expected amount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 12));
    const receipts = [
      { code: "C101", amount: 580, expectedAmount: 150, difference: 430, status: "paid", writtenBy: owner },
      { code: "B101", amount: 20, expectedAmount: 150, difference: -130, status: "difference", differenceReason: "commission_amount_mismatch", writtenBy: owner },
      { code: "C102", amount: 650, expectedAmount: 150, difference: 500, status: "paid", writtenBy: owner },
    ];
    const before = structuredClone(receipts);
    const commissionEntry = { id: "synthetic-auto", productKey: "kooperativaAuto" as const, userEmail: owner,
      policyStartDate: "2023-09-01", contractSignedDate: "2023-09-01", frequencyRaw: "quarterly" as const,
      paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" as const }] };
    await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto"
      paymentFrequency="quarterly" policyStartDate="2023-09-01" commissionEntry={commissionEntry}
      adviserItems={[{ title: "Okamžitá provize", code: "A101", amount: 150 }, { title: "Následná provize", code: "B101", amount: 150 }]}
      commissionPayouts={receipts} />));
    const second = container.querySelector('[data-commission-policy-year="2"]')!;
    const third = container.querySelector('[data-commission-policy-year="3"]')!;
    const text = (node: Element) => node.textContent?.replace(/\s/g, "") ?? "";
    expect(text(second)).not.toContain("Očekáváno");
    expect(text(second)).toContain("Vyplaceno600,00Kč");
    expect(text(second)).not.toContain("Rozdíl");
    expect(text(third)).not.toContain("Očekáváno");
    expect(text(third)).toContain("Vyplaceno650,00Kč");
    expect(text(third)).not.toContain("Rozdíl");
    const fourth = container.querySelector('[data-commission-policy-year="4"]')!;
    expect(text(fourth)).toContain("Odhad598,00–702,00Kč");
    const fifth = container.querySelector('[data-commission-policy-year="5"]')!;
    expect(text(fifth)).toContain("B104");
    expect(text(fifth)).toContain("—Kč");
    expect(container.querySelector('[data-commission-policy-year="6"]')).toBeNull();
    expect(receipts).toEqual(before);
    expect(commissionEntry.frequencyRaw).toBe("quarterly");
  });

  it("normalizes a prior quarterly receipt when forecasting the first annual installment", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2025, 8, 1, 12));
    try {
      const commissionEntry = { id: "synthetic-forecast", productKey: "kooperativaAuto" as const, userEmail: owner,
        policyStartDate: "2023-09-01", contractSignedDate: "2023-09-01", frequencyRaw: "quarterly" as const,
        paymentFrequencyChanges: [{ effectiveDate: "2025-09-01", frequency: "annual" as const }] };
      await act(async () => root.render(<ContractCommissionSection {...props} product="kooperativaAuto"
        paymentFrequency="quarterly" policyStartDate="2023-09-01" commissionEntry={commissionEntry}
        adviserItems={[{ title: "Následná provize", code: "B101", amount: 150 }]}
        commissionPayouts={[{ code: "C104", amount: 150, status: "paid", writtenBy: owner }]} />));
      const annual = container.querySelector('[data-commission-policy-year="3"]')!;
      expect(annual.textContent?.replace(/\s/g, "")).toContain("552,00–648,00Kč");
    } finally { vi.useRealTimers(); }
  });

  it("renders one expected B103 after a saved annual premium change and keeps previous receipts", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 23, 12));
    try {
      const adviserItems = [{ title: "Následná provize", code: "B101", amount: 1392 }];
      const commissionEntry = {
        id: "synthetic-annual-change", userEmail: owner, productKey: "cppAuto" as const,
        policyStartDate: "2024-01-29", contractSignedDate: "2024-01-22", frequencyRaw: "semiannual" as const,
        position: "poradce8" as const, payoutPositionOverride: "poradce10" as const, inputAmount: 12000,
        paymentFrequencyChanges: [{ effectiveDate: "2026-01-29", frequency: "annual" as const,
          annualPremium: 22037, baseAnnualPremium: 24000 }],
      };
      await act(async () => root.render(<ContractCommissionSection {...props} product="cppAuto"
        paymentFrequency="semiannual" policyStartDate={commissionEntry.policyStartDate} commissionEntry={commissionEntry}
        adviserItems={adviserItems} adviserBreakdownPosition="poradce10"
        commissionPayouts={[
          { code: "B101", amount: 2511.11, status: "paid", writtenBy: owner },
          { code: "B102", amount: 2499.99, status: "paid", writtenBy: owner },
        ]} />));
      const annual = container.querySelector('[data-commission-policy-year="3"]')?.textContent ?? "";
      expect(annual).toContain("B103");
      expect(annual.replace(/\s/g, "")).toContain("Očekáváno2.556,29Kč");
      expect(annual.replace(/\s/g, "")).toContain("Ročnípojistné22.037,00Kč·Poradce8přisjednání");
      expect(annual).toContain("Čeká na zápis");
      expect(annual).not.toContain("Odhad");
      expect(container.querySelector("details summary")?.textContent?.replace(/\s/g, "")).toContain("2.556,29Kč");
      const paid = container.querySelector('[data-commission-policy-year="2"]')?.textContent?.replace(/\s/g, "");
      expect(paid).toContain("Vyplaceno2.511,11Kč");
      expect(paid).toContain("Vyplaceno2.499,99Kč");
    } finally { vi.useRealTimers(); }
  });

});
