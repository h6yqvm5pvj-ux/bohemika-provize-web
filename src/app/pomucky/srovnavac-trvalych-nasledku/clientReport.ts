export type PdfAppendix = "graphs" | "graphs-tables" | "none";
type ReportRow = {
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
type ReportPage = { content: string; section: string; note: string; compact?: boolean };
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const number = (value: number) => value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
const money = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const colors = ["#8563a5", "#4b8a9d", "#668d76"];
const color = (index: number) => colors[index % colors.length];
const scenarioLabel = (index: number, count: number) => count > 1 ? `Scénář ${index + 1}` : "Modelový úraz";
const quantityLabel = (count: number, one: string, few: string, many: string) => count === 1 ? one : count >= 2 && count <= 4 ? few : many;
const modelNote = "Modelové srovnání při stejné pojistné částce. Skutečné plnění závisí na sjednané variantě, oceňovací tabulce a podmínkách konkrétní smlouvy.";

const header = (date: string, section: string, cover = false, personalization = "") => `<header class="pdf-brand${cover ? " pdf-cover-brand" : ""}">
  <div class="pdf-brand-row">
    <img src="/icons/nadpislogo.jpg" alt="Bohemika – finanční poradenství" />
    ${cover ? `<div class="pdf-cover-title"><div class="pdf-kicker">SROVNÁVAČ POJISTNÉHO PLNĚNÍ</div><h1>Stejný úraz.<br/><span>Různé plnění.</span></h1></div>` : ""}
    <div class="pdf-document"><strong>${escape(section)}</strong><small>${escape(date)}</small></div>
  </div>
  ${cover ? personalization : ""}
</header>`;
const badges = (row: ReportRow) => row.badges.map(badge => `<span>${escape(badge)}</span>`).join("");
const productHeading = (row: ReportRow, index: number) => `<div class="pdf-product-heading">
  ${row.logo ? `<div class="pdf-product-logo"><img src="${escape(row.logo)}" alt="${escape(row.insurerName)}" /></div>` : ""}
  <div><div class="pdf-kicker">DETAIL VARIANTY ${String(index + 1).padStart(2, "0")} · ${escape(row.insurerName)}</div><h1>${escape(row.productName)}</h1><div class="pdf-badges">${badges(row)}</div></div>
</div>`;

function renderCurve(row: ReportRow, scenarios: ReportOptions["scenarios"], sumInsured: number) {
  const max = Math.max(100, Math.ceil(Math.max(0, ...row.curve.map(point => point.payoutPercent)) / 100) * 100);
  const x = (percent: number) => 62 + percent * 6;
  const y = (percent: number) => 290 - percent / max * 230;
  const points = row.curve.map(point => ({ x: x(point.percent), y: y(point.payoutPercent) }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = points.length ? `${path} L${points[points.length - 1].x},290 L${points[0].x},290 Z` : "";
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = max * index / 4;
    return `<line x1="62" x2="662" y1="${y(value)}" y2="${y(value)}" stroke="#e9e5ef" stroke-dasharray="3 5"/><text x="50" y="${y(value) + 4}" text-anchor="end" fill="#8f859b" font-size="10">${escape(number(value))} %</text>`;
  }).join("");
  const labels = [0, 25, 50, 75, 100].map(value => `<text x="${x(value)}" y="313" text-anchor="middle" fill="#8f859b" font-size="10">${value} %</text>`).join("");
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
    <text x="62" y="24" fill="#7b688c" font-size="11">Plnění ze sjednané pojistné částky</text>${grid}
    <path d="${area}" fill="#f0eaf7"/><path d="${path}" fill="none" stroke="#9470ae" stroke-width="3" stroke-linejoin="round"/>
    ${labels}${markers}<text x="362" y="342" text-anchor="middle" fill="#7b688c" font-size="11">Rozsah trvalých následků</text>
  </svg></div>`;
}

const styles = `
.pdf-root{width:794px;background:#fff;color:#332b3d;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pdf-root *{box-sizing:border-box}.pdf-root h1,.pdf-root h2,.pdf-root h3,.pdf-root p{margin:0}.pdf-root img{display:block}.pdf-root table{width:100%;border-collapse:collapse;table-layout:fixed}
.pdf-page{position:relative;width:794px;height:1123px;padding:38px 42px 108px;background:#fff;overflow:hidden;break-after:page;page-break-after:always}.pdf-content{width:100%}
.pdf-brand{padding-bottom:18px;border-bottom:1px solid #e7e3ec;margin-bottom:25px}.pdf-brand-row{display:flex;align-items:center;justify-content:space-between}.pdf-brand-row>img{width:80px;height:52px;object-fit:contain}.pdf-document{text-align:right}.pdf-document>strong{display:block;font-size:11px;font-weight:500;color:#675675;margin:5px 0}.pdf-document>small{font-size:9px;color:#9c90a6}
.pdf-kicker{color:#8b719e;font-size:9px;font-weight:600;letter-spacing:1.15px}.pdf-cover-brand{padding-bottom:18px;margin-bottom:12px}.pdf-cover-brand .pdf-brand-row{gap:26px}.pdf-cover-brand .pdf-brand-row>img{width:176px;height:112px;flex-shrink:0}.pdf-cover-title{display:flex;flex:1;min-width:0;height:112px;flex-direction:column;justify-content:space-between;padding:2px 0}.pdf-cover-title h1{font-size:35px;line-height:1.1;letter-spacing:-1.2px;color:#34283e}.pdf-cover-title h1 span{color:#9c83b1}.pdf-cover-title .pdf-kicker{font-size:8px;letter-spacing:.8px;white-space:nowrap}.pdf-cover-brand .pdf-document{max-width:132px;flex-shrink:0}.pdf-overview{display:flex;justify-content:flex-end;align-items:center;gap:16px;margin-bottom:16px;color:#9c8ea6;font-size:10px;line-height:1.5}.pdf-people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px;margin:16px 0 0;padding:0}.pdf-people>div{min-width:0}.pdf-people dt{font-size:8px;letter-spacing:.8px;text-transform:uppercase;color:#91809d}.pdf-people dd{margin:4px 0 0;font-size:13px;font-weight:600;line-height:1.4;color:#584063;overflow-wrap:anywhere}
.pdf-parameters{display:flex;border:1px solid #e8e2ef;border-radius:11px;background:#faf8fc;margin-bottom:20px;overflow:hidden}.pdf-parameter{flex:1;min-width:0;padding:14px 16px;border-left:1px solid #e8e2ef}.pdf-parameter:first-child{border-left:0;flex:1.3}.pdf-parameter small{display:block;color:#91809d;font-size:8px;font-weight:500;letter-spacing:.6px;margin-bottom:6px}.pdf-parameter strong{display:block;color:#654977;font-size:21px;font-weight:600;letter-spacing:-.5px;white-space:nowrap}.pdf-parameter span{display:block;color:#a08fa9;font-size:8px;margin-top:4px}.pdf-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;vertical-align:1px}
.pdf-section-heading{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin:20px 0 10px}.pdf-section-heading h2{font-size:14px;font-weight:600;letter-spacing:-.2px;color:#584063}.pdf-section-heading>span{font-size:9px;color:#9b8aa7;text-align:right}.pdf-summary{border-top:1px solid #e4dce9}.pdf-summary th{padding:11px 10px;background:#f7f3fa;color:#846791;font-size:9px;text-align:right;font-weight:500;border-bottom:1px solid #e7dfee}.pdf-summary th:first-child{text-align:left;width:48%}.pdf-summary.pdf-multi th:first-child{width:39%}.pdf-summary th strong{display:block;font-size:12px;margin-top:3px;font-weight:600}.pdf-summary td{padding:12px 10px;border-bottom:1px solid #ece7f1;vertical-align:middle;text-align:right}.pdf-summary tr:nth-child(even) td{background:#fcfbfd}.pdf-summary td:first-child{text-align:left}.pdf-row-name{display:flex;align-items:center;gap:11px}.pdf-row-logo{width:54px;height:40px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:3px;background:white;border-radius:6px}.pdf-row-logo img{max-width:100%;max-height:34px;object-fit:contain}.pdf-row-name>div:last-child{min-width:0}.pdf-row-name strong{display:block;color:#4c3b58;font-size:11px;font-weight:600}.pdf-row-name span{display:block;margin-top:3px;color:#8a7698;font-size:9px;line-height:1.35}.pdf-row-name small{display:block;margin-top:3px;color:#a08aaf;font-size:8px;line-height:1.4}.pdf-payout{font-size:17px;font-weight:600;color:#695078;letter-spacing:-.45px;white-space:nowrap}.pdf-multi .pdf-payout{font-size:13px;letter-spacing:-.25px}.pdf-bar{height:3px;border-radius:3px;background:#f0ecf4;margin:8px 0 0 auto;max-width:170px;overflow:hidden}.pdf-bar i{display:block;height:3px;border-radius:3px;min-width:0}.pdf-summary td.pdf-best{background:#f0f7f3}.pdf-best .pdf-payout{color:#487660}.pdf-summary-key{display:flex;align-items:center;gap:6px;margin-top:12px;color:#8c8096;font-size:9px}.pdf-summary-key i{display:block;width:7px;height:7px;border-radius:2px;background:#8fb9a1}.pdf-empty{padding:36px 20px;text-align:center;color:#9986a6;border:1px dashed #dfd4e8;border-radius:10px}
.pdf-continued .pdf-parameter{padding:10px 16px}.pdf-continued .pdf-parameter strong{font-size:17px}.pdf-continued .pdf-parameter span{display:none}.pdf-continued .pdf-summary td{padding-top:9px;padding-bottom:9px}.pdf-insight{margin-top:26px;padding:22px;border:1px solid #e6ddec;border-radius:12px;background:#faf7fc}.pdf-insight h2{font-size:16px;font-weight:500;letter-spacing:-.3px;color:#6d4d7e;margin-bottom:18px}.pdf-insight-grid{display:flex;gap:20px}.pdf-insight-grid>div{flex:1;min-width:0}.pdf-insight small{display:block;font-size:9px;color:#a08baa;margin-bottom:7px}.pdf-insight strong{display:block;font-size:23px;letter-spacing:-.6px;font-weight:500;color:#78558c;margin-bottom:9px}.pdf-insight p{font-size:9px;line-height:1.7;color:#9e87aa}.pdf-continuation{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:20px}.pdf-continuation h1{font-size:25px;letter-spacing:-.8px;color:#493553}.pdf-continuation>span{font-size:10px;color:#9f8eaa}.pdf-product-heading{display:flex;align-items:center;gap:18px;margin:26px 0}.pdf-product-logo{display:flex;align-items:center;justify-content:center;width:88px;height:65px;flex-shrink:0;padding:8px;border:1px solid #ece6f0;border-radius:10px}.pdf-product-logo img{max-width:100%;max-height:49px;object-fit:contain}.pdf-product-heading h1{font-size:25px;line-height:1.15;letter-spacing:-.7px;color:#4c3659;margin:9px 0}.pdf-product-heading>div:last-child{min-width:0}.pdf-badges{display:flex;flex-wrap:wrap;gap:5px}.pdf-badges>span{padding:3px 6px;border-radius:4px;background:#f5f0f9;color:#9a7eac;font-size:8px}.pdf-detail-metrics{display:flex;gap:24px;padding:16px 0;border-top:1px solid #eee8f3;border-bottom:1px solid #eee8f3;margin-bottom:25px}.pdf-detail-metrics>div{flex:1}.pdf-detail-metrics small{display:block;font-size:9px;color:#9e8daa;margin-bottom:5px}.pdf-detail-metrics strong{font-size:18px;font-weight:500;color:#795689}.pdf-section-title{font-size:16px;font-weight:600;letter-spacing:-.3px;color:#654475;margin:22px 0 7px!important}.pdf-intro{font-size:10px;color:#9a88a5;line-height:1.6;margin-bottom:10px!important}.pdf-chart{border:1px solid #e6dcee;border-radius:12px;background:#fcfafd;padding:8px 6px;margin:14px 0 23px}.pdf-chart svg{display:block;width:100%;height:auto}
.pdf-scenario-cards{display:flex;gap:12px;margin-top:14px}.pdf-scenario-card{flex:1;min-width:0;border:1px solid #e8e0ee;border-radius:10px;padding:15px 14px;background:#fcfafd;border-top-width:3px}.pdf-scenario-card small{display:block;font-size:8px;letter-spacing:.6px}.pdf-scenario-card h3{font-size:17px;font-weight:500;margin:9px 0 3px;color:#6d507d}.pdf-scenario-card strong{display:block;font-size:21px;letter-spacing:-.6px;color:#664a79;margin:12px 0 5px;white-space:nowrap}.pdf-scenario-card p{color:#9b85a8;font-size:9px;line-height:1.5}.pdf-formula{margin-top:22px;padding:16px 18px;background:#f6f2fa;border-radius:10px}.pdf-formula strong{display:block;font-size:10px;color:#836495;margin-bottom:6px}.pdf-formula p{font-size:10px;line-height:1.65;color:#9b84a9}.pdf-progression-grid{display:flex;gap:20px;align-items:flex-start;margin-top:16px}.pdf-progression-grid>table{flex:1;width:0}.pdf-progression th{padding:10px 9px;font-size:9px;line-height:1.45;background:#f1ebf7;border-bottom:1px solid #dfd2e9;text-align:right;color:#8b6d9d;font-weight:500}.pdf-progression td{font-size:10px;padding:8px 9px;border-bottom:1px solid #eee6f4;text-align:right;color:#977ba7;line-height:1.5}.pdf-progression td:first-child,.pdf-progression th:first-child{text-align:left;color:#80638f}.pdf-progression tr:nth-child(even) td{background:#fcfafd}
.pdf-footer{position:absolute;left:42px;right:42px;bottom:31px;border-top:1px solid #e5dceb;padding-top:13px}.pdf-footer>p{font-size:8px;line-height:1.6;color:#a090ab;max-width:670px;margin-bottom:12px}.pdf-footer>div{display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:9px;color:#9b87a6}.pdf-footer strong{color:#82658f;font-weight:500}.pdf-page:last-child{break-after:auto;page-break-after:auto}
@media print{.pdf-root{width:210mm}.pdf-page{width:210mm;height:297mm;break-inside:avoid;page-break-inside:avoid}@page{size:A4;margin:0}}
`;

/** Explicit A4 pages keep product rows and appendix tables together in both export paths. */
export function buildClientReport({ generatedAt, clientName, advisorName, sumInsured, scenarios, rows, appendix }: ReportOptions): string {
  const pages: ReportPage[] = [];
  const people = [{ label: "Klient", name: clientName }, { label: "Poradce", name: advisorName }]
    .map(person => ({ ...person, name: person.name?.replace(/\s+/g, " ").trim() }))
    .filter(person => person.name);
  const personalization = people.length
    ? `<dl class="pdf-people">${people.map(person => `<div><dt>${person.label}</dt><dd>${escape(person.name!)}</dd></div>`).join("")}</dl>`
    : "";
  const maxima = scenarios.map((_, index) => Math.max(0, ...rows.map(row => row.payouts[index])));
  const insurerCount = new Set(rows.map(row => row.insurerName)).size;
  const parameters = `<div class="pdf-parameters"><div class="pdf-parameter"><small>SJEDNANÁ POJISTNÁ ČÁSTKA</small><strong>${escape(money(sumInsured))}</strong><span>Stejný základ pro všechny varianty</span></div>${scenarios.map((scenario, index) => `<div class="pdf-parameter"><small><i class="pdf-dot" style="background:${color(index)}"></i>${scenarioLabel(index, scenarios.length).toLocaleUpperCase("cs-CZ")}</small><strong style="color:${color(index)}">${escape(number(scenario.percent))} %</strong><span>Rozsah trvalých následků</span></div>`).join("")}</div>`;

  // Reserve room for the cover title and optional names, including longer names that wrap.
  for (let offset = 0; offset < Math.max(1, rows.length);) {
    const first = offset === 0;
    const batch = rows.slice(offset, offset + (first ? 7 : 10));
    const heading = first
      ? `<div class="pdf-overview"><span>${rows.length} ${quantityLabel(rows.length, "varianta", "varianty", "variant")} ve srovnání · ${insurerCount} ${quantityLabel(insurerCount, "pojišťovna", "pojišťovny", "pojišťoven")}</span></div>`
      : `<div class="pdf-continuation"><h1>Pokračování srovnání</h1><span>Varianty ${offset + 1}–${offset + batch.length} / ${rows.length}</span></div>`;
    const table = batch.length ? `<table class="pdf-summary${scenarios.length > 1 ? " pdf-multi" : ""}"><thead><tr><th>POJIŠŤOVNA A PRODUKT</th>${scenarios.map((scenario, index) => `<th style="color:${color(index)}">${scenarioLabel(index, scenarios.length)}<strong>${escape(number(scenario.percent))} % TN</strong></th>`).join("")}</tr></thead><tbody>${batch.map(row => `<tr><td><div class="pdf-row-name">${row.logo ? `<div class="pdf-row-logo"><img src="${escape(row.logo)}" alt="" /></div>` : ""}<div><strong>${escape(row.insurerName)}</strong><span>${escape(row.productName)}</span><small>${escape(row.badges.join(" · "))}</small></div></div></td>${scenarios.map((_, index) => {
      const payout = row.payouts[index];
      const best = payout > 0 && payout === maxima[index];
      const share = maxima[index] > 0 ? Math.max(0, Math.min(100, payout / maxima[index] * 100)) : 0;
      return `<td${best ? ' class="pdf-best"' : ""}><div class="pdf-payout">${escape(money(payout))}</div><div class="pdf-bar"><i style="width:${share.toFixed(2)}%;background:${best ? "#83ac93" : color(index)}"></i></div></td>`;
    }).join("")}</tr>`).join("")}</tbody></table><div class="pdf-summary-key"><i></i>Nejvyšší plnění v daném scénáři z vybraných variant. Proužky porovnávají výši částek.</div>` : `<div class="pdf-empty">Výběru neodpovídá žádná varianta.</div>`;
    const insight = first && rows.length > 1 && rows.length <= 4
      ? `<section class="pdf-insight"><h2>Rozdíl mezi nejnižším a nejvyšším plněním</h2><div class="pdf-insight-grid">${scenarios.map((scenario, index) => {
        const minimum = Math.min(...rows.map(row => row.payouts[index]));
        return `<div><small>${escape(number(scenario.percent))} % TRVALÝCH NÁSLEDKŮ</small><strong style="color:${color(index)}">${escape(money(maxima[index] - minimum))}</strong><p>Od ${escape(money(minimum))}<br/>do ${escape(money(maxima[index]))}</p></div>`;
      }).join("")}</div></section>`
      : "";
    pages.push({
      compact: !first,
      section: "Přehled pojistného plnění",
      note: modelNote,
      content: `${header(generatedAt, "Trvalé následky úrazu", first, personalization)}${heading}${parameters}<div class="pdf-section-heading"><h2>${scenarios.length > 1 ? "Tři situace. Přehledné srovnání." : "Kolik jednotlivé varianty vyplatí"}</h2><span>Částky v Kč · včetně progrese</span></div>${table}${insight}`,
    });
    if (!batch.length) break;
    offset += batch.length;
  }

  if (appendix !== "none") rows.forEach((row, index) => {
    const maxPayoutPercent = Math.max(0, ...row.curve.map(point => point.payoutPercent));
    const scenarioCards = scenarios.map((scenario, scenarioIndex) => `<div class="pdf-scenario-card" style="border-top-color:${color(scenarioIndex)}"><small style="color:${color(scenarioIndex)}">${scenarioLabel(scenarioIndex, scenarios.length).toLocaleUpperCase("cs-CZ")}</small><h3>${escape(number(scenario.percent))} % následků</h3><strong>${escape(money(row.payouts[scenarioIndex]))}</strong><p>${escape(number(sumInsured > 0 ? row.payouts[scenarioIndex] / sumInsured * 100 : 0))} % pojistné částky</p></div>`).join("");
    pages.push({
      section: `${row.insurerName} · Průběh plnění`,
      note: modelNote,
      content: `${header(generatedAt, "Detail pojistného plnění")}${productHeading(row, index)}<div class="pdf-detail-metrics"><div><small>POJISTNÁ ČÁSTKA</small><strong>${escape(money(sumInsured))}</strong></div><div><small>MAXIMÁLNÍ PLNĚNÍ</small><strong>${escape(number(maxPayoutPercent))} % pojistné částky</strong></div></div><h2 class="pdf-section-title">Jak roste pojistné plnění</h2><p class="pdf-intro">Progrese zvyšuje plnění podle rozsahu trvalých následků. Čísla v grafu odpovídají scénářům níže.</p>${renderCurve(row, scenarios, sumInsured)}<div class="pdf-scenario-cards">${scenarioCards}</div><div class="pdf-formula"><strong>Jak se částka počítá</strong><p>Pojistná částka × procento plnění ÷ 100. Procento plnění již zahrnuje progresi dané varianty; nejde o samotný rozsah poškození.</p></div>`,
    });
    if (appendix !== "graphs-tables" || !row.table) return;
    const table = row.table;
    const dense = table.columns.length <= 3 && table.rows.every(item => item.cells.every(cell => cell.length <= 20));
    const rowsPerColumn = dense ? 21 : 18;
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
  return `<div class="pdf-root"><style>${styles}</style>${pages.map((page, index) => `<section class="pdf-page${page.compact ? " pdf-continued" : ""}"><div class="pdf-content">${page.content}</div><footer class="pdf-footer"><p>${page.note}</p><div><span><strong>Bohemika a.s.</strong> · ${escape(page.section)}</span><span>${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}</span></div></footer></section>`).join("")}</div>`;
}
