import { formatPdfMoney, type PdfLanguage } from "./lifeInsuranceShared";
import type { DisabilityPensionPlan } from "./pensionPlan";
import { PENSION_PLAN_COPY } from "./pensionPlanCopy";

export function PersonalPensionSource({ plan, language, className, collapsible = false }: { plan: DisabilityPensionPlan; language: PdfLanguage; className: string; collapsible?: boolean }) {
  const copy = PENSION_PLAN_COPY[language];
  const content = <>
    <p><strong>{copy.estimate} · 2026.</strong> {plan.incomeMode === "gross" ? copy.gross : copy.ovz}: {formatPdfMoney(plan.result.assessmentBase, language)}. {copy.years}: {plan.result.creditedYears}. {copy.minimum[plan.result.minimumMode]}.</p>
    <p>{copy.reference}</p>
    <p>{copy.assumptions} <a href="https://www.cssz.gov.cz/invalidni-duchody-podrobne" target="_blank" rel="noopener noreferrer">ČSSZ</a>.</p>
  </>;
  return collapsible
    ? <details className={className} data-personal-pension-source><summary>{copy.details}</summary>{content}</details>
    : <div className={className} data-personal-pension-source>{content}</div>;
}
