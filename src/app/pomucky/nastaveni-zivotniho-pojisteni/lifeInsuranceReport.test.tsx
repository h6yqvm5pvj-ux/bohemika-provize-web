// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildLifeInsuranceReportHtml } from "./lifeInsuranceReport";
import { calculateSicknessBenefits, DEFAULT_SICKNESS_INPUTS } from "./sicknessBenefits";
import { formatPdfMoney, PDF_COPY, INVALIDITY_SCENARIOS, requiredCapitalForRenta, roundMoney, type LifeInsuranceResultData, type PdfLanguage } from "./lifeInsuranceShared";
import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";
import { calculateDisabilityPension } from "../invalidni-duchod/pensionCalculation";
import { calculateInvalidityCover } from "./pensionPlan";
import { PENSION_PLAN_COPY } from "./pensionPlanCopy";

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
  invalidityScenarioId: "medium",
  invalidity: [.4,.6,1].map((ratio,index)=>({ label: String(index+1), ...calculateInvalidityCover(40000,34000,360,ratio) })),
  invalidityModel:"insurance", invalidityInvestmentVariantId:"investika",
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
    expect([...doc.querySelectorAll(".product-table tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent?.replace(/\s/g," ")))).toEqual([
      ["1. stupeň", "9.906 Kč", "16.000 Kč40 %", "5.760.000 Kč16.000 Kč × 360 měsíců"],
      ["2. stupeň", "11.704 Kč", "24.000 Kč60 %", "8.640.000 Kč24.000 Kč × 360 měsíců"],
      ["3. stupeň", "17.325 Kč", "40.000 Kč100 %", "14.400.000 Kč40.000 Kč × 360 měsíců"],
    ]);
    expect(doc.querySelector(".pension-source")?.textContent).toContain("neodečítají se");
    expect(doc.querySelector(".product-table thead")?.textContent).toContain("Plánovaná soukromá renta / měsíc");
  });
  it("escapes client/adviser input, including strings that look like scripts", () => {
    const doc = render({ ...reportFixture, clientName:'<script>alert(1)</script>', advisorFooter:{...reportFixture.advisorFooter,fullName:'<img src=x onerror=alert(2)>'} });
    expect(doc.querySelectorAll("script,[onerror]")).toHaveLength(0);
    expect(doc.querySelector(".document-intro")?.textContent).toContain('<script>alert(1)</script>');
  });
  it.each(["cs","en","uk","ne","hi"] as const)("shows only personal estimates when provided and explains them in %s",lang=>{
    const plan={result:calculateDisabilityPension({monthlyIncome:40000,creditedYears:45,minimumMode:"ordinary"}),incomeMode:"gross" as const};
    const doc=render({...reportFixture,disabilityPension:plan},lang);
    expect(doc.querySelectorAll(".pension-average")).toHaveLength(0);
    expect([...doc.querySelectorAll(".pension-personal")].map(cell=>cell.textContent)).toEqual([10760,13690,22479].map(amount=>formatPdfMoney(amount,lang)));
    expect(doc.querySelectorAll(".pension-timeline, .coverage-assumptions")).toHaveLength(0);
    expect(doc.querySelector("[data-personal-pension-source]")?.textContent).toContain(PENSION_PLAN_COPY[lang].reference);
    expect(doc.querySelector("[data-personal-pension-source]")?.textContent).toContain(PENSION_PLAN_COPY[lang].assumptions);
    expect(doc.querySelector(".product-table thead tr")?.children).toHaveLength(4);
    expect(doc.body.textContent).not.toMatch(/undefined|NaN/);
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
  it("calculates investment capital for the same planned rent without an extra reserve", () => {
    const doc=render({...reportFixture,invalidityModel:"investment"});
    const results=[...doc.querySelectorAll(".product-table tbody tr td:last-child")];
    reportFixture.invalidity.forEach((item,index)=>{
      const min=formatPdfMoney(roundMoney(requiredCapitalForRenta(item.monthlyNeed,360,.06)),"cs");
      const max=formatPdfMoney(roundMoney(requiredCapitalForRenta(item.monthlyNeed,360,.055)),"cs");
      expect(results[index].textContent).toBe(`${min} až ${max}`);
    });
  });

  it.each(["cs","en","uk","ne","hi"] as const)("exports all three variants independently of the state estimate in %s", lang=>{
    const plan={result:calculateDisabilityPension({monthlyIncome:43400,creditedYears:5,minimumMode:"under28"}),incomeMode:"gross" as const};
    for(const scenario of INVALIDITY_SCENARIOS) {
      const data:LifeInsuranceResultData={...reportFixture,
        numbers:{...reportFixture.numbers,age:25,insuredIncome:31000,monthlyExpenses:22000,invalidityMonths:480,invalidityYears:40},
        disabilityPension:plan,invalidityScenarioId:scenario.id,
        invalidity:scenario.ratios.map((ratio,index)=>({label:String(index+1),...calculateInvalidityCover(31000,22000,480,ratio)})),
      };
      const doc=render(data,lang);
      expect(doc.querySelector(".model-note")?.textContent).toContain(PDF_COPY[lang].scenarioLabels[scenario.id]);
      const rows=[...doc.querySelectorAll(".product-table tbody tr")];
      for(let i=0;i<3;i++) {
        const cells=rows[i].querySelectorAll("td");
        expect(cells[1].textContent).toBe(formatPdfMoney([9169,11304,17707][i],lang));
        expect(cells[2].firstChild?.textContent).toBe(formatPdfMoney(data.invalidity[i].monthlyNeed,lang));
        expect(cells[3].firstChild?.textContent).toBe(formatPdfMoney(data.invalidity[i].monthlyNeed*480,lang));
      }
      expect(doc.body.textContent).not.toMatch(/undefined|NaN/);
    }
  });
});
