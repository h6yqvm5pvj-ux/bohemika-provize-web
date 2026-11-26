// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { calculateNeon } from "@/app/lib/productFormulas/neon";
import { calculateDomex } from "@/app/lib/productFormulas/domex";
import { calculateFlexi } from "@/app/lib/productFormulas/flexi";
import { CommissionStornoComparison } from "@/app/components/CommissionStornoComparison";
import { commissionPayoutPositionForOwner } from "@/lib/server/commissionPayoutPositionPolicy";
import { buildContractStornoComparison } from "./contractFinancialOverviewModel";
import { formatMoney } from "./contractDetailHelpers";
import type { ContractDoc } from "./contractDetailTypes";
import { ContractCommissionSection } from "./ContractCommissionSection";
import styles from "./contractCommission.module.css";

type Props = ComponentProps<typeof ContractCommissionSection>;
const owner = "adviser@example.test";
const props: Props = {
  product: "neon", isOwnContract: true, isPaymentBasedProduct: false, hideAnnualAutoTotals: false,
  showAnyMeziprovision: false, meziprovisionCards: [], expandedMeziprovisionKeys: [], onToggleMeziprovisionCard: () => {},
  adviserItems: [{ title: "Následná provize (2.–5. rok)", amount: 66.53, code: "B101-B104" }],
  viewerEmail: owner, contractOwnerEmail: owner, adviserBreakdownPosition: "poradce5", adviserBreakdownMode: "standard",
  paymentBasedAdviserTotals: null, adviserTotalDisplay: 266.12,
  contractAuthorName: "Poradce", showAdvisorDetails: true, onToggleAdvisorDetails: () => {}, onOpenNeonImmediateBreakdown: () => {},
};

function render(overrides: Partial<Props> = {}) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ContractCommissionSection {...props} {...overrides} />);
  return container;
}

describe("storno of commission installments in the contract detail", () => {
  it("only expects a refund from the unearned fourth quarter on a historical policy", () => {
    const contract: ContractDoc = {
      id: "synthetic-quarterly", productKey: "cppAuto", frequencyRaw: "quarterly",
      contractSignedDate: "2025-07-16", policyStartDate: "2025-07-16", policyEndDate: "2026-05-28",
      commissionPayouts: [
        ...["2025-07-31", "2025-10-31", "2026-01-31", "2026-04-30"].map((statementDate, index) => ({
          code: `A10${index + 1}`, statementDate, amount: 543.96, writtenBy: owner,
        })),
        { code: "AP104", statementDate: "2026-05-31", amount: -286.67, writtenBy: owner },
      ],
    };
    const rows = buildContractStornoComparison({ contract,
      timeline: [], ownerEmail: owner, viewerEmail: owner }, "2026-05-28");
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(rows && <CommissionStornoComparison rows={rows} />);
    const renderedRows = Array.from(container.querySelectorAll("tbody tr"));

    expect(renderedRows.map(row => row.querySelector("th")?.textContent)).toEqual(["A104"]);
    expect(rows?.[3]).toEqual({ code: "A104", paid: 54_396, estimated: 29_290, deducted: 28_667, difference: -623 });
    expect(renderedRows[0].textContent).toContain("292,90");
    expect(renderedRows[0].textContent).toContain("286,67");
    expect(renderedRows[0].textContent).toMatch(/Storno je o 6,23\sKč nižší/);
  });

  it("keeps a recorded deduction visible even when the projected refund is zero", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<CommissionStornoComparison rows={[
      { code: "A101", paid: 10_000, estimated: 0, deducted: 1_000, difference: 1_000 },
      { code: "A102", paid: 10_000, estimated: null, deducted: null, difference: null },
    ]} />);
    expect(Array.from(container.querySelectorAll("tbody th"), cell => cell.textContent)).toEqual(["A101"]);
    expect(container.textContent).toContain("Bez vratky");
    expect(container.textContent).toMatch(/Storno je o 10,00\sKč vyšší/);
  });

  it("shows both deferred FLEXI payouts reported in the statement month of a mid-month storno", () => {
    const contract: ContractDoc = {
      id: "synthetic-flexi", productKey: "flexi", policyStartDate: "2025-01-16",
      commissionPayouts: [
        { code: "B36", amount: 2_665.35, statementPeriod: "01.06.2026 - 30.06.2026", writtenBy: owner },
        { code: "B48", amount: 486.09, statementDate: "2026-06-30", writtenBy: owner },
        { code: "B3601", amount: -2_665.35, statementDate: "2026-06-30", writtenBy: owner },
        { code: "B4801", amount: -486.09, statementDate: "2026-06-30", writtenBy: owner },
      ],
    };
    const rows = buildContractStornoComparison({ contract, timeline: [], ownerEmail: owner, viewerEmail: owner }, "2026-06-16");
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(rows && <CommissionStornoComparison rows={rows} />);
    expect(container.textContent).toContain("Vyplaceno z výpisů");
    const cells = Array.from(container.querySelectorAll<HTMLTableRowElement>("tbody tr"),
      row => Array.from(row.cells, cell => cell.textContent));
    expect(cells).toEqual([
      ["B3601", expect.stringMatching(/2\s665,35\sKčBez doloženého data před stornem/),
        expect.stringMatching(/2\s665,35\sKč \(100\s%\)/), expect.stringMatching(/2\s665,35\sKč/), "Storno sedí"],
      ["B4801", expect.stringMatching(/486,09\sKčBez doloženého data před stornem/),
        expect.stringMatching(/486,09\sKč \(100\s%\)/), expect.stringMatching(/486,09\sKč/), "Storno sedí"],
    ]);
  });
});

describe("recorded commission amounts", () => {
  it("matches the A501 statement to an older MAXIMA foreign nationals calculation without a code", () => {
    const container = render({
      product: "maxcizinkomplex",
      adviserItems: [{ title: "💸 Okamžitá provize", amount: 175.475, note: "Varianta EXCLUSIVE / STANDARD" }],
      adviserTotalDisplay: 175.475,
      commissionPayouts: [{ code: "A501", amount: 175.48, status: "paid", writtenBy: owner }],
    });
    expect(container.textContent).toContain(`Vyplaceno ${formatMoney(175.48)}`);
    expect(container.textContent).not.toContain("Čeká na zápis");
  });

  const variants: { name: string; code: string; overrides: Partial<Props> }[] = [
    { name: "recurring installment", code: "B102", overrides: {} },
    { name: "deferred commission", code: "B4801", overrides: {
      adviserItems: [{ title: "Provize po 4 letech", code: "B4801", amount: 66.53 }],
    } },
    { name: "split immediate commission", code: "A101", overrides: {
      adviserItems: [{ title: "Provize A101", code: "A101", amount: 66.53 }],
    } },
    { name: "acquisition installment", code: "A102", overrides: {
      product: "cppPPRbez", isPaymentBasedProduct: true, paymentFrequency: "semiannual", policyStartDate: "2026-09-17",
      adviserItems: [{ title: "Okamžitá (získatelská) provize (z platby)", code: "A101-A102", amount: 66.53 }],
    } },
  ];

  it.each(variants)("shows expected, paid and difference together for a $name", ({ code, overrides }) => {
    const container = render({ ...overrides, commissionPayouts: [{
      code, amount: 11.64, expectedAmount: 66.53, difference: -54.89, status: "difference", writtenBy: owner,
    }] });
    const paid = Array.from(container.querySelectorAll("span")).find((element) => element.textContent === "Vyplaceno 11,64 Kč");
    expect(paid).toBeDefined();
    const amounts = paid!.parentElement!;
    expect(amounts.textContent).toContain("Očekáváno 66,53 Kč");
    expect(amounts.textContent).toContain("Rozdíl -54,89 Kč");
  });

  it.each([0, 66.53, 100])("displays a recorded payout of %s including zero and overpayment", (amount) => {
    const container = render({ commissionPayouts: [{
      code: "B102", amount, expectedAmount: 66.53, difference: amount - 66.53,
      status: amount === 66.53 ? "paid" : "difference", writtenBy: owner,
    }] });
    const formatted = amount.toFixed(2).replace(".", ",");
    expect(container.textContent).toContain(`Vyplaceno ${formatted} Kč`);
  });

  it("uses actual statement amounts rather than deriving payment from the stored difference", () => {
    const container = render({ commissionPayouts: [
      { code: "B102", amount: 5.12, difference: -54.89, status: "difference", writtenBy: owner },
      { code: "B102", amount: 7.22, difference: 0, status: "paid", writtenBy: owner },
    ] });
    expect(container.textContent).toContain("Vyplaceno 12,34 Kč");
    expect(container.textContent).not.toContain("Vyplaceno 11,64 Kč");
  });

  it("does not invent a paid amount for an unrecorded commission or another recipient", () => {
    const container = render({ commissionPayouts: [{ code: "B102", amount: 123.45, writtenBy: "other@example.test" }] });
    expect(container.textContent).toContain("Čeká na zápis");
    expect(container.textContent).not.toContain("Vyplaceno 0,00 Kč");
    expect(container.textContent).not.toContain("123,45 Kč");
    expect(container.textContent).not.toContain("Očekáváno");
  });

  it.each([null, Number.NaN])("does not treat an invalid statement amount (%s) as a recorded zero", (amount) => {
    const container = render({ commissionPayouts: [{ code: "B102", amount, writtenBy: owner }] });
    expect(container.textContent).not.toContain("Vyplaceno 0,00 Kč");
  });

  it("keeps a fully cancelled payout separate from paid commissions", () => {
    const container = render({ commissionPayouts: [
      { code: "B102", amount: 66.53, writtenBy: owner },
      { code: "B102", amount: -66.53, status: "storno", writtenBy: owner },
    ] });
    expect(container.textContent).toContain("Storno");
    expect(container.textContent).not.toContain("Vyplaceno 66,53 Kč");
    expect(container.textContent).not.toContain("Vyplaceno 0,00 Kč");
  });

  it("shows the cancelled Allianz renewal without an expected payout amount", () => {
    const container = render({
      product: "allianzAuto", paymentFrequency: "monthly", hideAnnualAutoTotals: true,
      adviserItems: [
        { title: "Okamžitá provize", code: "A101", amount: 1_200 },
        { title: "Následná provize", code: "B101", amount: 900, excludeFromTotal: true },
      ],
      commissionEntry: { id: "cancelled", productKey: "allianzAuto", status: "storno",
        stornoDate: "2026-07-23", policyStartDate: "2026-01-11", frequencyRaw: "monthly" },
      commissionPayouts: [
        { code: "A101", amount: 1_200, status: "paid", writtenBy: owner },
        { code: "A101", amount: -500, status: "storno", writtenBy: owner },
      ],
    });
    expect(container.textContent).toContain("Následná provizePo stornu se neočekává");
    expect(container.textContent).toContain(`Vyplaceno ${formatMoney(1_200)}`);
    expect(container.textContent).toContain(`Storno ${formatMoney(-500)}`);
    expect(container.textContent).not.toContain(formatMoney(900));
    expect(container.textContent).not.toContain("Čeká na zápis");
  });

  it("keeps recorded renewals and unrecorded periods before cancellation visible", () => {
    const container = render({
      commissionEntry: { id: "cancelled", productKey: "neon", status: "storno",
        stornoDate: "2024-01-11", policyStartDate: "2021-01-11" },
      commissionPayouts: [{ code: "B104", amount: 66.53, status: "paid", writtenBy: owner }],
    });
    const row = (code: string) => Array.from(container.querySelectorAll(`.${styles.breakdownRow}`))
      .find(element => element.textContent?.includes(code))?.textContent;
    expect(row("B101")).toContain("Čeká na zápis");
    expect(row("B102")).toContain("Čeká na zápis");
    expect(row("B103")).toContain("Po stornu se neočekává");
    expect(row("B103")).not.toContain(formatMoney(66.53));
    expect(row("B104")).toContain(`Vyplaceno ${formatMoney(66.53)}`);
  });

  it("shows the original payout, cancellation deduction, and remaining balance in the cancelled contract summary", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ContractCommissionSection {...props}
        product="allianzAuto" paymentFrequency="annual"
        adviserItems={[{ title: "Okamžitá provize", code: "A101", amount: 1_200 }]}
        commissionEntry={{ id: "cancelled", productKey: "allianzAuto", status: "storno",
          stornoDate: "2026-07-23", policyStartDate: "2026-01-11" }}
        commissionPayouts={[
          { code: "A101", amount: 1_200, statementDate: "2026-01-31", status: "paid", writtenBy: owner },
          { code: "A101", amount: -500, statementDate: "2026-07-31", status: "storno", writtenBy: owner },
          { code: "A101", amount: 5_000, statementDate: "2026-01-31", status: "paid", writtenBy: "other@example.test" },
        ]} />));
      const trigger = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Zobrazit souhrn"));
      await act(async () => trigger?.click());
      const dialog = container.querySelector("dialog");
      const amounts = dialog?.querySelector('[aria-label="Vyúčtování stornované smlouvy"]')?.textContent;
      expect(amounts).toContain(`Vyplaceno${formatMoney(1_200)}`);
      expect(amounts).toContain(`Storno${formatMoney(-500)}`);
      expect(amounts).toContain(`Po stornu${formatMoney(700)}`);
      expect(dialog?.querySelector("summary")?.textContent).toContain(`Vyplaceno${formatMoney(1_200)}`);
      expect(dialog?.textContent).not.toContain("Pod očekáváním");
      expect(dialog?.textContent).not.toContain(formatMoney(5_000));
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

describe("increase receipts in the correct amendment context", () => {
  it("settles A101 and B0301 using raw NV/NB receipts only on an amendment", () => {
    const overrides: Partial<Props> = {
      adviserItems: [{ title: "Provize A101", code: "A101", amount: 100 }, { title: "Provize B0301", code: "B0301", amount: 25 }],
      commissionEntry: { id: "one", entryType: "endorsement", productKey: "neon", policyStartDate: "2025-05-01" },
      commissionPayouts: [
        { code: "NV101", amount: 100, expectedAmount: 100, difference: 0, status: "paid", writtenBy: owner },
        { code: "NB0301", amount: 25, expectedAmount: 25, difference: 0, status: "paid", writtenBy: owner },
      ],
    };
    const amendment = render(overrides);
    expect(amendment.textContent).toContain("Vyplaceno 100,00 Kč");
    expect(amendment.textContent).toContain("Vyplaceno 25,00 Kč");
    expect(amendment.textContent).not.toContain("Čeká na zápis");
    const original = render({ ...overrides, commissionEntry: { ...overrides.commissionEntry!, entryType: "contract" } });
    expect(original.textContent).toContain("Čeká na zápis");
    expect(original.textContent).not.toContain("Vyplaceno 100,00 Kč");
  });
});

describe("deferred increase amounts in contract detail", () => {
  it("shows NB3601 and NB4801 paid on their own components and keeps NB0301 pending", () => {
    const container = render({
      adviserItems: [{ code: "B0301", title: "Provize B0301", amount: 25 },
        { code: "B3601", title: "Provize po 3 letech", amount: 75 },
        { code: "B4801", title: "Provize po 4 letech", amount: 15 }],
      commissionEntry: { id: "one", entryType: "endorsement", productKey: "neon", policyStartDate: "2025-05-01" },
      commissionPayouts: [
        { code: "NB3601", amount: 75, expectedAmount: 75, difference: 0, status: "paid", writtenBy: owner },
        { code: "NB4801", amount: 15, expectedAmount: 15, difference: 0, status: "paid", writtenBy: owner },
      ],
    });
    const card = Array.from(container.querySelectorAll("span")).find(span => span.textContent === "Provize B0301")?.closest(`.${styles.breakdownRow}`);
    expect(card?.textContent).toContain("Čeká na zápis");
    for (const [title, paid] of [["Provize po 3 letech", "75,00 Kč"], ["Provize po 4 letech", "15,00 Kč"]]) {
      const row = Array.from(container.querySelectorAll("span")).find(span => span.textContent === title)?.closest(`.${styles.row}`);
      expect(row?.textContent).toContain(`Vyplaceno ${paid}`);
      expect(row?.textContent).not.toContain("Čeká na zápis");
    }
  });
});

it("shows the source position on the paid row and compares both positions on pending NEON payouts", () => {
  const original = calculateNeon(1000, "poradce8", 25, "standard", "2025-01-01");
  const initialPayment = {
    code: "A101", amount: original.items.find(item => item.code === "A101")?.amount,
    career: "8", status: "paid", writtenBy: owner, payoutMonthKey: "2025-02",
  };
  const entry: Props["commissionEntry"] = {
    id: "legacy-neon", userEmail: owner, productKey: "neon", position: "poradce8",
    payoutPositionOverride: "poradce10", inputAmount: 1000, frequencyRaw: "monthly",
    policyStartDate: "2025-01-01", contractSignedDate: "2025-01-01", durationYears: 25,
    items: original.items, commissionPayouts: [initialPayment],
  };
  const container = render({
    commissionEntry: entry, commissionPayouts: [initialPayment], adviserItems: original.items,
    adviserBreakdownPosition: "poradce8", paymentFrequency: "monthly", policyStartDate: entry.policyStartDate,
  });
  const deferred = [...container.querySelectorAll("span")]
    .find(label => label.textContent === "Provize po 3 letech")?.closest(`.${styles.row}`);
  expect(deferred?.querySelector('[data-current="true"]')?.textContent).toBe("Poradce 10");
  expect(deferred?.textContent).toContain("Původní výpočet · Poradce 8");
  expect(deferred?.textContent).toContain("Aktuální výpočet · Poradce 10");
  expect(container.querySelector('[data-current="false"]')?.textContent).toBe("Poradce 8");
});

it.each([2025, 2026])("uses the payment-year position for an overdue NEON care commission viewed in %i", (year) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(year, 11, 28));
  try {
    const signedDate = "2019-05-01";
    const careCode = "B201-B206";
    const original = calculateNeon(430, "poradce8", 20, "standard", signedDate);
    const amountAtPosition = (position: "poradce8" | "poradce10") =>
      calculateNeon(500, position, 20, "standard", signedDate).items.find(item => item.code === careCode)!.amount;
    const entry: NonNullable<Props["commissionEntry"]> = {
      id: "legacy-neon-care", userEmail: owner, productKey: "neon", position: "poradce8",
      payoutPositionOverride: "poradce10", inputAmount: 500, calculationInputAmount: 430,
      neonCorrection: { annualAmount: 840 }, frequencyRaw: "monthly", commissionMode: "standard",
      policyStartDate: signedDate, contractSignedDate: signedDate, durationYears: 20,
    };
    const container = render({
      commissionEntry: entry, adviserItems: original.items.filter(item => item.code === careCode),
      policyStartDate: signedDate, contractDurationYears: 20, paymentFrequency: "monthly",
      commissionPayouts: [{ code: "B201", status: "paid", amount: amountAtPosition("poradce8"),
        career: "8", statementPeriod: "01.11.2025 - 30.11.2025", payoutMonthKey: "2025-12", writtenBy: owner }],
    });
    const row = (code: string) => [...container.querySelectorAll(`.${styles.breakdownRow}`)]
      .find(item => item.querySelector(`.${styles.installmentCode}`)?.textContent === code);
    expect(row("B201")?.querySelector('[data-current="false"]')?.textContent).toBe("Poradce 8");
    expect(row("B201")?.textContent).toContain(`Vyplaceno ${formatMoney(amountAtPosition("poradce8"))}`);
    const pending = row("B202");
    expect(pending?.textContent).toContain("Čeká na zápis");
    const current = year === 2026;
    expect(pending?.querySelector(`[data-current="${current}"]`)?.textContent).toBe(current ? "Poradce 10" : "Poradce 8");
    expect(pending?.querySelector(`.${styles.installmentAmounts}`)?.firstElementChild?.textContent)
      .toBe(formatMoney(amountAtPosition(current ? "poradce10" : "poradce8")));
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  { account: "jindrich.hajek@bohemika.eu", expectedPosition: "poradce10" },
  { account: "jindra.hajek@bohemika.eu", expectedPosition: "poradce8" },
] as const)("prices deferred FLEXI amounts in the original rows for $account", ({ account, expectedPosition }) => {
  const original = calculateFlexi(786, "poradce8", "standard", 13);
  const expected = calculateFlexi(786, expectedPosition, "standard", 13);
  const entry: NonNullable<Props["commissionEntry"]> = {
    id: "legacy-flexi", userEmail: account, productKey: "flexi", position: "poradce8",
    payoutPositionOverride: commissionPayoutPositionForOwner(account, {}),
    inputAmount: 786, frequencyRaw: "monthly", commissionMode: "standard",
    policyStartDate: "2025-08-01", contractSignedDate: "2025-08-01", durationYears: 13,
  };
  const initialPayment = {
    code: "A101", amount: original.items.find(item => item.code === "A101")?.amount,
    career: "8", status: "paid", writtenBy: account, payoutMonthKey: "2025-08",
  };
  const container = render({
    product: "flexi", viewerEmail: account, contractOwnerEmail: account,
    commissionEntry: entry, commissionPayouts: [initialPayment],
    adviserItems: original.items.filter(item => item.code !== "TOTAL"),
    adviserBreakdownPosition: "poradce8", paymentFrequency: "monthly",
    policyStartDate: entry.policyStartDate, contractDurationYears: 13, adviserTotalDisplay: original.total,
  });
  for (const [title, code] of [["Provize po 3 letech", "B36"], ["Provize po 4 letech", "B48"]]) {
    const row = [...container.querySelectorAll("span")].find(label => label.textContent === title)?.closest(`.${styles.row}`);
    expect(row?.textContent).toContain(formatMoney(expected.items.find(item => item.code === code)!.amount));
    expect(row?.querySelector('[data-current="true"]')?.textContent).toBe(
      expectedPosition === "poradce10" ? "Poradce 10" : undefined
    );
  }
  const b0301 = [...container.querySelectorAll("span")].find(label => label.textContent === "Provize B0301")?.closest(`.${styles.breakdownRow}`);
  expect(b0301?.textContent).toContain(formatMoney(expected.items.find(item => item.code === "B0301")!.amount));
  if (expectedPosition === "poradce10") {
    expect(b0301?.textContent).toContain("Odhad při výplatě od ledna 2026");
    expect(b0301?.textContent).toContain("Čeká na zápis");
  }
  const subsequent = [...container.querySelectorAll("summary")].find(summary => summary.textContent?.includes("Následná provize"));
  expect(subsequent?.textContent).toContain(formatMoney(expected.items.find(item => item.code === "B201-B206")!.amount));
  const recorded = [...container.querySelectorAll("span")].find(label => label.textContent === "Provize A101")?.closest(`.${styles.breakdownRow}`);
  expect(recorded?.textContent).toContain(formatMoney(initialPayment.amount!));
  expect(recorded?.querySelector('[data-current="false"]')?.textContent).toBe(
    expectedPosition === "poradce10" ? "Poradce 8" : undefined
  );
});

it("shows DOMEX position changes inside the existing installment list only", () => {
  const original = calculateDomex(5845, "annual", "poradce8", "2024-10-30");
  const current = calculateDomex(5845, "annual", "poradce10", "2024-10-30");
  const items = original.items.filter(item => item.title.includes("(z platby)"));
  const immediate = items.find(item => item.title.includes("Okamžitá"))!.amount;
  const originalSubsequent = items.find(item => item.title.includes("Následná"))!.amount;
  const currentSubsequent = current.items.find(item => item.title.includes("Následná provize (z platby)"))!.amount;
  const container = render({
    product: "domex", isPaymentBasedProduct: true, policyStartDate: "2025-01-01", paymentFrequency: "annual",
    adviserItems: items, adviserBreakdownPosition: "poradce8",
    paymentBasedAdviserTotals: { immediate, subsequent: originalSubsequent },
    commissionEntry: {
      id: "legacy-domex", position: "poradce8", payoutPositionOverride: "poradce10", userEmail: owner,
      productKey: "domex", policyStartDate: "2025-01-01", contractSignedDate: "2024-10-30",
      frequencyRaw: "annual", inputAmount: 5845,
    },
    commissionPayouts: [{ code: "A101", status: "paid", amount: immediate, expectedAmount: immediate,
      career: "8", payoutMonthKey: "2025-01", writtenBy: owner }],
  });
  expect(container.querySelectorAll(`.${styles.panel}`)).toHaveLength(1);
  expect(container.textContent).not.toContain("Očekávané provize · Poradce 10");
  const installment = [...container.querySelectorAll(`.${styles.breakdownRow}`)]
    .find(row => row.querySelector(`.${styles.installmentCode}`)?.textContent === "B101");
  expect(installment?.textContent).toContain(formatMoney(currentSubsequent));
  expect(installment?.textContent).toContain(formatMoney(originalSubsequent));
  expect(installment?.querySelector('[data-current="true"]')?.textContent).toBe("Poradce 10");
  expect(container.querySelector('[data-current="false"]')?.textContent).toBe("Poradce 8");
  expect(container.textContent).toContain(`Vyplaceno ${formatMoney(immediate)}`);
});
