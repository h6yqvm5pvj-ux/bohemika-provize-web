import { escapeReportHtml as escape, renderAdvisorCard, renderReportHeader } from "../../srovnavac-trvalych-nasledku/clientReportComponents";
import { clientReportStyles } from "../../srovnavac-trvalych-nasledku/clientReportStyles";
import type { PdfAdvisorCard } from "../../srovnavac-trvalych-nasledku/pdfAdvisorCard";
import { coverageHeading, coverageTerms, formatCents, formatDays, PAYOUT_RULES, type Comparison } from "./sickLeaveComparison";

const reportStyles = `
body{margin:0;background:#e8edf2}
.pdf-root{margin:auto}
.pn-cover .pdf-brand{margin-bottom:17px;padding-bottom:12px}
.pn-cover .pdf-hero{min-height:163px;margin-bottom:12px}
.pn-cover .pdf-hero h1{margin:12px 0}
.pn-cover .pdf-focus{min-height:163px;padding-block:15px 9px}
.pn-cover .pdf-focus-value{font-size:64px;margin:9px 0 3px}
.pn-cover .pdf-focus-note{margin-top:8px}
.pn-cover .pdf-focus-note strong{display:block;font-size:13px}
.pn-cover .pdf-people{margin-bottom:8px!important;padding-bottom:9px}
.pn-parameters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;padding-bottom:9px;margin-bottom:0}
.pn-parameters strong{font-size:15px;font-weight:650;white-space:normal;overflow-wrap:anywhere}
.pn-parameters p{margin-top:3px;color:#526077;font-size:10px}
.pn-cover .pdf-section-heading{margin:13px 0 8px}
.pn-table{font-variant-numeric:tabular-nums}
.pn-table thead th{padding-block:7px;vertical-align:bottom}
.pn-table thead th:first-child{width:31%;padding-bottom:7px}
.pn-table thead strong{font-size:13px;letter-spacing:0;margin:0}
.pn-table tbody th[scope="row"]{padding:3px 0;text-align:left;border:0;border-bottom:1px solid #e3e7ef;color:#414b61;font-size:11px;font-weight:600;letter-spacing:0;vertical-align:middle}
.pn-table tbody td{padding-block:3px}
.pn-table td strong{font-size:14px;font-weight:650;white-space:nowrap}
.pn-table .pn-start td{background:#f6f3ff}
.pn-table .pn-start td strong{color:#6438e6}
.pn-table td[data-zero="true"] strong{color:#657085;font-weight:500}
.pn-dense .pn-table tbody :is(th,td){padding-block:2px}
.pn-rules{margin-top:8px!important;color:#526077;font-size:9px}
.pn-insight .pdf-section-heading{margin:12px 0 7px}
.pn-insight .pdf-section-heading h2{font-size:18px}
.pn-metrics{margin:0;gap:18px}
.pn-metrics .pdf-scenario-card{padding-top:6px}
.pn-metrics .pdf-scenario-card strong{font-size:23px;font-weight:680;line-height:1.15}
.pn-metrics .pdf-scenario-card p{margin-top:3px}
.pn-recommendation{margin-top:8px!important;padding:6px 9px;border-left:2px solid #6438e6;background:#f6f3ff;color:#414b61;font-size:11px;line-height:1.4}
.pn-recommendation strong{color:#5931c9}
.pn-sources{margin:5px 0 0!important;color:#526077;font-size:9px;line-height:1.4}
.pn-sources a{color:#5931c9;text-decoration:underline;text-underline-offset:2px}
.pdf-content>.pdf-advisor-card{margin-top:13px;border-color:#e3e7ef}
.pdf-advisor-details{padding:10px 18px}
.pdf-advisor-details .pdf-kicker{color:#6438e6}
.pdf-advisor-details h2{font-size:19px}
.pdf-advisor-link{padding:8px;color:#5931c9;background:#f6f3ff}
@media screen and (max-width:794px){.pdf-root{zoom:calc(100vw / 794px)}}
`;

const payoutCell = (amountCents: number) =>
  `<td data-zero="${amountCents === 0}"><strong>${escape(formatCents(amountCents))}</strong></td>`;

const durationInsight = `
<aside class="pn-insight" aria-labelledby="pn-insight-title">
  <div class="pdf-section-heading"><h2 id="pn-insight-title">Věděli jste, že…?</h2></div>
  <div class="pdf-scenario-cards pn-metrics">
    <div class="pdf-scenario-card"><strong>42,4 dne → 31,2 dne</strong><p>Průměrná doba pracovní neschopnosti v Česku klesla mezi roky 2019 a 2025.</p></div>
    <div class="pdf-scenario-card"><strong>80,3 %</strong><p>ukončených neschopenek v Česku v roce 2025 trvalo nejvýše 30 dní.</p></div>
  </div>
  <p class="pn-recommendation">A právě proto doporučuji klientům sjednávat <strong>plnění od 15. dne zpětně.</strong></p>
</aside>
<p class="pn-sources">Zdroje údajů ·
  <a href="https://statistikaamy.csu.gov.cz/pocet-dnu-na-neschopenkach-zustava-stabilni" target="_blank" rel="noopener noreferrer">ČSÚ – průměrná délka (2019 a 2025)</a> ·
  <a href="https://data.cssz.cz/web/otevrena-data/-/ukazatel-pracovni-neschopnosti-podle-delky-trvani-dpn-v-cr" target="_blank" rel="noopener noreferrer">ČSSZ – ukončené případy podle délky (2025)</a>
</p>`;

export type SickLeaveReportLayout = "single-page" | "advisor-page" | "insight-page";

export function buildSickLeaveReport({
  comparison, generatedAt, clientName, advisorName, advisor, layout = "single-page",
}: {
  comparison: Comparison;
  generatedAt: string;
  clientName: string;
  advisorName: string;
  advisor: PdfAdvisorCard | null;
  layout?: SickLeaveReportLayout;
}) {
  const people = [
    { label: "Připraveno pro", value: clientName.trim() },
    { label: "Váš poradce", value: advisorName.trim() || advisor?.fullName },
  ].filter(person => person.value);
  const card = advisor ? renderAdvisorCard(advisor) : "";
  const hasInsightPage = layout === "insight-page";
  const hasSecondPage = hasInsightPage || Boolean(card && layout === "advisor-page");
  const total = hasSecondPage ? "02" : "01";
  const example = comparison.rows.find(row => row.duration === 30);
  const difference = example ? Math.abs(example.current.amountCents - example.proposed.amountCents) : null;
  const footer = (page: "01" | "02") => `<footer class="pdf-footer">
    <div><span><strong>Bohemika a.s.</strong> · Pracovní neschopnost · ${escape(generatedAt)}</span><span>${page} / ${total}</span></div>
  </footer>`;

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <title>Pracovní neschopnost · Bohemika</title>
  <style>${clientReportStyles}${reportStyles}</style>
</head>
<body>
  <main class="pdf-root">
    <section class="pdf-page pn-cover${comparison.rows.length > 7 ? " pn-dense" : ""}">
      <div class="pdf-content">
        ${renderReportHeader(generatedAt, "Srovnání pojistného plnění")}
        <div class="pdf-hero">
          <div class="pdf-hero-copy">
            <div class="pdf-kicker">Pojištění příjmu</div>
            <h1>Pracovní<br/><em>neschopnost.</em></h1>
            <p>Srovnání stávajícího pojištění a nového návrhu.</p>
          </div>
          ${difference === null ? "" : `<aside class="pdf-focus">
            <div class="pdf-kicker">Modelový scénář</div>
            <div class="pdf-focus-value">30<span>dní</span></div>
            <p>pracovní neschopnosti</p>
            <div class="pdf-focus-note">Rozdíl v plnění<strong>${escape(formatCents(difference))}</strong></div>
          </aside>`}
        </div>
        ${people.length ? `<dl class="pdf-people">${people.map(({ label, value }) => `<div><dt>${label}</dt><dd>${escape(value ?? "")}</dd></div>`).join("")}</dl>` : ""}
        <div class="pdf-parameters pn-parameters">
          ${(["current", "proposed"] as const).map(key => `<div><small>${coverageHeading[key].toLocaleUpperCase("cs-CZ")}</small><strong>${escape(comparison[key].product)}</strong><p>${escape(coverageTerms(comparison[key]))}</p></div>`).join("")}
        </div>
        <div class="pdf-section-heading"><h2>Plnění podle délky neschopnosti</h2><span>Modelové plnění v Kč</span></div>
        <table class="pdf-summary pn-table" aria-label="Modelové pojistné plnění">
          <thead><tr><th scope="col"><span>Délka neschopnosti</span></th><th scope="col"><strong>${coverageHeading.current}</strong></th><th scope="col"><strong>${coverageHeading.proposed}</strong></th></tr></thead>
          <tbody>${comparison.rows.map(row => `<tr${row.isStartDay ? ' class="pn-start"' : ""}><th scope="row">${escape(formatDays(row.duration))}</th>${payoutCell(row.current.amountCents)}${payoutCell(row.proposed.amountCents)}</tr>`).join("")}</tbody>
        </table>
        <p class="pn-rules">${PAYOUT_RULES}</p>
        ${hasInsightPage ? "" : durationInsight}
        ${hasSecondPage ? "" : card}
      </div>
      ${footer("01")}
    </section>
    ${hasSecondPage ? `<section class="pdf-page">
      <div class="pdf-content">
        ${renderReportHeader(generatedAt, "Pracovní neschopnost")}
        <h1 class="pdf-explanation-title">${hasInsightPage ? "Jak dlouho trvá <em>neschopenka?</em>" : "Vizitka <em>poradce</em>"}</h1>
        ${hasInsightPage ? durationInsight : ""}
        ${card}
      </div>
      ${footer("02")}
    </section>` : ""}
  </main>
</body>
</html>`;
}
