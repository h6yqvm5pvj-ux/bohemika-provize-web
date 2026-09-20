import type { jsPDF } from "jspdf";
import type { ReportAdvisor } from "../neon-life-vs-metlife-oneguard/comparisonReportContent";
import type { LiabilityReport, ExportRow, ExportSection } from "./exportData";
import type { LiabilityProduct } from "./products";
import type { ComparisonTone } from "./comparisonData";

export type LiabilityPdfOptions = { report: LiabilityReport; advisor: ReportAdvisor; generatedAt?: Date };
const FONT = "LiberationSans";
const INK = "#493354", MUTED = "#82708e", LINE = "#e4dcea", PURPLE = "#79558f";
const MARGIN = 28, LINE_HEIGHT = 11.5, PADDING = 7;
const TONES: Record<ComparisonTone, { fill: string; ink: string }> = {
  positive: { fill: "#edf7f2", ink: "#286748" }, warning: { fill: "#fff7e9", ink: "#89601d" },
  negative: { fill: "#fff0ed", ink: "#ad4839" }, neutral: { fill: "#f4f4f7", ink: "#625e6e" },
};
type TextLine = { text: string; bold?: boolean; color?: string };

async function asset(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Nepodařilo se načíst podklady PDF.");
  return new Uint8Array(await response.arrayBuffer());
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
function safeLink(value: string): string | undefined {
  try { const url = new URL(value); return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}

// Native PDF text keeps Czech characters searchable and sharp in print.
export async function createLiabilityPdf({ report, advisor, generatedAt = new Date() }: LiabilityPdfOptions): Promise<jsPDF> {
  if (!report.products.length || !report.sections.some((section) => section.rows.length)) throw new Error("Vyber alespoň jeden produkt a kritérium.");
  if (report.sections.some((section) => section.rows.some((row) => row.cells.length !== report.products.length))) throw new Error("Počet odpovědí neodpovídá vybraným produktům.");
  const cardUrl = safeLink(advisor.cardUrl);
  const [{ jsPDF: Pdf }, regular, bold, companyLogo, qr] = await Promise.all([
    import("jspdf"), asset("/fonts/LiberationSans-Regular.ttf"), asset("/fonts/LiberationSans-Bold.ttf"), asset("/icons/nadpislogo.jpg"),
    cardUrl ? import("qrcode").then((module) => module.default.toDataURL(cardUrl, { width: 240, margin: 1, errorCorrectionLevel: "M", color: { dark: INK, light: "#ffffff" } })) : Promise.resolve(""),
  ]);
  const pdf = new Pdf({ orientation: "landscape", unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  for (const [style, bytes] of [["normal", regular], ["bold", bold]] as const) {
    pdf.addFileToVFS(`${FONT}-${style}.ttf`, base64(bytes)); pdf.addFont(`${FONT}-${style}.ttf`, FONT, style);
  }
  pdf.setProperties({ title: "Srovnání odpovědnosti občana", author: advisor.fullName || advisor.email, creator: "Bohemika a.s.", subject: report.sections.map((section) => section.title).join(" · ") });
  const pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
  const width = pageWidth - MARGIN * 2, bottom = pageHeight - 39;
  const date = generatedAt.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
  const logoProps = pdf.getImageProperties(companyLogo);
  let firstPage = true;

  function font(size = 8.5, weight = false, color = INK) {
    pdf.setFont(FONT, weight ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
  }
  function text(value: string, x: number, y: number, size = 8.5, weight = false, color = INK) {
    font(size, weight, color); pdf.text(value, x, y, { baseline: "top" });
  }
  function wrapped(value: string, space: number, weight = false, color = INK): TextLine[] {
    font(8.5, weight);
    return (pdf.splitTextToSize(value, space) as string[]).map((line) => ({ text: line, bold: weight, color }));
  }
  function drawLines(lines: TextLine[], x: number, y: number) {
    lines.forEach((line, index) => text(line.text, x, y + index * LINE_HEIGHT, 8.5, line.bold, line.color));
  }
  function rule(y: number) { pdf.setDrawColor(LINE); pdf.setLineWidth(.5); pdf.line(MARGIN, y, pageWidth - MARGIN, y); }
  function newPage() {
    if (!firstPage) pdf.addPage(); firstPage = false;
    const logoHeight = 40, logoWidth = logoHeight * logoProps.width / logoProps.height;
    pdf.addImage(companyLogo, "JPEG", MARGIN, 14, logoWidth, logoHeight, "bohemika-logo");
    text("Srovnání odpovědnosti občana", MARGIN + logoWidth + 16, 18, 16, true);
    text(`${report.products.length} produktů · ${report.sections.length} sekcí · ${report.includeDetails ? "včetně podrobností" : "stručný přehled bez podrobností"}${report.onlyDifferences ? " · pouze rozdíly" : ""}`, MARGIN + logoWidth + 16, 42, 8.5, false, MUTED);
    font(10, true); pdf.text("Bohemika a.s.", pageWidth - MARGIN, 20, { align: "right", baseline: "top" });
    font(8, false, MUTED); pdf.text(date, pageWidth - MARGIN, 39, { align: "right", baseline: "top" });
    rule(64); return 78;
  }

  // Repeat the product identities on every page, and use extra column groups
  // if more than five products are added to the catalog in the future.
  const groups: Array<{ products: LiabilityProduct[]; offset: number }> = [];
  for (let offset = 0; offset < report.products.length; offset += 5) groups.push({ products: report.products.slice(offset, offset + 5), offset });
  let y = 78;
  for (const group of groups) {
    const criterionWidth = 158, productWidth = (width - criterionWidth) / group.products.length;
    const columnWidths = [criterionWidth, ...group.products.map(() => productWidth)];
    function tableHeader(section: ExportSection, continuation = false) {
      let top = newPage();
      text(`${section.title}${continuation ? " · pokračování" : ""}`, MARGIN, top, 12, true, PURPLE);
      if (groups.length > 1) {
        font(8, false, MUTED); pdf.text(`Produkty ${group.offset + 1}–${group.offset + group.products.length} z ${report.products.length}`, pageWidth - MARGIN, top + 3, { align: "right", baseline: "top" });
      }
      top += 24;
      const columns = [[{ text: "Kritérium", bold: true }], ...group.products.map((product) => [
        ...wrapped(product.insurerName, productWidth - PADDING * 2, false, MUTED),
        ...wrapped(product.productName, productWidth - PADDING * 2, true),
        { text: product.date, color: MUTED },
      ])];
      const height = Math.max(...columns.map((column) => column.length)) * LINE_HEIGHT + PADDING * 2;
      let x = MARGIN;
      columns.forEach((column, index) => {
        pdf.setFillColor("#f5eff9"); pdf.setDrawColor(LINE); pdf.rect(x, top, columnWidths[index], height, "FD");
        drawLines(column, x + PADDING, top + PADDING); x += columnWidths[index];
      });
      return top + height;
    }
    function rowLayout(row: ExportRow) {
      const label = [
        ...(row.parentLabel ? wrapped(row.parentLabel, criterionWidth - PADDING * 2, false, MUTED) : []),
        ...wrapped(row.title, criterionWidth - PADDING * 2, true),
      ];
      const cells = row.cells.slice(group.offset, group.offset + group.products.length).map((cell) => [
        ...wrapped(cell.summary, productWidth - PADDING * 2, true, TONES[cell.tone].ink),
        ...(cell.context ? [{ text: "" }, ...wrapped(cell.context, productWidth - PADDING * 2, false, TONES[cell.tone].ink)] : []),
        ...(cell.detail ? [{ text: "" }, ...wrapped(cell.detail, productWidth - PADDING * 2, false, TONES[cell.tone].ink)] : []),
      ]);
      return [label, ...cells];
    }
    for (const section of report.sections) {
      if (!section.rows.length) continue;
      y = tableHeader(section);
      const capacity = bottom - y;
      for (const row of section.rows) {
        const queues = rowLayout(row);
        const totalHeight = Math.max(...queues.map((queue) => queue.length)) * LINE_HEIGHT + PADDING * 2;
        if (y + Math.min(totalHeight, capacity) > bottom) y = tableHeader(section, true);
        let continued = false;
        while (queues.some((queue) => queue.length)) {
          const lineCount = Math.floor((bottom - y - PADDING * 2) / LINE_HEIGHT);
          if (lineCount < 1) { y = tableHeader(section, true); continue; }
          const chunks = queues.map((queue) => queue.splice(0, lineCount));
          if (continued && !chunks[0].length) chunks[0] = [{ text: "Pokračování kritéria", color: MUTED }];
          const height = Math.max(...chunks.map((chunk) => chunk.length)) * LINE_HEIGHT + PADDING * 2;
          let x = MARGIN;
          chunks.forEach((chunk, index) => {
            pdf.setFillColor(index === 0 ? "#fdfbfe" : TONES[row.cells[group.offset + index - 1].tone].fill);
            pdf.setDrawColor(LINE); pdf.rect(x, y, columnWidths[index], height, "FD");
            drawLines(chunk, x + PADDING, y + PADDING); x += columnWidths[index];
          });
          y += height;
          if (queues.some((queue) => queue.length)) { y = tableHeader(section, true); continued = true; }
        }
      }
    }
  }

  // Advisor card: the same profile fields as the existing branded reports.
  const cardTextWidth = width - (qr ? 124 : 28);
  const contacts: TextLine[] = [
    { text: "VÁŠ PORADCE", bold: true, color: PURPLE },
    ...wrapped(advisor.fullName || advisor.email, cardTextWidth, true),
    ...wrapped(advisor.title, cardTextWidth, false, MUTED),
    ...(advisor.phone ? wrapped(advisor.phone, cardTextWidth) : []),
    ...(advisor.email ? wrapped(advisor.email, cardTextWidth) : []),
    ...(advisor.ico ? wrapped(`IČO: ${advisor.ico}`, cardTextWidth, false, MUTED) : []),
  ];
  const desiredCardHeight = Math.max(qr ? 100 : 80, contacts.length * LINE_HEIGHT + 24);
  if (y + desiredCardHeight + 16 > bottom) y = newPage(); else y += 16;
  let contactContinued = false;
  while (contacts.length) {
    const count = Math.floor((bottom - y - 24) / LINE_HEIGHT);
    if (count < 1) { y = newPage(); continue; }
    const picked = contacts.splice(0, count);
    const height = Math.max(qr && !contactContinued ? 100 : 0, picked.length * LINE_HEIGHT + 24);
    pdf.setFillColor("#f5eff9"); pdf.setDrawColor(LINE); pdf.roundedRect(MARGIN, y, width, height, 7, 7, "FD");
    drawLines(picked, MARGIN + 14, y + 12);
    if (qr && !contactContinued && cardUrl) {
      pdf.addImage(qr, "PNG", pageWidth - MARGIN - 90, y + 8, 74, 74);
      text("Online vizitka", pageWidth - MARGIN - 81, y + 83, 8, false, PURPLE);
      pdf.link(pageWidth - MARGIN - 96, y + 6, 88, 88, { url: cardUrl });
    }
    if (contacts.length) { y = newPage(); contactContinued = true; }
  }
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page); rule(pageHeight - 29);
    text("Údaje podle dodaného srovnání. Data verzí jsou uvedena u produktů.", MARGIN, pageHeight - 21, 7.5, false, MUTED);
    font(7.5, true, PURPLE); pdf.text(`${page} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 21, { align: "right", baseline: "top" });
  }
  return pdf;
}

export async function downloadLiabilityPdf(options: LiabilityPdfOptions) {
  const pdf = await createLiabilityPdf(options);
  const date = (options.generatedAt ?? new Date()).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  await pdf.save(`srovnani-odpovednosti-obcana-${date}.pdf`, { returnPromise: true });
}
