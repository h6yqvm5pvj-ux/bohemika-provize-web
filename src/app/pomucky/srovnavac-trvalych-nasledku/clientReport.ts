import { clientComparisonHeading, explainClientVariant, getClientScenarioExample } from "./clientExplanation";
import { reportIcon, reportIllustration } from "./clientReportArtwork";
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
const colors = ["#73518f", "#397b86", "#5b7c69"];
const color = (index: number) => colors[index % colors.length];
const scenarioLabel = (index: number, count: number) => count > 1 ? `Scénář ${index + 1}` : "Modelový úraz";
const quantityLabel = (count: number, one: string, few: string, many: string) => count === 1 ? one : count >= 2 && count <= 4 ? few : many;
const modelNote = "Modelové srovnání při stejné pojistné částce. Skutečné plnění závisí na sjednané variantě, oceňovací tabulce a podmínkách konkrétní smlouvy.";

const header = (date: string, section: string) => `<header class="pdf-brand">
  <div class="pdf-brand-identity"><img src="/icons/bohemika_logo.png" alt="Bohemika" /><div><strong>BOHEMIKA</strong><span>FINANČNÍ PORADENSTVÍ</span></div></div>
  <div class="pdf-document"><strong>${escape(section)}</strong><small>${escape(date)}</small></div>
</header>`;
const badges = (row: ReportRow) => row.badges.map(badge => `<span>${escape(badge)}</span>`).join("");
const productHeading = (row: ReportRow, index: number) => `<div class="pdf-product-heading">
  ${row.logo ? `<div class="pdf-product-logo"><img src="${escape(row.logo)}" alt="${escape(row.insurerName)}" /></div>` : ""}
  <div><div class="pdf-kicker">DETAIL VARIANTY ${String(index + 1).padStart(2, "0")} · ${escape(row.insurerName)}</div><h1>${escape(row.productName)}</h1><div class="pdf-badges">${badges(row)}</div></div>
</div>`;

const processSteps = () => `<div class="pdf-process">
  <div><span class="pdf-process-icon">${reportIcon("assessment")}</span><span><strong>01 · Hodnocení úrazu</strong><small>Rozsah trvalých následků</small></span></div>
  <div><span class="pdf-process-icon">${reportIcon("progression")}</span><span><strong>02 · Tabulka progrese</strong><small>Navýšení podle varianty</small></span></div>
  <div><span class="pdf-process-icon">${reportIcon("payout")}</span><span><strong>03 · Pojistné plnění</strong><small>Výsledná částka v korunách</small></span></div>
</div>`;

function clientExplanationCard(row: ReportRow, scenarios: ReportOptions["scenarios"], sumInsured: number): string {
  const explanation = explainClientVariant(row, scenarios, sumInsured);
  const example = getClientScenarioExample(row, scenarios, sumInsured);
  const equationPercent = example ? example.wholeBaseMultiplier ? example.assessment : example.payoutPercent : 0;
  const roundedEquation = [sumInsured, equationPercent].some(value =>
    Math.abs(value - Number(value.toFixed(6))) > Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  const equation = example
    ? `${roundedEquation ? "Přibližně: " : ""}${equationNumber(sumInsured)} Kč × ${equationNumber(equationPercent)} %${example.wholeBaseMultiplier ? ` × ${example.wholeBaseMultiplier}` : ""}`
    : "";
  return `<article class="pdf-explanation-card">
    <div class="pdf-explanation-product">${row.logo ? `<img src="${escape(row.logo)}" alt="" />` : ""}<div><h2>${escape(row.insurerName)} · ${escape(row.productName)}</h2><div class="pdf-badges">${badges(row)}</div></div></div>
    <p class="pdf-explanation-rule-label">KDY A JAK ROSTE PLNĚNÍ</p><p>${escape(explanation.progression)}</p>
    ${explanation.doubleBenefit ? `<p class="pdf-explanation-secondary">${escape(explanation.doubleBenefit)}</p>` : ""}
    ${example ? `<div class="pdf-example"><div class="pdf-example-top"><span>VÁŠ SCÉNÁŘ · ${escape(equationNumber(example.assessment))} % NÁSLEDKŮ</span><strong>${escape(money(example.payout))}</strong></div><p class="pdf-equation">${escape(equation)}</p><small>${escape(number(example.payoutPercent))} % pojistné částky${Math.abs(example.effectiveMultiplier - 2) < 0.000001 ? " · dvojnásobek plnění bez progrese" : Math.abs(example.effectiveMultiplier - 1) < 0.000001 ? " · v tomto scénáři bez navýšení progresí" : ""}</small></div>` : ""}
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
    return `<line x1="62" x2="662" y1="${y(value)}" y2="${y(value)}" stroke="#e9e5ef" stroke-dasharray="3 5"/><text x="50" y="${y(value) + 4}" text-anchor="end" fill="#82728f" font-size="10">${escape(number(value))} %</text>`;
  }).join("");
  const labels = [0, 25, 50, 75, 100].map(value => `<text x="${x(value)}" y="313" text-anchor="middle" fill="#82728f" font-size="10">${value} %</text>`).join("");
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
    <text x="62" y="24" fill="#725d82" font-size="11">Plnění ze sjednané pojistné částky</text>${grid}
    <path d="${area}" fill="#f0eaf7"/><path d="${path}" fill="none" stroke="#73518f" stroke-width="3" stroke-linejoin="round"/>
    ${labels}${markers}<text x="362" y="342" text-anchor="middle" fill="#725d82" font-size="11">Rozsah trvalých následků</text>
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
  const highlight = highlightIndex >= 0
    ? `<section class="pdf-highlight"><div class="pdf-highlight-copy"><div class="pdf-kicker">CO UKAZUJE VAŠE SROVNÁNÍ</div><h2>Při ${escape(number(scenarios[highlightIndex].percent))} % trvalých následků<br/>se plnění liší o</h2><p>Rozdíl mezi nejnižší a nejvyšší částkou<br/>z vybraných variant v tomto scénáři.</p></div><div class="pdf-highlight-value"><strong>${escape(money(maxima[highlightIndex] - minima[highlightIndex]))}</strong><small>${escape(money(minima[highlightIndex]))} až ${escape(money(maxima[highlightIndex]))}</small></div></section>`
    : `<section class="pdf-client-intro">${reportIcon("shield")}<div><h2>${escape(clientComparisonHeading(rows))}</h2><p>Rozhoduje průběh progrese i to, jak pojišťovna úraz ohodnotí. Níže najdete částky pro stejné zadání.</p></div></section>`;
  const parameters = `<div class="pdf-parameters"><div class="pdf-parameter"><small>SJEDNANÁ POJISTNÁ ČÁSTKA</small><strong>${escape(money(sumInsured))}</strong><span>Stejný základ pro všechny varianty</span></div>${scenarios.map((scenario, index) => `<div class="pdf-parameter"><small><i class="pdf-dot" style="background:${color(index)}"></i>${scenarioLabel(index, scenarios.length).toLocaleUpperCase("cs-CZ")}</small><strong>${escape(number(scenario.percent))} %</strong><span>trvalých následků</span></div>`).join("")}</div>`;
  const hasLongName = people.some(person => person.name!.length > 60);
  // Leave room for the personal heading and the full scenario comparison.
  const firstPageCapacity = hasLongName ? 2 : 4;

  for (let offset = 0; offset < Math.max(1, rows.length);) {
    const first = offset === 0;
    const batch = rows.slice(offset, offset + (first ? firstPageCapacity : 7));
    const heading = first
      ? `<div class="pdf-hero"><div class="pdf-hero-copy"><div class="pdf-kicker">TRVALÉ NÁSLEDKY ÚRAZU</div><h1>Vaše srovnání<br/><span>pojistného plnění.</span></h1><p>Stejný úraz. Různé plnění.</p></div><div class="pdf-hero-art">${reportIllustration}</div></div>${personalization}${rows.length ? highlight : ""}`
      : `<div class="pdf-continuation"><h1>Pokračování srovnání</h1><span>Varianty ${offset + 1}–${offset + batch.length} / ${rows.length}</span></div>`;
    const table = batch.length ? `<table class="pdf-summary${scenarios.length > 1 ? " pdf-multi" : ""}"><thead><tr><th>POJIŠŤOVNA A PRODUKT</th>${scenarios.map((scenario, index) => `<th>${scenarioLabel(index, scenarios.length)}<strong>${escape(number(scenario.percent))} %</strong></th>`).join("")}</tr></thead><tbody>${batch.map(row => `<tr><td><div class="pdf-row-name">${row.logo ? `<div class="pdf-row-logo"><img src="${escape(row.logo)}" alt="" /></div>` : ""}<div><strong>${escape(row.insurerName)}</strong><span>${escape(row.productName)}</span><small>${escape(row.badges.join(" · "))}</small></div></div></td>${scenarios.map((_, index) => {
      const payout = row.payouts[index];
      const best = payout > 0 && payout === maxima[index];
      return `<td${best ? ' class="pdf-best"' : ""}><div class="pdf-payout">${escape(money(payout))}</div></td>`;
    }).join("")}</tr>`).join("")}</tbody>${rows.length > 1 ? `<tfoot><tr><td>Rozdíl mezi nejnižším<br/>a nejvyšším plněním</td>${scenarios.map((_, index) => `<td>${escape(money(maxima[index] - minima[index]))}</td>`).join("")}</tr></tfoot>` : ""}</table><div class="pdf-summary-key"><i></i>Nejvyšší plnění v daném scénáři z vybraných variant.</div>` : `<div class="pdf-empty">Výběru neodpovídá žádná varianta.</div>`;
    pages.push({
      className: first ? rows.length > 2 || hasLongName ? "pdf-cover-dense" : "pdf-cover" : "pdf-continued",
      section: "Přehled pojistného plnění", note: modelNote,
      content: `${header(generatedAt, "Srovnání pojistného plnění")}${heading}${parameters}<div class="pdf-section-heading"><h2>${scenarios.length > 1 ? "Tři scénáře. Konkrétní částky." : "Plnění pro vybraný scénář"}</h2><span>${rows.length} ${quantityLabel(rows.length, "varianta", "varianty", "variant")} · ${insurerCount} ${quantityLabel(insurerCount, "pojišťovna", "pojišťovny", "pojišťoven")}<br/>Částky v Kč včetně progrese</span></div>${table}`,
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
      content: `${header(generatedAt, "Jak rozumět výsledkům")}<div class="pdf-kicker">${first ? "OD HODNOCENÍ K VÝPLATĚ" : `VARIANTY ${offset + 1}–${offset + batch.length}`}</div><h1 class="pdf-explanation-title">Proč se vyplacené částky liší</h1>${first ? `<p class="pdf-explanation-claim">${escape(clientComparisonHeading(rows))}</p><p class="pdf-explanation-lead">Ve srovnání používáme stejné procentní hodnocení; konkrétní úraz mohou různé pojišťovny ohodnotit odlišně. Výslednou částku pak určuje progrese vybrané varianty.</p>${processSteps()}` : ""}${batch.map(row => clientExplanationCard(row, scenarios, sumInsured)).join("")}`,
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
    const rowsPerColumn = dense ? 20 : 14;
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
