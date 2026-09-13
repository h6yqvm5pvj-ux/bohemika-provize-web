/* eslint-disable @next/next/no-img-element -- Standalone print HTML is rendered without Next image optimization. */
import { SicknessBenefitBreakdown, SIMPLE_SICKNESS_COPY } from "./SicknessBenefitBreakdown";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PDF_COPY, INVALIDITY_INVESTMENT_VARIANTS, INVALIDITY_SCENARIOS,
  formatGeneratedDate, formatPdfMoney, formatPdfPercent, formatYears, translateAdvisorRole,
  requiredCapitalForRenta, roundMoney, type LifeInsuranceResultData, type PdfLanguage,
} from "./lifeInsuranceShared";
import { LIFE_INSURANCE_REPORT_STYLES } from "./lifeInsuranceReportStyles";
import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";
import { DISABILITY_PENSION_COPY } from "./disabilityPensionCopy";
import { DisabilityPensionSource } from "./DisabilityPensionSource";

const DOCUMENT_COPY = {
  cs: { title: "Návrh pojistného krytí", subtitle: "Životní pojištění", basis: "Podklady pro výpočet", age: "Věk klienta", children: "Počet dětí", debt: "Zůstatek úvěrů", horizon: "Horizont dětí", education: "Studium na dítě měsíčně" },
  en: { title: "Insurance coverage plan", subtitle: "Life insurance", basis: "Calculation inputs", age: "Client age", children: "Number of children", debt: "Outstanding loans", horizon: "Children's support horizon", education: "Monthly education cost per child" },
  uk: { title: "План страхового покриття", subtitle: "Страхування життя", basis: "Дані для розрахунку", age: "Вік клієнта", children: "Кількість дітей", debt: "Залишок кредитів", horizon: "Період підтримки дітей", education: "Навчання однієї дитини на місяць" },
  ne: { title: "बीमा सुरक्षाको योजना", subtitle: "जीवन बीमा", basis: "गणनाका आधारहरू", age: "ग्राहकको उमेर", children: "बच्चाहरूको संख्या", debt: "बाँकी ऋण", horizon: "बच्चाको सहयोग अवधि", education: "प्रति बच्चा मासिक शिक्षा खर्च" },
  hi: { title: "बीमा सुरक्षा योजना", subtitle: "जीवन बीमा", basis: "गणना के आधार", age: "ग्राहक की आयु", children: "बच्चों की संख्या", debt: "बकाया ऋण", horizon: "बच्चों की सहायता अवधि", education: "प्रति बच्चे मासिक शिक्षा खर्च" },
};

function ReportRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="category-line"><div><strong>{label}</strong>{note && <p>{note}</p>}</div><span>{value}</span></div>;
}

export function buildLifeInsuranceReportHtml(data: LifeInsuranceResultData, language: PdfLanguage, generatedAt: Date, origin: string): string {
  const { numbers: n, death, sickLeave, advisorFooter: advisor } = data;
  const copy = PDF_COPY[language], doc = DOCUMENT_COPY[language];
  const pensionCopy = DISABILITY_PENSION_COPY[language];
  const money = (value: number | null) => value === null ? "—" : formatPdfMoney(value, language);
  const percent = (value: number) => formatPdfPercent(value, language);
  const variant = INVALIDITY_INVESTMENT_VARIANTS.find(item => item.id === data.invalidityInvestmentVariantId) ?? INVALIDITY_INVESTMENT_VARIANTS[0];
  const scenario = INVALIDITY_SCENARIOS.find(item => item.id === data.invalidityScenarioId) ?? INVALIDITY_SCENARIOS[2];
  const investment = data.invalidityModel === "investment";
  const created = formatGeneratedDate(generatedAt, language);
  const years = (value: number) => formatYears(value, language);
  const role = translateAdvisorRole(advisor.roleLabel, language);
  const logo = new URL("/icons/bohemika_logo.png", origin).href;
  const illustration = (name: string) => <img className="section-illustration" src={new URL(`/illustrations/life-insurance/${name}.webp`, origin).href} width="110" height="110" alt="" />;
  const markup = renderToStaticMarkup(<html lang={language}><head><meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{`${doc.title} · Bohemika`}</title><style>{LIFE_INSURANCE_REPORT_STYLES}</style>
  </head><body><main className="page"><table className="report-layout"><thead><tr><td>
    <header className="report-hero">
      <div className="brand"><img src={logo} alt="Bohemika" width="34" height="49" /><div><strong>Bohemika<span> a.s.</span></strong><small>FINANČNÍ PORADENSTVÍ</small></div></div>
      <div className="document-meta"><strong>{doc.subtitle}</strong><span>{created}</span>{data.clientName && <span>{data.clientName}</span>}</div>
    </header>
  </td></tr></thead><tbody><tr><td>
    <section className="info-card document-intro"><span className="eyebrow">{doc.subtitle}</span><h1>{doc.title}</h1><p>{copy.previewIntro}</p>
      <div className="client-line"><span>{copy.client}: <strong>{data.clientName || "—"}</strong></span><span>{doc.age}: <strong>{years(n.age)}</strong></span><span>{copy.clientRole}: <strong>{data.providerRole === "main" ? copy.mainProvider : copy.secondaryProvider}</strong></span></div>
    </section>
    <section className="report-totals">
      {[[copy.householdIncome, n.householdIncome], [copy.householdExpenses, n.monthlyExpenses], [copy.missingAfterDeath, n.monthlyGapAfterDeath]].map(([label, amount]) => <div key={label}><span>{label}</span><strong>{money(Number(amount))}</strong></div>)}
    </section>

    <section className="report-section info-card"><h2 className="section-title"><b>01</b>{copy.death}<span>{copy.recommendedSetup}</span>{illustration("memorial")}</h2>
      <div className="summary-list">
        <ReportRow label={copy.constantDeathSum} value={money(death.constantAmount)} note={copy.constantDeathNote} />
        {n.childrenCount > 0 && <ReportRow label={copy.decreasingDeathSum} value={money(death.decreasingAmount)} note={`${copy.incomeGap}: ${money(death.incomeGapCoverage)} + ${copy.childrenEducation}: ${money(death.educationCoverage)}. ${copy.approximatelyFor} ${years(n.deathTermTo75)}.`} />}
        {n.totalDebt > 0 && <ReportRow label={copy.annuityDeathSum} value={money(death.annuityMortgageAmount)} note={`${copy.setByDebt} ${years(n.mortgageYears)}, ${copy.interest} ${percent(n.mortgageRate)} ${copy.perYear}.`} />}
      </div>
      {n.childrenCount > 0 && <p className="info-card note">{copy.quickMethodPrefix} <strong>{money(death.salaryFloor)}</strong>. {copy.quickMethodSuffix}</p>}
      {n.childrenCount === 0 && (data.futureFamilyPlan === "yes" || data.futureFamilyPlan === "maybe") && <div className="info-card note"><strong>{copy.futureFamilyTitle}</strong><p>{copy.futureFamilyText}</p><p>{copy.futureFamilyAmountLabel}: <strong>{money(death.futureFamilyAmount)}</strong>. {copy.futureFamilyAmountNote}</p></div>}
    </section>

    <section className="report-section info-card"><h2 className="section-title"><b>02</b>{copy.sickLeave}<span>{copy.dailyBenefit}</span>{illustration("recovery")}</h2>
      <div className="summary-list">
        <ReportRow label={SIMPLE_SICKNESS_COPY[language].privateBenefit} value={`${money(sickLeave.recommendedDaily)} / ${copy.perDay}`} note={`${copy.monthlyApprox} ${money(sickLeave.recommendedMonthly)}. ${sickLeave.hasStateSicknessBenefit ? copy.sickLeaveFormula : copy.sickLeaveFormulaNoState}`} />
        {!sickLeave.hasStateSicknessBenefit && <>
          <ReportRow label={copy.expenseReserveTarget} value={money(sickLeave.expenseReserveTargetMonthly)} />
          <ReportRow label={copy.incomeDropNoState} value={money(sickLeave.incomeShortfall)} />
          <ReportRow label={copy.expenseGapInfoNoState} value={money(sickLeave.commitmentGap)} />
        </>}

      </div>
      <SicknessBenefitBreakdown benefits={data.sicknessBenefits} language={language} print />
      {!sickLeave.hasStateSicknessBenefit && <div className="info-card note"><strong>{copy.sickLeaveNoStateTitle}</strong><p>{copy.sickLeaveNoStateNote}</p></div>}
    </section>

    <section className="report-section info-card"><h2 className="section-title"><b>03</b>{copy.disability}<span>{copy.coverageTo65}: {years(n.invalidityYears)}</span>{illustration("independence")}</h2>
      <div className="info-card model-note"><strong>{copy.scenarioLabels[scenario.id]} · {investment ? copy.investmentVariant : copy.insurancePayout}</strong>
        <span>{copy.coveragePrefix}: {scenario.ratios.map(ratio => percent(ratio * 100)).join(" / ")}{investment ? ` · ${variant.productName} · ${variant.returnLabel}` : ""}</span>
      </div>
      <table className="product-table info-card"><thead><tr><th>{copy.degreeOfDisability}</th><th>{pensionCopy.average}<small>{pensionCopy.monthly}</small></th><th>{pensionCopy.privateAnnuity}</th><th>{investment ? copy.requiredDeposit : copy.sumWithoutDebt}</th></tr></thead><tbody>
        {data.invalidity.map((item, index) => {
          const min = roundMoney(requiredCapitalForRenta(item.monthlyNeed, n.invalidityMonths, variant.returnRange.max));
          const max = roundMoney(requiredCapitalForRenta(item.monthlyNeed, n.invalidityMonths, variant.returnRange.min));
          const capital = investment ? (min === max ? money(min) : `${money(min)} ${copy.to} ${money(max)}`) : money(item.lumpWithoutDebt);
          return <tr key={item.label}><td>{copy.degreeLabels[index]}</td><td className="pension-average">{money(DISABILITY_PENSION_STATISTICS.degrees[index].averageMonthly)}</td><td>{money(item.monthlyNeed)}<small>{copy.coveragePrefix}: {percent(item.ratio * 100)}</small></td><td>{capital}</td></tr>;
        })}
      </tbody></table>
      <DisabilityPensionSource language={language} className="pension-source info-card" />
      {investment && <p className="info-card note">{copy.investmentNote} <strong>{variant.productName}: {variant.returnLabel}.</strong></p>}
      {n.totalDebt > 0 && <div className="summary-list loan"><ReportRow label={copy.disabilityLoanTitle} value={money(death.annuityMortgageAmount)} note={`${copy.disabilityLoanNote} ${years(n.mortgageYears)}, ${copy.interest} ${percent(n.mortgageRate)} ${copy.perYear}.`} /></div>}
    </section>

    <section className="info-card inputs"><h2 className="section-title">{doc.basis}</h2><dl>
      {[[copy.client, money(n.insuredIncome)], [copy.otherIncome, money(n.otherHouseholdIncome)], [copy.essentialExpenses, money(n.essentialExpenses)], [copy.installments, money(n.loanPayments)], [doc.debt, money(n.totalDebt)], [doc.children, String(n.childrenCount)], ...(n.childrenCount > 0 ? [[doc.horizon, years(n.childHorizonYears)], [doc.education, `${money(n.educationMonthlyPerChild)} · ${years(n.educationYears)}`]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl></section>
    <footer className="footer-note"><div><small>{role}</small><strong>{advisor.fullName || "Bohemika a.s."}</strong><span>Bohemika a.s.</span></div><div className="contacts">
      {advisor.ico && <span>{copy.footer.companyId}: {advisor.ico}</span>}{advisor.phone && <span>{copy.footer.phone}: {advisor.phone}</span>}{advisor.email && <span>{copy.footer.email}: {advisor.email}</span>}
      <span>{copy.footer.generated}: {created}</span>
    </div></footer>
  </td></tr></tbody></table></main></body></html>);
  return `<!doctype html>${markup}`;
}
