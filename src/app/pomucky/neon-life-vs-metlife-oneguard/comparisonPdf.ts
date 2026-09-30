import type { jsPDF } from "jspdf";
import { formatComparisonMeetingDate, normalizeComparisonPersonalization, prioritizeComparisonRows, type ComparisonPersonalization } from "./comparisonPersonalization";
import type { ComparisonReportRow, ReportAdvisor, ReportBlock, ReportRun, ReportSummary } from "./comparisonReportContent";

const FONT = "LiberationSans";
const INK = "#40556c";
const MUTED = "#65758b";
const NAVY = "#293c50";
const BLUE = "#245d83";
const PURPLE = "#654581";
const LINE = "#e3e8ef";
const MARGIN = 36;
const TOP = 88;
const TONES: Record<string, { ink: string; fill: string }> = {
  positive: { ink: "#175b3b", fill: "#e8f5ed" },
  caution: { ink: "#982c45", fill: "#fcecf0" },
  info: { ink: "#245d83", fill: "#eaf3fb" },
  neutral: { ink: "#475569", fill: "#eef1f5" },
};

export type ComparisonPdfOptions = {
  rows: ComparisonReportRow[];
  advisor: ReportAdvisor;
  scopeLabel: string;
  origin: string;
  generatedAt?: Date;
  personalization?: Partial<ComparisonPersonalization>;
  pinnedTopicIds?: string[];
};

async function asset(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Nepodařilo se načíst podklady PDF. Zkuste stažení znovu.");
  return new Uint8Array(await response.arrayBuffer());
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function safeUrl(href: string, origin: string) {
  try {
    const url = new URL(href, origin);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

// Draw with native PDF text and vectors, keeping Czech text searchable at any zoom.
export async function createComparisonPdf(options: ComparisonPdfOptions): Promise<jsPDF> {
  const rows = prioritizeComparisonRows(options.rows, options.pinnedTopicIds ?? []);
  const pinnedIds = new Set((options.pinnedTopicIds ?? []).filter(id => rows.some(row => row.id === id)));
  const personalization = normalizeComparisonPersonalization(options.personalization);
  const meetingDate = formatComparisonMeetingDate(personalization.meetingDate);
  if (!rows.length) throw new Error("Vyberte alespoň jedno téma pro PDF.");
  const [{ jsPDF: Pdf }, regular, bold, logo, cppLogo, metlifeLogo, qr] = await Promise.all([
    import("jspdf"), asset("/fonts/LiberationSans-Regular.ttf"), asset("/fonts/LiberationSans-Bold.ttf"),
    asset("/icons/nadpislogo.jpg"), asset("/icons/cpp.png"), asset("/icons/metlife.png"),
    options.advisor.cardUrl ? import("qrcode").then(module => module.default.toDataURL(options.advisor.cardUrl, {
      width: 280, margin: 1, errorCorrectionLevel: "M", color: { dark: NAVY, light: "#ffffff" },
    })) : Promise.resolve(""),
  ]);
  const pdf = new Pdf({ unit: "pt", format: "a4", orientation: "landscape", compress: true, putOnlyUsedFonts: true });
  for (const [style, bytes] of [["normal", regular], ["bold", bold]] as const) {
    pdf.addFileToVFS(`${FONT}-${style}.ttf`, base64(bytes));
    pdf.addFont(`${FONT}-${style}.ttf`, FONT, style);
  }
  pdf.setProperties({ title: "NEON Life vs. MetLife OneGuard – podrobné srovnání", author: options.advisor.fullName || options.advisor.email, creator: "Bohemika a.s.", subject: options.scopeLabel });
  const width = pdf.internal.pageSize.getWidth() - MARGIN * 2;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const BOTTOM = pageHeight - 48;
  const right = MARGIN + width;
  const COLUMN_GAP = 14;
  const topicWidth = (width - COLUMN_GAP * 2) * .27;
  const colWidth = (width - topicWidth - COLUMN_GAP * 2) / 2;
  const innerWidth = colWidth - 28;
  const date = (options.generatedAt ?? new Date()).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
  const destinations: Array<{ pageNumber: number; top: number }> = [];

  function font(size: number, weight = "normal", color = INK) {
    pdf.setFont(FONT, weight); pdf.setFontSize(size); pdf.setTextColor(color);
  }
  function text(value: string, x: number, y: number, size = 10, weight = "normal", color = INK) {
    font(size, weight, color); pdf.text(value, x, y, { baseline: "top" });
  }
  function rightText(value: string, x: number, y: number, size = 10, weight = "normal", color = INK) {
    font(size, weight, color); pdf.text(value, x, y, { baseline: "top", align: "right" });
  }
  function lines(value: string, size: number, space: number, weight = "normal"): string[] {
    font(size, weight); return pdf.splitTextToSize(value, space) as string[];
  }
  function paragraph(value: string, x: number, y: number, space: number, size = 10, weight = "normal", color = INK) {
    const wrapped = lines(value, size, space, weight);
    wrapped.forEach((line, index) => text(line, x, y + index * size * 1.4, size, weight, color));
    return y + wrapped.length * size * 1.4;
  }
  function singleLine(value: string, space: number, size: number) {
    font(size);
    if (pdf.getTextWidth(value) <= space) return value;
    let shortened = value;
    while (shortened && pdf.getTextWidth(`${shortened}…`) > space) shortened = shortened.slice(0, -1);
    return `${shortened.trimEnd()}…`;
  }
  function panel(x: number, y: number, w: number, h: number, fill: string, border?: string, radius = 7) {
    pdf.setFillColor(fill); pdf.setDrawColor(border ?? fill); pdf.setLineWidth(0.6);
    pdf.roundedRect(x, y, w, h, radius, radius, border ? "FD" : "F");
  }
  function rule(x: number, y: number, w: number, color = LINE) {
    pdf.setDrawColor(color); pdf.setLineWidth(0.6); pdf.line(x, y, x + w, y);
  }
  function fittedImage(bytes: Uint8Array, format: "JPEG" | "PNG", x: number, y: number, w: number, h: number, alias: string) {
    const dimensions = pdf.getImageProperties(bytes);
    const scale = Math.min(w / dimensions.width, h / dimensions.height);
    const imageWidth = dimensions.width * scale, imageHeight = dimensions.height * scale;
    pdf.addImage(bytes, format, x, y + (h - imageHeight) / 2, imageWidth, imageHeight, alias);
  }
  function letterhead() {
    fittedImage(logo, "JPEG", MARGIN, 24, 66, 39, "bohemika-logo");
    rightText("Bohemika a.s.", right, 29, 10, "bold", NAVY);
    rightText(`Životní pojištění  /  Srovnání k ${date}`, right, 47, 8, "normal", MUTED);
    rule(MARGIN, 77, width);
    rule(MARGIN, 77, 31, PURPLE); rule(MARGIN + 34, 77, 31, BLUE);
  }
  function newPage() { pdf.addPage(); letterhead(); return TOP; }
  function titleHeight(row: ComparisonReportRow, continuation = false) {
    return Math.max(28, lines(row.title, 18, width - 53, "bold").length * 25.2) + 14 + (pinnedIds.has(row.id) || continuation ? 16 : 0);
  }
  function topicTitle(row: ComparisonReportRow, index: number, y: number, continuation = false) {
    const bottom = y + titleHeight(row, continuation);
    const label = [pinnedIds.has(row.id) ? "DŮLEŽITÉ PRO KLIENTA" : "", continuation ? "POKRAČOVÁNÍ DETAILU" : ""].filter(Boolean).join(" · ");
    if (label) { text(label, MARGIN + 49, y, 7.5, "bold", pinnedIds.has(row.id) ? PURPLE : BLUE); y += 16; }
    panel(MARGIN, y, 32, 29, "#f4eff8", "#e7dff0", 7);
    text(String(index + 1).padStart(2, "0"), MARGIN + 7, y + 7, 13, "bold", PURPLE);
    paragraph(row.title, MARGIN + 49, y + 2, width - 53, 18, "bold", NAVY);
    return bottom;
  }

  function wrapRuns(runs: ReportRun[], size: number, space: number, weight: string): ReportRun[][] {
    const result: ReportRun[][] = [[]];
    let used = 0;
    const nextLine = () => { result.push([]); used = 0; };
    const append = (run: ReportRun, value: string) => {
      font(size, run.bold ? "bold" : weight);
      const runWidth = pdf.getTextWidth(value);
      const previous = result.at(-1)!.at(-1);
      if (previous && previous.bold === run.bold && previous.highlight === run.highlight) previous.text += value;
      else result.at(-1)!.push({ ...run, text: value });
      used += runWidth;
    };
    for (const run of runs) for (const token of run.text.match(/\s+|\S+/g) ?? []) {
      font(size, run.bold ? "bold" : weight);
      if (!token.trim()) {
        if (used > 0 && used + pdf.getTextWidth(" ") < space) append(run, " ");
        continue;
      }
      if (used > 0 && used + pdf.getTextWidth(token) > space) nextLine();
      if (pdf.getTextWidth(token) <= space) append(run, token);
      else for (const character of token) {
        if (used + pdf.getTextWidth(character) > space && used > 0) nextLine();
        append(run, character);
      }
    }
    return result.filter(line => line.length > 0);
  }
  type Block = {
    lines: string[]; size: number; weight: string; color: string; kind: ReportBlock["kind"];
    cells?: string[][]; cellTones?: string[]; decoration?: ReportBlock["decoration"];
    runs?: ReportRun[][]; href?: string; gap: number; padding: number;
  };
  function layout(blocks: ReportBlock[], space: number): Block[] {
    return blocks.map(block => {
      const size = block.cells ? 9 : block.kind === "heading" ? 10 : 9.6;
      const weight = block.kind === "heading" ? "bold" : "normal";
      const padding = block.cells ? 4 : block.kind === "quote" || block.decoration === "callout" ? 7 : 0;
      const runs = block.runs ? wrapRuns(block.runs, size, space - padding * 2, weight) : undefined;
      return { lines: runs ? runs.map(line => line.map(run => run.text).join("")) : lines(block.text, size, space - padding * 2, weight), size, weight, kind: block.kind,
        color: block.href ? BLUE : block.kind === "quote" ? MUTED : INK,
        cells: block.cells?.map(cell => lines(cell, size, space / block.cells!.length - 12, "bold")),
        cellTones: block.cellTones, decoration: block.decoration, runs,
        href: block.href ? safeUrl(block.href, options.origin) : undefined, gap: block.cells ? 3 : block.href ? 4 : 8, padding };
    });
  }
  function blockHeight(block: Block) {
    return (block.cells ? Math.max(...block.cells.map(cell => cell.length)) : block.lines.length) * block.size * 1.4 + block.padding * 2 + block.gap;
  }
  function measure(queue: Block[]) { return queue.reduce((sum, block) => sum + blockHeight(block), 0); }
  function take(queue: Block[], available: number): Block[] {
    const picked: Block[] = [];
    while (queue.length) {
      const block = queue[0];
      const height = blockHeight(block);
      const next = queue[1];
      const nextLineCount = next ? next.cells ? Math.max(...next.cells.map(cell => cell.length)) : next.lines.length : 0;
      const keepNext = block.kind === "heading" && next
        ? nextLineCount <= 4 ? blockHeight(next) : 2 * next.size * 1.4 + next.padding * 2
        : 0;
      if (height + keepNext > available) {
        // A heading may be followed by a partial paragraph; otherwise reserving
        // two lines for it would still leave the heading alone at the page end.
        if (picked.length && picked.at(-1)?.kind !== "heading") break;
        if (block.kind === "heading" && height <= available && next) break;
        const count = Math.floor((available - block.padding * 2 - block.gap) / (block.size * 1.4));
        if (count <= 0) break;
        if (block.cells) {
          picked.push({ ...block, cells: block.cells.map(cell => cell.splice(0, count)) });
          if (block.cells.every(cell => !cell.length)) queue.shift();
        } else {
          picked.push({ ...block, lines: block.lines.splice(0, count), runs: block.runs?.splice(0, count) });
          if (!block.lines.length) queue.shift();
        }
        break;
      }
      picked.push(queue.shift()!); available -= height;
    }
    return picked;
  }
  function drawBlocks(blocks: Block[], x: number, y: number, space: number) {
    for (const block of blocks) {
      const h = blockHeight(block) - block.gap;
      if (block.kind === "quote") {
        panel(x, y, space, h, "#f5f7fa", undefined, 2);
        pdf.setFillColor("#a2b4c6"); pdf.rect(x, y + 5, 1.5, Math.max(1, h - 10), "F");
      } else if (block.decoration === "callout") panel(x, y, space, h, "#f8fafc", LINE, 4);
      else if (block.cells && block.decoration !== "tiles") panel(x, y, space, h, "#f1f5f8", undefined, 3);
      if (block.cells) {
        const cellWidth = space / block.cells.length;
        block.cells.forEach((cell, column) => {
          const tone = TONES[block.cellTones?.[column] ?? "neutral"];
          if (block.decoration === "tiles") panel(x + column * cellWidth, y, cellWidth - 3, h, tone.fill, undefined, 3);
          cell.forEach((line, index) => text(line, x + 5 + column * cellWidth, y + block.padding + index * block.size * 1.4, block.size, "bold", block.decoration === "tiles" ? tone.ink : column ? BLUE : INK));
        });
      } else if (block.runs) {
        block.runs.forEach((line, index) => {
          let rx = x + block.padding;
          const ry = y + block.padding + index * block.size * 1.4;
          for (const run of line) {
            font(block.size, run.bold ? "bold" : block.weight);
            const runWidth = pdf.getTextWidth(run.text);
            if (run.highlight) { pdf.setFillColor("#f1e6ed"); pdf.rect(rx, ry - 1, runWidth, block.size * 1.2, "F"); }
            text(run.text, rx, ry, block.size, run.bold ? "bold" : block.weight, run.highlight ? "#85374f" : block.color);
            rx += runWidth;
          }
        });
      } else {
        block.lines.forEach((line, index) => text(line, x + block.padding, y + block.padding + index * block.size * 1.4, block.size, block.weight, block.color));
      }
      if (block.href) pdf.link(x, y, space, h, { url: block.href });
      y += blockHeight(block);
    }
    return y;
  }
  function summaryHeight(summary: ReportSummary, first: boolean) {
    const badge = lines(summary.status || "Není v nabídce", 9, innerWidth - 25, "bold").length * 12.6 + 10;
    return 44 + badge + (first && summary.title !== "Není v nabídce" ? 10 + lines(summary.title, 11, innerWidth, "bold").length * 15.4 : 0) + 14;
  }
  function drawSummary(summary: ReportSummary, column: number, x: number, y: number, first: boolean) {
    const accent = column ? BLUE : PURPLE;
    text(column ? "OneGuard" : "NEON Life", x + 14, y + 11, 15, "bold", accent);
    text(column ? "METLIFE" : "ČPP", x + 14, y + 31, 7, "bold", MUTED);
    rightText(column ? "09/2024" : "04/2026", x + colWidth - 14, y + 31, 7, "normal", MUTED);
    const tone = TONES[summary.tone] ?? TONES.neutral;
    const wrapped = lines(summary.status || "Není v nabídce", 9, innerWidth - 25, "bold");
    font(9, "bold");
    const badgeWidth = Math.min(innerWidth, Math.max(...wrapped.map(line => pdf.getTextWidth(line))) + 25);
    panel(x + 14, y + 44, badgeWidth, wrapped.length * 12.6 + 10, tone.fill, undefined, 3);
    const cx = x + 22, cy = y + 54;
    pdf.setDrawColor(tone.ink); pdf.setLineWidth(1);
    if (summary.tone === "positive") { pdf.line(cx - 2, cy, cx, cy + 2); pdf.line(cx, cy + 2, cx + 4, cy - 3); }
    else {
      pdf.circle(cx + 1, cy, 3.5, "S");
      if (summary.tone === "info") {
        pdf.line(cx + 1, cy, cx + 1, cy + 2); pdf.setFillColor(tone.ink); pdf.circle(cx + 1, cy - 1.5, 0.45, "F");
      } else pdf.line(cx - 1, cy, cx + 3, cy);
    }
    wrapped.forEach((line, index) => text(line, x + 32, y + 49 + index * 12.6, 9, "bold", tone.ink));
    // The shared summary uses this fallback when the web card has nested
    // headings. The real availability is already in its badge and detail body.
    if (first && summary.title !== "Není v nabídce") paragraph(summary.title, x + 14, y + 44 + wrapped.length * 12.6 + 20, innerWidth, 11, "bold");
  }

  // Personal notes remain separate from the product information. Allocate all
  // introductory pages before the contents to keep every destination accurate.
  letterhead();
  let personalPage: number | undefined;
  font(10);
  const needsPersonalPage = personalization.clientNeeds || personalization.advisorComment
    || (personalization.clientName && pdf.getTextWidth(`Pro klienta: ${personalization.clientName}`) > width - (meetingDate ? 153 : 0));
  if (needsPersonalPage) {
    function personalHeader(continuation = false) {
      newPage();
      text(continuation ? "SROVNÁNÍ NA MÍRU · POKRAČOVÁNÍ" : "SROVNÁNÍ NA MÍRU", MARGIN, TOP, 8.5, "bold", BLUE);
      let cy = paragraph(personalization.clientName || "Zadání a komentář", MARGIN, TOP + 23, width, 24, "bold") + 12;
      if (meetingDate) { text(`Datum schůzky: ${meetingDate}`, MARGIN, cy, 10, "normal", MUTED); cy += 25; }
      rule(MARGIN, cy, width); return cy + 20;
    }
    let cy = personalHeader(); personalPage = pdf.getNumberOfPages();
    const sections = [
      { title: "Co klient potřebuje řešit", content: personalization.clientNeeds, color: BLUE },
      { title: "Komentář poradce", content: personalization.advisorComment, color: PURPLE },
    ].filter(section => section.content);
    for (const section of sections) {
      const blocks = section.content.split(/\n{2,}/).map(value => ({ kind: "body" as const, text: value }));
      const queue = layout(blocks, width - 26);
      let continued = false;
      while (queue.length) {
        if (cy + 100 > BOTTOM) cy = personalHeader(true);
        const picked = take(queue, BOTTOM - cy - 42);
        const height = measure(picked) + 42;
        panel(MARGIN, cy, width, height, section.color === PURPLE ? "#f7f3fa" : "#f2f6fa", undefined, 7);
        text(`${section.title}${continued ? " · pokračování" : ""}`, MARGIN + 13, cy + 12, 10, "bold", section.color);
        drawBlocks(picked, MARGIN + 13, cy + 30, width - 26); cy += height + 18;
        if (queue.length) { cy = personalHeader(true); continued = true; }
      }
    }
    if (!sections.length) text("Podrobné srovnání vybraných témat najdete na následujících stranách.", MARGIN, cy, 10, "normal", MUTED);
  }

  // Reserve contents pages before laying out themes so their links stay correct.
  const contents: Array<{ rowIndex: number; page: number; x: number; y: number; height: number }> = [];
  const contentsWidth = (width - 28) / 2;
  const contentsTextWidth = (row: ComparisonReportRow) => contentsWidth - (pinnedIds.has(row.id) ? 139 : 72);
  if (rows.length > 1) {
    const heights = rows.map(row => Math.max(30, lines(row.title, 10.2, contentsTextWidth(row), pinnedIds.has(row.id) ? "bold" : "normal").length * 14.28 + 14));
    const start = TOP + 76;
    const columnHeight = Math.min(BOTTOM - start, Math.ceil(heights.reduce((sum, h) => sum + h, 0) / 2) + Math.max(...heights));
    let cy = newPage() + 76, column = 0;
    rows.forEach((row, rowIndex) => {
      const height = heights[rowIndex];
      if (cy + height > start + columnHeight && cy > start) {
        if (column === 0) { column = 1; cy = start; }
        else { column = 0; cy = newPage() + 76; }
      }
      contents.push({ rowIndex, page: pdf.getNumberOfPages(), x: MARGIN + column * (contentsWidth + 28), y: cy, height }); cy += height;
    });
  }

  let y = newPage();
  for (const [index, row] of rows.entries()) {
    const contextualLinks = row.appendix.every(block => block.href && block.kind === "body") ? row.appendix : [];
    const sourceNotes: ReportBlock[] = [];
    const productBlocks = [row.neon, row.metlife].map((product, column) => {
      const blocks = [...product.blocks];
      const sources: ReportBlock[] = [];
      // Keep short source references together in the context column instead
      // of producing a continuation sheet containing only a source link.
      while (blocks.at(-1)?.href && blocks.at(-1)!.text.length < 90) sources.unshift(blocks.pop()!);
      if (sources.length) sourceNotes.push({ kind: "heading", text: `Zdroje · ${column ? "OneGuard" : "NEON Life"}` }, ...sources);
      return blocks;
    });
    const intro = layout(row.topic.slice(0, 1), topicWidth - 24);
    const context = layout([...row.topic.slice(1), ...contextualLinks, ...sourceNotes], topicWidth - 24);
    const queues = productBlocks.map(blocks => layout(blocks, innerWidth));
    const summaries = [row.neon.summary, row.metlife.summary];
    const head = Math.max(...summaries.map(value => summaryHeight(value, true)));
    const totalSize = titleHeight(row) + Math.max(measure(intro) + measure(context) + 55, head + Math.max(...queues.map(measure))) + 14;
    if (y > TOP && y + totalSize > BOTTOM) y = newPage();
    destinations.push({ pageNumber: pdf.getNumberOfPages(), top: y });
    y = topicTitle(row, index, y);
    let first = true;
    do {
      const header = Math.max(...summaries.map(value => summaryHeight(value, first)));
      if (y + header + 65 > BOTTOM) y = topicTitle(row, index, newPage(), true);
      const picked = queues.map(queue => take(queue, BOTTOM - y - header - 14));
      const pickedIntro = take(intro, BOTTOM - y - 42);
      const pickedContext = intro.length ? [] : take(context, BOTTOM - y - measure(pickedIntro) - 56);
      const contextHeight = pickedContext.length ? measure(pickedContext) + 18 : 0;
      const height = Math.max(header + Math.max(...picked.map(measure)) + 14, 32 + measure(pickedIntro) + contextHeight);
      panel(MARGIN, y, topicWidth, height, "#fafafd", LINE, 7);
      text("SOUVISLOSTI A ROZDÍLY", MARGIN + 12, y + 13, 7.5, "bold", "#81758f");
      const contextY = drawBlocks(pickedIntro, MARGIN + 12, y + 33, topicWidth - 24);
      if (pickedContext.length) {
        panel(MARGIN + 6, contextY, topicWidth - 12, contextHeight, "#f0f2f7", undefined, 5);
        drawBlocks(pickedContext, MARGIN + 12, contextY + 9, topicWidth - 24);
      } else if (!first && !pickedIntro.length) {
        paragraph("Souvislosti najdete na předchozí straně.", MARGIN + 12, contextY, topicWidth - 24, 9, "normal", MUTED);
      }
      picked.forEach((blocks, column) => {
        const x = MARGIN + topicWidth + COLUMN_GAP + column * (colWidth + COLUMN_GAP);
        panel(x, y, colWidth, height, "#ffffff", LINE, 7);
        pdf.setFillColor(column ? BLUE : PURPLE); pdf.rect(x + 14, y, 32, 2, "F");
        drawSummary(summaries[column], column, x, y, first);
        if (!first && !blocks.length) text("Podrobnosti na předchozí straně.", x + 14, y + header, 9, "normal", MUTED);
        else drawBlocks(blocks, x + 14, y + header, innerWidth);
      });
      y += height; first = false;
      if (intro.length || context.length || queues.some(queue => queue.length)) y = topicTitle(row, index, newPage(), true);
    } while (intro.length || context.length || queues.some(queue => queue.length));

    if (row.appendix.length && !contextualLinks.length) {
      const queue = layout(row.appendix, width - 26);
      y += 14;
      if (measure(queue) + 24 > BOTTOM - y && measure(queue) + 24 < BOTTOM - TOP - titleHeight(row) - 16) y = topicTitle(row, index, newPage(), true);
      while (queue.length) {
        if (y + 95 > BOTTOM) y = topicTitle(row, index, newPage(), true);
        const picked = take(queue, BOTTOM - y - 24);
        panel(MARGIN, y, width, measure(picked) + 20, "#f4f7fa", undefined, 7);
        drawBlocks(picked, MARGIN + 13, y + 12, width - 26); y += measure(picked) + 20;
        if (queue.length) y = topicTitle(row, index, newPage(), true);
      }
    }
    y += 28;
  }

  // Keep the page's product identities, wording and soft violet/blue surfaces.
  pdf.setPage(1);
  text("ŽIVOTNÍ POJIŠTĚNÍ POD LUPOU", MARGIN, 105, 8.5, "bold", "#8a78a3");
  text("NEON Life", MARGIN, 132, 34, "bold", NAVY);
  font(34, "bold");
  const versusX = MARGIN + pdf.getTextWidth("NEON Life") + 13;
  text("vs.", versusX, 137, 27, "normal", "#b4a7c6");
  font(27);
  text("OneGuard", versusX + pdf.getTextWidth("vs.") + 13, 132, 34, "bold", NAVY);
  text("Rozdíly v krytí, podmínkách a plnění. Přehledně vedle sebe.", MARGIN, 180, 11, "normal", MUTED);
  const topicCount = `${rows.length} ${rows.length === 1 ? "srovnávané téma" : rows.length < 5 ? "srovnávaná témata" : "srovnávaných témat"}`;
  text(topicCount, MARGIN, 207, 9, "bold", MUTED);
  text("2 pojistné produkty", MARGIN + 168, 207, 9, "normal", MUTED);

  // The same paired shields as the web hero, drawn as crisp PDF vectors.
  const artX = right - 115, artY = 108;
  panel(artX + 48, artY, 60, 76, "#edf5fb", "#d5e4ef", 18);
  panel(artX, artY + 20, 60, 76, "#f1ecf8", "#e0d6ec", 18);
  pdf.setDrawColor("#91b6d0"); pdf.setLineWidth(1.8);
  pdf.lines([[13, -5], [13, 5], [-2, 21], [-11, 9], [-11, -9], [-2, -21]], artX + 65, artY + 21, [1, 1], "S", true);
  pdf.line(artX + 72, artY + 36, artX + 77, artY + 41); pdf.line(artX + 77, artY + 41, artX + 86, artY + 30);
  pdf.setDrawColor("#ae95c3");
  pdf.lines([[9, -5], [9, 5], [9, -5], [9, 5], [0, 9], [-18, 18], [-18, -18], [0, -9]], artX + 12, artY + 42, [1, 1], "S", true);
  pdf.lines([[7, 0], [4, -7], [6, 15], [4, -8], [6, 0]], artX + 17, artY + 56, [1, 1], "S", false);

  const coverColWidth = (width - 18) / 2;
  for (let column = 0; column < 2; column++) {
    const x = MARGIN + column * (coverColWidth + 18);
    panel(x, 244, coverColWidth, 87, column ? "#f3f8fc" : "#f8f5fb", column ? "#dde8f1" : "#e7e0f0", 10);
    panel(x + 14, 263, 70, 46, "#ffffff", LINE, 7);
    fittedImage(column ? metlifeLogo : cppLogo, "PNG", x + 21, 269, 56, 34, column ? "metlife-logo" : "cpp-logo");
    text(column ? "MetLife" : "Česká podnikatelská pojišťovna", x + 99, 258, 8.5, "normal", MUTED);
    text(column ? "OneGuard" : "NEON Life", x + 99, 276, 20, "bold", NAVY);
    text(`Pojistné podmínky ${column ? "09/2024" : "04/2026"}`, x + 99, 305, 8.5, "normal", MUTED);
  }
  panel(MARGIN + width / 2 - 12, 275, 24, 24, "#ffffff", LINE, 12);
  text("vs.", MARGIN + width / 2 - 6, 282, 9, "normal", MUTED);

  text(singleLine(options.scopeLabel, width - 170, 9), MARGIN, 349, 9, "normal", MUTED);
  if (personalization.clientName) text(singleLine(`Pro klienta: ${personalization.clientName}`, width - (meetingDate ? 175 : 0), 10), MARGIN, 371, 10, "bold", PURPLE);
  if (meetingDate) rightText(`Schůzka: ${meetingDate}`, right, 372, 9, "normal", MUTED);

  const advisor = options.advisor;
  const contactWidth = width - (qr ? 145 : 40);
  const contactRows = [advisor.phone, advisor.email, advisor.ico ? `IČO: ${advisor.ico}` : ""].filter(Boolean);
  const nameHeight = lines(advisor.fullName || advisor.email, 17, contactWidth, "bold").length * 23.8;
  const roleHeight = lines(advisor.title, 9, contactWidth).length * 12.6;
  const contactsHeight = contactRows.reduce((sum, value) => sum + lines(value, 9, contactWidth).length * 12.6 + 3, 0);
  const cardHeight = Math.max(132, 48 + nameHeight + roleHeight + contactsHeight);
  let cardY = 390;
  // Preserve full contact details on a separate page for unusually long profiles.
  if (cardY + cardHeight > BOTTOM - 22) { newPage(); cardY = TOP + 26; text("VÁŠ PORADCE", MARGIN, TOP, 9, "bold", PURPLE); }
  panel(MARGIN, cardY, width, cardHeight, "#f8f7fb", "#e7e0ed", 8);
  text("PŘIPRAVIL PRO VÁS", MARGIN + 16, cardY + 12, 7, "bold", PURPLE);
  let cy = paragraph(advisor.fullName || advisor.email, MARGIN + 16, cardY + 29, contactWidth, 17, "bold", NAVY);
  cy = paragraph(advisor.title, MARGIN + 16, cy + 3, contactWidth, 9, "normal", MUTED) + 7;
  for (const value of contactRows) {
    const end = paragraph(value, MARGIN + 16, cy, contactWidth, 9, "normal", value.startsWith("IČO:") ? MUTED : INK);
    const href = value === advisor.email ? `mailto:${advisor.email}` : value === advisor.phone ? `tel:${advisor.phone.replace(/[^+\d]/g, "")}` : undefined;
    if (href) pdf.link(MARGIN + 16, cy, contactWidth, end - cy, { url: href });
    cy = end + 3;
  }
  if (qr) {
    panel(right - 111, cardY + 13, 80, 80, "#ffffff", undefined, 5);
    pdf.addImage(qr, "PNG", right - 104, cardY + 20, 66, 66);
    text("Moje online vizitka", right - 112, cardY + 101, 8.5, "normal", PURPLE);
    pdf.link(right - 116, cardY + 13, 90, 102, { url: advisor.cardUrl });
  }
  if (pdf.getCurrentPageInfo().pageNumber !== 1) {
    const advisorPage = pdf.getCurrentPageInfo().pageNumber;
    pdf.setPage(1); panel(MARGIN, 390, width, 132, "#f8f7fb", "#e7e0ed", 8);
    text("PŘIPRAVIL PRO VÁS", MARGIN + 16, 405, 7, "bold", PURPLE);
    paragraph(advisor.fullName || advisor.email, MARGIN + 16, 428, width - 32, 12);
    text(`Kompletní vizitka a kontakty na straně ${advisorPage} →`, MARGIN + 16, 500, 10, "bold", PURPLE);
    pdf.link(MARGIN, 390, width, 132, { pageNumber: advisorPage });
  }
  const target = personalPage ? { pageNumber: personalPage, top: TOP } : contents.length ? { pageNumber: contents[0].page, top: TOP } : destinations[0];
  const navigationTitle = personalPage ? "Otevřít srovnání pro klienta" : rows.length > 1 ? "Prohlédnout obsah srovnání" : rows[0].title;
  text(singleLine(navigationTitle, width - 45, 9), MARGIN, BOTTOM - 7, 9, "bold", PURPLE);
  rightText("→", right, BOTTOM - 11, 16, "normal", PURPLE);
  pdf.link(MARGIN, BOTTOM - 11, width, 19, target);

  let contentsPage = 0;
  for (const entry of contents) {
    pdf.setPage(entry.page);
    if (contentsPage !== entry.page) {
      contentsPage = entry.page;
      text("PRŮVODCE DOKUMENTEM", MARGIN, TOP, 8.5, "bold", BLUE);
      text("Obsah srovnání", MARGIN, TOP + 19, 25, "bold");
      text(pinnedIds.size ? "Připnutá témata jsou první. Kliknutím otevřete podrobnosti." : "Vyberte téma a přejděte rovnou k podrobnostem.", MARGIN, TOP + 51, 9.5, "normal", MUTED);
    }
    const { rowIndex: index, height, x, y: rowY } = entry;
    const contentsRight = x + contentsWidth;
    const important = pinnedIds.has(rows[index].id);
    if (important) panel(x, rowY, contentsWidth, height, "#f4eef9", undefined, 4);
    else rule(x, rowY + height, contentsWidth);
    text(String(index + 1).padStart(2, "0"), x + 8, rowY + 8, 9, "bold", PURPLE);
    paragraph(rows[index].title, x + 33, rowY + 7, contentsTextWidth(rows[index]), 10.2, important ? "bold" : "normal");
    if (important) text("PŘIPNUTO", contentsRight - 89, rowY + 10, 7, "bold", PURPLE);
    rightText(String(destinations[index].pageNumber).padStart(2, "0"), contentsRight - 8, rowY + 8, 10, "bold", BLUE);
    pdf.link(x, rowY, contentsWidth, height, destinations[index]);
  }

  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page); rule(MARGIN, pageHeight - 37, width);
    const footer = [advisor.fullName || advisor.email, advisor.phone].filter(Boolean).join(" · ");
    text(singleLine(footer, width - 90, 8), MARGIN, pageHeight - 27, 8, "normal", MUTED);
    rightText(`${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, right, pageHeight - 27, 8, "bold", BLUE);
    if (contents.length && page > 1 && page !== contents[0].page) pdf.link(right - 65, pageHeight - 30, 65, 22, { pageNumber: contents[0].page, top: TOP });
  }
  return pdf;
}

export async function downloadComparisonPdf(options: ComparisonPdfOptions) {
  const pdf = await createComparisonPdf(options);
  const date = (options.generatedAt ?? new Date()).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  await pdf.save(`neon-life-vs-metlife-oneguard-${date}.pdf`, { returnPromise: true });
}
