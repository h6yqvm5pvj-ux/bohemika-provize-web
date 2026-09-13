import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";
import { DISABILITY_PENSION_COPY } from "./disabilityPensionCopy";
import { formatGeneratedDate, type PdfLanguage } from "./lifeInsuranceShared";

export function DisabilityPensionSource({ language, className }: { language: PdfLanguage; className: string }) {
  const copy = DISABILITY_PENSION_COPY[language];
  const date = formatGeneratedDate(new Date(`${DISABILITY_PENSION_STATISTICS.asOf}T12:00:00`), language);
  return <div className={className}>
    <p>{copy.reference} · {copy.asOf} <time dateTime={DISABILITY_PENSION_STATISTICS.asOf}>{date}</time>. {copy.source}: <a href={DISABILITY_PENSION_STATISTICS.sourceUrl} target="_blank" rel="noreferrer noopener">ČSSZ</a>.</p>
    <p>{copy.note}</p>
  </div>;
}
