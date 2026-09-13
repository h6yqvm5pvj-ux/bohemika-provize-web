// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildLifeInsuranceReportHtml } from "./lifeInsuranceReport";
import { calculateSicknessBenefits, DEFAULT_SICKNESS_INPUTS } from "./sicknessBenefits";
import { formatPdfMoney, type LifeInsuranceResultData, type PdfLanguage } from "./lifeInsuranceShared";
import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";

export const reportFixture: LifeInsuranceResultData = {
  numbers: { age:35, insuredIncome:40000, essentialExpenses:22000, loanPayments:12000, totalDebt:2000000,
    otherHouseholdIncome:25000, childrenCount:2, childHorizonYears:15, mortgageYears:20, mortgageRate:4.5,
    educationMonthlyPerChild:15000, educationYears:5, funeralCost:75000, monthlyExpenses:34000,
    householdIncome:65000, monthlyReserve:31000, incomeAfterDeath:25000, monthlyGapAfterDeath:9000,
    invalidityYears:30, invalidityMonths:360, deathTermTo75:40, incomeGapYears:15 },
  providerRole:"main", futureFamilyPlan:null,
  sicknessBenefits: calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, grossMonthly:"50000", hourlyEarnings:"500" }, "employee", true),
  sickLeave: { hasStateSicknessBenefit:true, stateBenefit:26610, incomeShortfall:13390, commitmentGap:7390,
    expenseReserveTargetMonthly:40800, recommendedMonthly:15990, recommendedDaily:533 },
  invalidity: [.4,.6,1].map((ratio,i)=>({ label: String(i+1), ratio, monthlyNeed:40000*ratio, lumpWithoutDebt:14400000*ratio })),
  invalidityModel:"insurance", invalidityInvestmentVariantId:"investika", invalidityScenarioId:"medium",
  death: { incomeGapCoverage:1620000, educationCoverage:1800000, salaryFloor:2400000, needsBasedDecreasing:3420000,
    decreasingAmount:3500000, constantAmount:80000, annuityMortgageAmount:2000000, futureFamilyAmount:0 },
  clientName:"Jan Novák", advisorFooter: { fullName:"Jana Černá", roleLabel:"Poradce", ico:"12345678", phone:"+420 777 123 456", email:"advisor@example.test" },
};
const render = (data = reportFixture, lang: PdfLanguage = "cs") => new DOMParser().parseFromString(buildLifeInsuranceReportHtml(data,lang,new Date("2026-09-13T12:00:00Z"),"https://app.example.test"),"text/html");
describe("life insurance report", () => {
  it("includes company letterhead, client/adviser and all three illustrations", () => {
    const doc = render();
    expect(doc.querySelector(".report-hero")?.textContent).toContain("Bohemika");
    expect(doc.querySelector(".document-intro")?.textContent).toContain("Jan Novák");
    expect(doc.querySelector(".footer-note")?.textContent).toContain("Jana Černá");
    expect(doc.querySelector(".footer-note")?.textContent).toContain("12345678");
    expect([...doc.querySelectorAll<HTMLImageElement>(".section-illustration")].map(img=>img.src)).toEqual(["memorial","recovery","independence"].map(name=>`https://app.example.test/illustrations/life-insurance/${name}.webp`));
  });
  it("prints the same insurance sums and sickness periods as the result data", () => {
    const text = render().body.textContent.replace(/\s/g," ");
    for (const value of ["533 Kč","3.500.000 Kč","14.400.000 Kč","17.488 Kč","14.192 Kč","29.250 Kč","31.920 Kč","31.680 Kč"]) expect(text).toContain(value);
    expect(text).not.toContain("OSSZ za 30 dní při sazbě 60 % (srovnání)");
    expect(text).not.toContain("redukovaného DVZ");
    expect(text).toContain("Soukromé pojištění · doporučená denní dávka");
    expect(text).toContain("61.–90. den");
    expect(render().querySelector("details")).toBeNull();
  });
  it.each(["cs","en","uk","ne","hi"] as const)("produces a complete %s document with matching benefit values", lang => {
    const doc = render(reportFixture,lang);
    expect(doc.documentElement.lang).toBe(lang);
    expect(doc.querySelectorAll(".statePeriods > div")).toHaveLength(3);
    expect(doc.querySelectorAll(".product-table tbody tr")).toHaveLength(3);
    expect([...doc.querySelectorAll(".pension-average")].map(cell => cell.textContent)).toEqual(
      [9906, 11704, 17325].map(amount => formatPdfMoney(amount, lang)),
    );
    expect(doc.querySelector(".pension-source time")?.getAttribute("datetime")).toBe("2024-12-31");
    expect(doc.querySelector(".pension-source a")?.getAttribute("href")).toBe(DISABILITY_PENSION_STATISTICS.sourceUrl);
    expect(doc.body.textContent).not.toMatch(/undefined|NaN/);
  });
  it("keeps reference state pensions separate from the client's private annuity and capital", () => {
    const doc = render();
    expect([...doc.querySelectorAll(".product-table tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent))).toEqual([
      ["1. stupeň", "9.906 Kč", "16.000 KčPokrytí: 40 %", "5.760.000 Kč"],
      ["2. stupeň", "11.704 Kč", "24.000 KčPokrytí: 60 %", "8.640.000 Kč"],
      ["3. stupeň", "17.325 Kč", "40.000 KčPokrytí: 100 %", "14.400.000 Kč"],
    ]);
    expect(doc.querySelector(".pension-source")?.textContent).toContain("neodečítají se");
    expect(doc.querySelector(".product-table thead")?.textContent).toContain("Plánovaná soukromá renta / měsíc");
  });
  it("escapes client/adviser input, including strings that look like scripts", () => {
    const doc = render({ ...reportFixture, clientName:'<script>alert(1)</script>', advisorFooter:{...reportFixture.advisorFooter,fullName:'<img src=x onerror=alert(2)>'} });
    expect(doc.querySelectorAll("script,[onerror]")).toHaveLength(0);
    expect(doc.querySelector(".document-intro")?.textContent).toContain('<script>alert(1)</script>');
  });
  it("shows missing payments as unknown and retains the selected investment scenario", () => {
    const doc = render({ ...reportFixture, invalidityModel:"investment", invalidityInvestmentVariantId:"savings",
      sicknessBenefits:calculateSicknessBenefits(DEFAULT_SICKNESS_INPUTS,"employee",true),
      sickLeave:{...reportFixture.sickLeave,stateBenefit:null,incomeShortfall:null,commitmentGap:null} });
    expect(doc.querySelector(".employerAmount > strong")?.textContent).toBe("—");
    expect(doc.body.textContent).toContain("Chybí podklady");
    expect(doc.querySelector(".model-note")?.textContent).toContain("Investiční varianta");
    expect(doc.querySelector(".product-table")?.textContent).not.toContain("14.400.000 Kč");
  });
});
