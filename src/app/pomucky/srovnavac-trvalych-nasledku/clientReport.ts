import { clientComparisonHeading, explainClientVariant, getClientScenarioExample } from "./clientExplanation";
import { renderScenarioComparison } from "./clientReportArtwork";
import { clientReportStyles } from "./clientReportStyles";

export type PdfAppendix = "graphs" | "graphs-tables" | "none";
type ReportRow = {
  key?: string;
  insurerName: string;
  productName: string;
  badges: string[];
  logo: string | null;
  payouts: number[];
  curve: { percent: number; payoutPercent: number }[];
  table?: { title: string; columns: string[]; rows: { cells: string[] }[] };
};
type ReportOptions = {
  generatedAt: string;
  clientName?: string;
  advisorName?: string;
  sumInsured: number;
  scenarios: { label: string; percent: number }[];
  rows: ReportRow[];
  appendix: PdfAppendix;
};
type ReportPage = { content: string; section: string; note: string; className?: string };
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const number = (value: number) => value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
const equationNumber = (value: number) => value.toLocaleString("cs-CZ", { maximumFractionDigits: 6 });
const money = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const colors = ["#583a55", "#94654c", "#48645d"];
const color = (index: number) => colors[index % colors.length];
const scenarioLabel = (index: number, count: number) => count > 1 ? `Scénář ${index + 1}` : "Modelový úraz";
const quantityLabel = (count: number, one: string, few: string, many: string) => count === 1 ? one : count >= 2 && count <= 4 ? few : many;
const modelNote = "Modelové srovnání při stejné pojistné částce. Skutečné plnění závisí na sjednané variantě, oceňovací tabulce a podmínkách konkrétní smlouvy.";

const header = (date: string, section: string) => `<header class="pdf-brand">
  <div class="pdf-brand-identity"><img src="/icons/bohemika_logo.png" alt="" /><div><strong>bohemika.</strong><span>FINANČNÍ PORADENSTVÍ</span></div></div>
  <div class="pdf-document"><strong>${escape(section)}</strong><small>${escape(date)}</small></div>
</header>`;
const badges = (row: ReportRow) => row.badges.map(badge => `<span>${escape(badge)}</span>`).join("");
const productHeading = (row: ReportRow, index: number) => `<div class="pdf-product-heading">
  ${row.logo ? `<div class="pdf-product-logo"><img src="${escape(row.logo)}" alt="${escape(row.insurerName)}" /></div>` : ""}
  <div><div class="pdf-kicker">VARIANTA ${String(index + 1).padStart(2, "0")} / ${escape(row.insurerName)}</div><h1>${escape(row.productName)}</h1><div class="pdf-badges">${badges(row)}</div></div>
</div>`;

const processSteps = () => `<div class="pdf-process">
  <div><span>01</span><div><strong>Hodnocení úrazu</strong><small>Rozsah trvalých následků</small></div></div>
  <div><span>02</span><div><strong>Pravidla progrese</strong><small>Tabulka vybrané varianty</small></div></div>
  <div><span>03</span><div><strong>Výsledné plnění</strong><small>Částka k výplatě</small></div></div>
</div>`;

function clientExplanationCard(row: ReportRow, scenarios: ReportOptions["scenarios"], sumInsured: number, index: number): string {
  const explanation = explainClientVariant(row, scenarios, sumInsured);
  const example = getClientScenarioExample(row, scenarios, sumInsured);
  const equationPercent = example ? example.wholeBaseMultiplier ? example.assessment : example.payoutPercent : 0;
  const roundedEquation = [sumInsured, equationPercent].some(value =>
    Math.abs(value - Number(value.toFixed(6))) > Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  const equation = example
    ? `${roundedEquation ? "Přibližně: " : ""}${equationNumber(sumInsured)} Kč × ${equationNumber(equationPercent)} %${example.wholeBaseMultiplier ? ` × ${example.wholeBaseMultiplier}` : ""}`
    : "";
  return `<article class="pdf-explanation-card">
    <div class="pdf-explanation-product"><div class="pdf-kicker">VARIANTA ${String(index + 1).padStart(2, "0")}</div>${row.logo ? `<img src="${escape(row.logo)}" alt="" />` : ""}<h2>${escape(row.insurerName)}</h2><div class="pdf-product-version">${badges(row)}</div></div>
    <div class="pdf-explanation-copy"><h3>${escape(row.productName)}</h3><p class="pdf-explanation-rule-label">CO ŘÍKÁ TABULKA TÉTO VARIANTY</p><p>${escape(explanation.progression)}</p>
    ${explanation.doubleBenefit ? `<p class="pdf-explanation-secondary">${escape(explanation.doubleBenefit)}</p>` : ""}
    ${example ? `<div class="pdf-example"><div class="pdf-example-calculation"><span>VÁŠ SCÉNÁŘ / ${escape(equationNumber(example.assessment))} % NÁSLEDKŮ</span><p class="pdf-equation">${escape(equation)}</p><small>${escape(number(example.payoutPercent))} % pojistné částky${Math.abs(example.effectiveMultiplier - 2) < 0.000001 ? " · dvojnásobek plnění bez progrese" : Math.abs(example.effectiveMultiplier - 1) < 0.000001 ? " · bez navýšení progresí" : ""}</small></div><strong>${escape(money(example.payout))}</strong></div>` : ""}</div>
  </article>`;
}
function renderCurve(row: ReportRow, scenarios: ReportOptions["scenarios"], sumInsured: number) {
  const max = Math.max(100, Math.ceil(Math.max(0, ...row.curve.map(point => point.payoutPercent)) / 100) * 100);
  const x = (percent: number) => 62 + percent * 6;
  const y = (percent: number) => 290 - percent / max * 230;
  const points = row.curve.map(point => ({ x: x(point.percent), y: y(point.payoutPercent) }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = points.length ? `${path} L${points[points.length - 1].x},290 L${points[0].x},290 Z` : "";
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = max * index / 4;
    return `<line x1="62" x2="662" y1="${y(value)}" y2="${y(value)}" stroke="#e2d9d0" stroke-dasharray="3 5"/><text x="50" y="${y(value) + 4}" text-anchor="end" fill="#776b70" font-size="10">${escape(number(value))} %</text>`;
  }).join("");
  const labels = [0, 25, 50, 75, 100].map(value => `<text x="${x(value)}" y="313" text-anchor="middle" fill="#776b70" font-size="10">${value} %</text>`).join("");
  const markerGroups = new Map<string, { percent: number; actual: number; indices: number[] }>();
  scenarios.forEach((scenario, index) => {
    const actual = sumInsured > 0 ? row.payouts[index] / sumInsured * 100 : 0;
    const key = `${scenario.percent}:${actual}`;
    const group = markerGroups.get(key);
    if (group) group.indices.push(index);
    else markerGroups.set(key, { percent: scenario.percent, actual, indices: [index] });
  });
  const markers = Array.from(markerGroups.values()).map(({ percent, actual, indices }) => `<line x1="${x(percent)}" x2="${x(percent)}" y1="${y(actual)}" y2="290" stroke="${color(indices[0])}" stroke-dasharray="4 5"/><circle cx="${x(percent)}" cy="${y(actual)}" r="10" fill="${color(indices[0])}" stroke="white" stroke-width="3"/><text x="${x(percent)}" y="${y(actual) + 3}" text-anchor="middle" font-size="${indices.length > 1 ? 6 : 8}" font-weight="bold" fill="white">${indices.map(index => index + 1).join("/")}</text>`).join("");
  return `<div class="pdf-chart"><svg viewBox="0 0 710 350" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Průběh pojistného plnění">
    <text x="62" y="24" fill="#6c575f" font-size="11">Plnění ze sjednané pojistné částky</text>${grid}
    <path d="${area}" fill="#eee5ed"/><path d="${path}" fill="none" stroke="#583a55" stroke-width="3" stroke-linejoin="round"/>
    ${labels}${markers}<text x="362" y="342" text-anchor="middle" fill="#6c575f" font-size="11">Rozsah trvalých následků</text>
  </svg></div>`;
}

/** All report pages share the same HTML in the preview, download and print. */
export function buildClientReport({ generatedAt, clientName, advisorName, sumInsured, scenarios, rows, appendix }: ReportOptions): string {
  const pages: ReportPage[] = [];
  const people = [{ label: "Připraveno pro", name: clientName }, { label: "Váš poradce", name: advisorName }]
    .map(person => ({ ...person, name: person.name?.replace(/\s+/g, " ").trim() })).filter(person => person.name);
  const personalization = people.length
    ? `<dl class="pdf-people">${people.map(person => `<div><dt>${person.label}</dt><dd>${escape(person.name!)}</dd></div>`).join("")}</dl>`
    : "";
  const maxima = scenarios.map((_, index) => Math.max(0, ...rows.map(row => row.payouts[index])));
  const minima = scenarios.map((_, index) => rows.length ? Math.min(...rows.map(row => row.payouts[index])) : 0);
  const insurerCount = new Set(rows.map(row => row.insurerName)).size;
  const highlightIndex = rows.length > 1 ? scenarios.findIndex((scenario, index) => scenario.percent > 0 && maxima[index] > minima[index]) : -1;
  const focusIndex = highlightIndex >= 0 ? highlightIndex : scenarios.findIndex(scenario => scenario.percent > 0);
  const focusScenario = scenarios[Math.max(0, focusIndex)];
  const focusNumber = focusScenario ? number(focusScenario.percent) : "";
  const focusNumberClass = focusNumber.length > 3 ? " pdf-focus-value-wide" : focusNumber.length === 3 ? " pdf-focus-value-three" : "";
  const hasDifference = highlightIndex >= 0;
  const title = hasDifference ? "Stejné zadání.<br/><em>Jiná výplata.</em>" : "Pojistné plnění.<br/><em>V jasných číslech.</em>";
  const parameters = `<div class="pdf-parameters"><div><small>SJEDNANÁ POJISTNÁ ČÁSTKA</small><strong>${escape(money(sumInsured))}</strong></div><p>${escape(clientComparisonHeading(rows))}<span>Společný základ pro všechny vybrané varianty.</span></p></div>`;
  const focus = focusScenario ? `<aside class="pdf-focus"><div class="pdf-kicker">${scenarioLabel(Math.max(0, focusIndex), scenarios.length).toLocaleUpperCase("cs-CZ")}</div><div class="pdf-focus-value${focusNumberClass}">${escape(focusNumber)}<span>%</span></div><p>trvalých následků</p><div class="pdf-focus-note">Stejné hodnocení.<br/>Pro všechny vybrané varianty.</div></aside>` : "";
  const insight = hasDifference ? `<section class="pdf-insight"><div class="pdf-insight-copy"><div class="pdf-kicker">ROZDÍL PŘI ${escape(number(scenarios[highlightIndex].percent))} % NÁSLEDKŮ</div><strong>${escape(money(maxima[highlightIndex] - minima[highlightIndex]))}</strong><p>Mezi nejnižším a nejvyšším plněním<br/>z vybraných variant.</p></div>${rows.length === 2 ? `<figure class="pdf-comparison-figure">${renderScenarioComparison(rows, highlightIndex)}</figure>` : `<div class="pdf-insight-range"><span>Rozpětí vybraných variant</span><strong>${escape(money(minima[highlightIndex]))}<i>→</i>${escape(money(maxima[highlightIndex]))}</strong></div>`}</section>` : "";
  const hasLongName = people.some(person => person.name!.length > 60);
  // Leave room for the personal heading and the full scenario comparison.
  const firstPageCapacity = hasLongName ? 2 : 4;

  for (let offset = 0; offset < Math.max(1, rows.length);) {
    const first = offset === 0;
    const batch = rows.slice(offset, offset + (first ? firstPageCapacity : 7));
    const heading = first
      ? `<div class="pdf-hero"><div class="pdf-hero-copy"><div class="pdf-kicker">TRVALÉ NÁSLEDKY ÚRAZU</div><h1>${title}</h1><p>Osobní srovnání pojistného plnění.<br/>Rozhodují konkrétní podmínky, ne jen číslo progrese.</p></div>${focus}</div>${personalization}`
      : `<div class="pdf-continuation"><h1>Pokračování srovnání</h1><span>Varianty ${offset + 1}–${offset + batch.length} / ${rows.length}</span></div>`;
    const table = batch.length ? `<table class="pdf-summary${scenarios.length > 1 ? " pdf-multi" : ""}"><thead><tr><th>VYBRANÉ VARIANTY</th>${scenarios.map((scenario, index) => `<th><span>${scenarioLabel(index, scenarios.length)}</span><strong>${escape(number(scenario.percent))} %</strong><small>trvalých následků</small></th>`).join("")}</tr></thead><tbody>${batch.map((row, rowIndex) => `<tr><td><div class="pdf-row-name">${row.logo ? `<div class="pdf-row-logo"><img src="${escape(row.logo)}" alt="" /></div>` : ""}<div><strong><b class="pdf-product-number">${String(offset + rowIndex + 1).padStart(2, "0")}</b>${escape(row.insurerName)}</strong><span>${escape(row.productName)}</span><small>${escape(row.badges.join(" · "))}</small></div></div></td>${scenarios.map((_, index) => {
      const payout = row.payouts[index];
      const best = payout > 0 && payout === maxima[index];
      return `<td${best ? ' class="pdf-best"' : ""}><div class="pdf-payout">${escape(money(payout))}</div></td>`;
    }).join("")}</tr>`).join("")}</tbody>${rows.length > 1 ? `<tfoot><tr><td>Rozdíl v plnění<br/><small>Ze všech vybraných variant</small></td>${scenarios.map((_, index) => `<td>${escape(money(maxima[index] - minima[index]))}</td>`).join("")}</tr></tfoot>` : ""}</table><div class="pdf-summary-key"><i></i>Zvýrazněna je nejvyšší částka v každém scénáři.</div>` : `<div class="pdf-empty">Výběru neodpovídá žádná varianta.</div>`;
    pages.push({
      className: first ? rows.length > 2 || hasLongName ? "pdf-cover-dense" : "pdf-cover" : "pdf-continued",
      section: "Přehled pojistného plnění", note: modelNote,
      content: `${header(generatedAt, "Srovnání pojistného plnění")}${heading}${parameters}<div class="pdf-section-heading"><h2>${scenarios.length > 1 ? "Tři pohledy na vaše krytí" : "Vaše krytí v číslech"}</h2><span>${rows.length} ${quantityLabel(rows.length, "varianta", "varianty", "variant")} · ${insurerCount} ${quantityLabel(insurerCount, "pojišťovna", "pojišťovny", "pojišťoven")}<br/>Plnění v Kč, včetně progrese</span></div>${table}${first && rows.length <= 2 ? insight : ""}`,
    });
    if (!batch.length) break;
    offset += batch.length;
  }

  const explanationsPerPage = rows.length <= 4 ? 2 : 3;
  for (let offset = 0; offset < rows.length;) {
    const first = offset === 0;
    // The introductory steps need more space than subsequent explanation pages.
    const batch = rows.slice(offset, offset + (first ? 2 : explanationsPerPage));
    pages.push({
      className: explanationsPerPage === 3 ? "pdf-explanations-dense" : "pdf-explanations",
      section: "Vysvětlení pro klienta", note: modelNote,
      content: `${header(generatedAt, "Jak rozumět výsledkům")}<div class="pdf-kicker">${first ? "Proč se vyplacené částky liší" : `VARIANTY ${offset + 1}–${offset + batch.length}`}</div><h1 class="pdf-explanation-title">Rozdíl je <em>v pravidlech.</em></h1>${first ? `<p class="pdf-explanation-claim">${escape(clientComparisonHeading(rows))}</p><p class="pdf-explanation-lead">Ve srovnání používáme stejné procentní hodnocení; konkrétní úraz mohou různé pojišťovny ohodnotit odlišně. Výslednou částku pak určuje progrese vybrané varianty.</p>${processSteps()}` : ""}${batch.map((row, index) => clientExplanationCard(row, scenarios, sumInsured, offset + index)).join("")}`,
    });
    offset += batch.length;
  }

  if (appendix !== "none") rows.forEach((row, index) => {
    const maxPayoutPercent = Math.max(0, ...row.curve.map(point => point.payoutPercent));
    const scenarioCards = scenarios.map((scenario, scenarioIndex) => `<div class="pdf-scenario-card" style="border-top-color:${color(scenarioIndex)}"><small style="color:${color(scenarioIndex)}">${scenarioLabel(scenarioIndex, scenarios.length).toLocaleUpperCase("cs-CZ")}</small><h3>${escape(number(scenario.percent))} % následků</h3><strong>${escape(money(row.payouts[scenarioIndex]))}</strong><p>${escape(number(sumInsured > 0 ? row.payouts[scenarioIndex] / sumInsured * 100 : 0))} % pojistné částky</p></div>`).join("");
    pages.push({
      section: `${row.insurerName} · Průběh plnění`, note: modelNote,
      content: `${header(generatedAt, "Detail pojistného plnění")}${productHeading(row, index)}<div class="pdf-detail-metrics"><div><small>POJISTNÁ ČÁSTKA</small><strong>${escape(money(sumInsured))}</strong></div><div><small>MAXIMÁLNÍ PLNĚNÍ</small><strong>${escape(number(maxPayoutPercent))} % pojistné částky</strong></div></div><h2 class="pdf-section-title">Jak roste pojistné plnění</h2><p class="pdf-intro">Čísla v grafu označují zadané scénáře. Procento plnění už zahrnuje progresi této varianty.</p>${renderCurve(row, scenarios, sumInsured)}<div class="pdf-scenario-cards">${scenarioCards}</div><div class="pdf-formula"><strong>Jak se částka počítá</strong><p>Pojistná částka × procento plnění ÷ 100. Procento plnění zahrnuje progresi dané varianty.</p></div>`,
    });
    if (appendix !== "graphs-tables" || !row.table) return;
    const table = row.table;
    const dense = table.columns.length <= 3 && table.rows.every(item => item.cells.every(cell => cell.length <= 20));
    const rowsPerColumn = dense ? 19 : 14;
    const columns = dense ? 2 : 1;
    const perPage = rowsPerColumn * columns;
    for (let offset = 0; offset < table.rows.length; offset += perPage) {
      const blocks = Array.from({ length: columns }, (_, column) => table.rows.slice(offset + column * rowsPerColumn, offset + (column + 1) * rowsPerColumn)).filter(block => block.length);
      pages.push({
        section: `${row.insurerName} · Tabulka progrese`,
        note: "Podklad ke srovnání konkrétní produktové varianty. Rozsah následků se posuzuje podle oceňovací tabulky příslušné smlouvy.",
        content: `${header(generatedAt, "Podklady k výpočtu")}${productHeading(row, index)}<h2 class="pdf-section-title">${escape(table.title)}</h2><p class="pdf-intro">Úplná tabulka progrese · řádky ${offset + 1}–${Math.min(table.rows.length, offset + perPage)} z ${table.rows.length}</p><div class="pdf-progression-grid">${blocks.map(block => `<table class="pdf-progression"><thead><tr>${table.columns.map(column => `<th>${escape(column)}</th>`).join("")}</tr></thead><tbody>${block.map(item => `<tr>${item.cells.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("")}</div>`,
      });
    }
  });
  return `<div class="pdf-root"><style>${clientReportStyles}</style>${pages.map((page, index) => `<section class="pdf-page${page.className ? ` ${page.className}` : ""}"><div class="pdf-content">${page.content}</div><footer class="pdf-footer"><p>${escape(page.note)}</p><div><span><strong>Bohemika a.s.</strong> · ${escape(page.section)}</span><span>${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}</span></div></footer></section>`).join("")}</div>`;
}
