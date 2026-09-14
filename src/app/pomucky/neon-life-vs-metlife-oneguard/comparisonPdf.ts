import type { jsPDF } from "jspdf";
import { formatComparisonMeetingDate, normalizeComparisonPersonalization, prioritizeComparisonRows, type ComparisonPersonalization } from "./comparisonPersonalization";
import type { ComparisonReportRow, ReportAdvisor, ReportBlock, ReportSummary } from "./comparisonReportContent";

const FONT = "LiberationSans";
const INK = "#23364b";
const MUTED = "#52657a";
const NAVY = "#192e46";
const BLUE = "#276b94";
const PURPLE = "#694c87";
const LINE = "#dce4ed";
const MARGIN = 36;
const TOP = 100;
const BOTTOM = 777;
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
  const pdf = new Pdf({ unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  for (const [style, bytes] of [["normal", regular], ["bold", bold]] as const) {
    pdf.addFileToVFS(`${FONT}-${style}.ttf`, base64(bytes));
    pdf.addFont(`${FONT}-${style}.ttf`, FONT, style);
  }
  pdf.setProperties({ title: "NEON Life vs. MetLife OneGuard – podrobné srovnání", author: options.advisor.fullName || options.advisor.email, creator: "Bohemika a.s.", subject: options.scopeLabel });
  const width = pdf.internal.pageSize.getWidth() - MARGIN * 2;
  const right = MARGIN + width;
  const colWidth = (width - 16) / 2;
  const innerWidth = colWidth - 26;
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
  function letterhead() {
    pdf.addImage(logo, "JPEG", MARGIN, 24, 72, 46, "bohemika-logo");
    rightText("Bohemika a.s.", right, 28, 11, "bold");
    rightText("Finanční poradenství", right, 44, 9, "normal", MUTED);
    rightText(`Srovnání životního pojištění  /  ${date}`, right, 62, 8.5, "normal", MUTED);
    rule(MARGIN, 85, width); rule(MARGIN, 85, 42, BLUE);
  }
  function newPage() { pdf.addPage(); letterhead(); return TOP; }
  function titleHeight(row: ComparisonReportRow, continuation = false) {
    return Math.max(32, lines(row.title, 17, width - 56, "bold").length * 23.8) + 13 + (pinnedIds.has(row.id) || continuation ? 16 : 0);
  }
  function topicTitle(row: ComparisonReportRow, index: number, y: number, continuation = false) {
    const bottom = y + titleHeight(row, continuation);
    const label = [pinnedIds.has(row.id) ? "DŮLEŽITÉ PRO KLIENTA" : "", continuation ? "POKRAČOVÁNÍ DETAILU" : ""].filter(Boolean).join(" · ");
    if (label) { text(label, MARGIN + 47, y, 8, "bold", pinnedIds.has(row.id) ? PURPLE : BLUE); y += 16; }
    panel(MARGIN, y, 32, 32, NAVY, undefined, 8);
    text(String(index + 1).padStart(2, "0"), MARGIN + 7, y + 8, 13, "bold", "#ffffff");
    paragraph(row.title, MARGIN + 47, y + 3, width - 56, 17, "bold");
    return bottom;
  }

  type Block = { lines: string[]; size: number; weight: string; color: string; kind: ReportBlock["kind"]; cells?: string[][]; href?: string; gap: number; padding: number };
  function layout(blocks: ReportBlock[], space: number): Block[] {
    return blocks.map(block => {
      const size = block.kind === "heading" ? 10 : 9.6;
      const weight = block.kind === "heading" ? "bold" : "normal";
      const padding = block.kind === "quote" || block.cells ? 7 : 0;
      return { lines: lines(block.text, size, space - padding * 2, weight), size, weight, kind: block.kind,
        color: block.href ? BLUE : block.kind === "quote" ? MUTED : INK,
        cells: block.cells?.map(cell => lines(cell, size, (space - 14) / block.cells!.length - 8, "bold")),
        href: block.href ? safeUrl(block.href, options.origin) : undefined, gap: block.cells ? 3 : 8, padding };
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
      const keepNext = block.kind === "heading" && next ? Math.min(2, next.lines.length) * next.size * 1.4 : 0;
      if (height + keepNext > available) {
        if (picked.length || block.cells) break;
        const count = Math.floor((available - block.padding * 2 - block.gap) / (block.size * 1.4));
        if (count <= 0) break;
        picked.push({ ...block, lines: block.lines.splice(0, count) });
        if (!block.lines.length) queue.shift();
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
        panel(x, y, space, h, "#f2f5f9", undefined, 4);
        pdf.setFillColor("#8da8c0"); pdf.rect(x, y + 5, 2, h - 10, "F");
      } else if (block.cells) panel(x, y, space, h, "#f1f5f9", undefined, 4);
      if (block.cells) {
        const cellWidth = (space - 14) / block.cells.length;
        block.cells.forEach((cell, column) => cell.forEach((line, index) => text(line, x + 7 + column * cellWidth, y + 7 + index * block.size * 1.4, block.size, "bold", column ? BLUE : INK)));
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
    return 37 + badge + (first ? 12 + lines(summary.title, 11, innerWidth, "bold").length * 15.4 : 0) + 13;
  }
  function drawSummary(summary: ReportSummary, column: number, x: number, y: number, first: boolean) {
    const accent = column ? BLUE : PURPLE;
    text(column ? "METLIFE" : "ČPP", x + 13, y + 13, 8, "bold", accent);
    rightText(column ? "OneGuard" : "NEON Life", x + colWidth - 13, y + 11, 11, "bold", accent);
    const tone = TONES[summary.tone] ?? TONES.neutral;
    const wrapped = lines(summary.status || "Není v nabídce", 9, innerWidth - 25, "bold");
    font(9, "bold");
    const badgeWidth = Math.min(innerWidth, Math.max(...wrapped.map(line => pdf.getTextWidth(line))) + 25);
    panel(x + 13, y + 37, badgeWidth, wrapped.length * 12.6 + 10, tone.fill, undefined, 4);
    const cx = x + 21, cy = y + 47;
    pdf.setDrawColor(tone.ink); pdf.setLineWidth(1);
    if (summary.tone === "positive") { pdf.line(cx - 2, cy, cx, cy + 2); pdf.line(cx, cy + 2, cx + 4, cy - 3); }
    else {
      pdf.circle(cx + 1, cy, 3.5, "S");
      if (summary.tone === "info") {
        pdf.line(cx + 1, cy, cx + 1, cy + 2); pdf.setFillColor(tone.ink); pdf.circle(cx + 1, cy - 1.5, 0.45, "F");
      } else pdf.line(cx - 1, cy, cx + 3, cy);
    }
    wrapped.forEach((line, index) => text(line, x + 31, y + 42 + index * 12.6, 9, "bold", tone.ink));
    if (first) paragraph(summary.title, x + 13, y + 37 + wrapped.length * 12.6 + 22, innerWidth, 11, "bold");
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
  const contents: Array<{ rowIndex: number; page: number; y: number; height: number }> = [];
  const contentsTextWidth = (row: ComparisonReportRow) => width - (pinnedIds.has(row.id) ? 160 : 92);
  if (rows.length > 1) {
    let cy = newPage() + 70;
    rows.forEach((row, rowIndex) => {
      const height = Math.max(27, lines(row.title, 10.2, contentsTextWidth(row), pinnedIds.has(row.id) ? "bold" : "normal").length * 14.28 + 12);
      if (cy + height > BOTTOM - 12) cy = newPage() + 70;
      contents.push({ rowIndex, page: pdf.getNumberOfPages(), y: cy, height }); cy += height;
    });
  }

  let y = newPage();
  for (const [index, row] of rows.entries()) {
    const intro = layout(row.topic.slice(0, 1), width);
    const context = layout(row.topic.slice(1), width - 24);
    const queues = [layout(row.neon.blocks, innerWidth), layout(row.metlife.blocks, innerWidth)];
    const summaries = [row.neon.summary, row.metlife.summary];
    const head = Math.max(...summaries.map(value => summaryHeight(value, true)));
    const topicSize = titleHeight(row) + measure(intro) + (context.length ? measure(context) + 22 : 0) + 12;
    const totalSize = topicSize + head + Math.max(...queues.map(measure)) + 14;
    if (y > TOP && y + totalSize > BOTTOM) y = newPage();
    destinations.push({ pageNumber: pdf.getNumberOfPages(), top: y });
    y = topicTitle(row, index, y);
    while (intro.length) {
      const picked = take(intro, BOTTOM - y);
      y = drawBlocks(picked, MARGIN, y, width);
      if (intro.length) y = topicTitle(row, index, newPage(), true);
    }
    while (context.length) {
      if (y + 90 > BOTTOM) y = topicTitle(row, index, newPage(), true);
      const picked = take(context, BOTTOM - y - 18);
      const h = measure(picked) + 16;
      panel(MARGIN, y, width, h, "#f2f6fa", undefined, 6);
      drawBlocks(picked, MARGIN + 12, y + 10, width - 24); y += h + 8;
      if (context.length) y = topicTitle(row, index, newPage(), true);
    }
    y += 10;
    let first = true;
    do {
      const header = Math.max(...summaries.map(value => summaryHeight(value, first)));
      if (y + header + 65 > BOTTOM) y = topicTitle(row, index, newPage(), true);
      const picked = queues.map(queue => take(queue, BOTTOM - y - header - 14));
      const height = header + Math.max(...picked.map(measure)) + 14;
      picked.forEach((blocks, column) => {
        const x = MARGIN + column * (colWidth + 16);
        panel(x, y, colWidth, !first && !blocks.length ? header + 31 : height, "#ffffff", LINE, 8);
        rule(x + 13, y + 30, innerWidth, column ? "#c8dfeE" : "#ded2e9");
        drawSummary(summaries[column], column, x, y, first);
        if (!first && !blocks.length) text("Podrobnosti na předchozí straně.", x + 13, y + header, 9, "normal", MUTED);
        else drawBlocks(blocks, x + 13, y + header, innerWidth);
      });
      y += height; first = false;
      if (queues.some(queue => queue.length)) y = topicTitle(row, index, newPage(), true);
    } while (queues.some(queue => queue.length));

    if (row.appendix.length) {
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

  // Cover: strong title, paired product identities and a real advisor signature.
  pdf.setPage(1);
  panel(MARGIN, 110, width, 223, NAVY, undefined, 13);
  pdf.setDrawColor("#345370"); pdf.setLineWidth(1);
  pdf.circle(right - 66, 173, 37, "S"); pdf.circle(right - 62, 236, 42, "S");
  pdf.setDrawColor("#72bddc"); pdf.setLineWidth(1.7);
  pdf.lines([[23, 0], [0, 21], [-11.5, 12], [-11.5, -12], [0, -21]], right - 78, 156, [1, 1], "S", true);
  pdf.lines([[21, 0], [0, 19], [-10.5, 11], [-10.5, -11], [0, -19]], right - 73, 222, [1, 1], "S", true);
  text("ŽIVOTNÍ POJIŠTĚNÍ / PODROBNÉ SROVNÁNÍ", MARGIN + 22, 134, 9, "bold", "#b3d5e8");
  text("NEON Life", MARGIN + 22, 167, 38, "bold", "#ffffff");
  text("vs. OneGuard", MARGIN + 22, 214, 34, "bold", "#ffffff");
  rule(MARGIN + 22, 273, width - 44, "#3e5871");
  const topicCount = `${rows.length} ${rows.length === 1 ? "téma" : rows.length < 5 ? "témata" : "témat"}`;
  text(topicCount, MARGIN + 22, 291, 12, "bold", "#ffffff");
  text("Krytí · podmínky · příklady plnění", MARGIN + 111, 293, 10, "normal", "#c7d9e8");
  for (let column = 0; column < 2; column++) {
    const x = MARGIN + column * (colWidth + 16);
    panel(x, 350, colWidth, 76, "#ffffff", LINE, 8);
    if (!column) pdf.addImage(cppLogo, "PNG", x + 12, 369, 57, 35, "cpp-logo");
    else pdf.addImage(metlifeLogo, "PNG", x + 12, 380, 68, 15, "metlife-logo");
    text(column ? "OneGuard" : "NEON Life", x + 90, 367, 14, "bold", column ? BLUE : PURPLE);
    text(`Podmínky ${column ? "09/2024" : "04/2026"}`, x + 90, 392, 9, "normal", MUTED);
  }

  const advisor = options.advisor;
  text("PŘIPRAVIL PRO VÁS", MARGIN, 451, 9, "bold", BLUE);
  const contactWidth = width - (qr ? 151 : 40);
  const contactRows = [advisor.phone, advisor.email, advisor.ico ? `IČO: ${advisor.ico}` : ""].filter(Boolean);
  const nameHeight = lines(advisor.fullName || advisor.email, 21, contactWidth, "bold").length * 29.4;
  const roleHeight = lines(advisor.title, 10, contactWidth).length * 14;
  const contactsHeight = contactRows.reduce((sum, value) => sum + lines(value, 10, contactWidth).length * 14 + 7, 0);
  const cardHeight = Math.max(178, 49 + nameHeight + roleHeight + contactsHeight);
  let cardY = 474;
  // Unusually long profile details get their own page instead of being clipped.
  if (cardY + cardHeight > 670) { newPage(); cardY = TOP + 27; text("VÁŠ PORADCE", MARGIN, TOP, 10, "bold", BLUE); }
  panel(MARGIN, cardY, width, cardHeight, "#f3f6fa", LINE, 10);
  pdf.setFillColor("#70b8d8"); pdf.roundedRect(MARGIN, cardY + 17, 3, cardHeight - 34, 1, 1, "F");
  let cy = paragraph(advisor.fullName || advisor.email, MARGIN + 20, cardY + 22, contactWidth, 21, "bold");
  cy = paragraph(advisor.title, MARGIN + 20, cy + 5, contactWidth, 10, "normal", MUTED) + 15;
  rule(MARGIN + 20, cy, contactWidth); cy += 13;
  for (const value of contactRows) {
    const end = paragraph(value, MARGIN + 20, cy, contactWidth, 10, "normal", value.startsWith("IČO:") ? MUTED : INK);
    const href = value === advisor.email ? `mailto:${advisor.email}` : value === advisor.phone ? `tel:${advisor.phone.replace(/[^+\d]/g, "")}` : undefined;
    if (href) pdf.link(MARGIN + 20, cy, contactWidth, end - cy, { url: href });
    cy = end + 7;
  }
  if (qr) {
    panel(right - 115, cardY + 22, 94, 94, "#ffffff", undefined, 7);
    pdf.addImage(qr, "PNG", right - 107, cardY + 30, 78, 78);
    text("Zůstaňme v kontaktu", right - 116, cardY + 128, 8.5, "bold", BLUE);
    text("Moje online vizitka", right - 109, cardY + 144, 8.5, "normal", MUTED);
    pdf.link(right - 119, cardY + 22, 104, 137, { url: advisor.cardUrl });
  }
  if (pdf.getCurrentPageInfo().pageNumber !== 1) {
    const advisorPage = pdf.getCurrentPageInfo().pageNumber;
    pdf.setPage(1); panel(MARGIN, 474, width, 178, "#f3f6fa", LINE, 10);
    text("Váš poradce", MARGIN + 20, 496, 18, "bold");
    paragraph(advisor.fullName || advisor.email, MARGIN + 20, 529, width - 40, 12);
    text(`Kompletní vizitka a kontakty na straně ${advisorPage} →`, MARGIN + 20, 616, 10, "bold", BLUE);
    pdf.link(MARGIN, 474, width, 178, { pageNumber: advisorPage });
  }
  if (personalization.clientName || meetingDate) {
    const nameWidth = meetingDate ? width - 153 : width;
    if (personalization.clientName) text(singleLine(`Pro klienta: ${personalization.clientName}`, nameWidth, 10), MARGIN, 680, 10, "normal", BLUE);
    if (meetingDate) rightText(`Schůzka: ${meetingDate}`, right, 681, 9, "normal", MUTED);
    paragraph(options.scopeLabel, MARGIN, 703, width, 8.5, "normal", MUTED);
  } else paragraph(options.scopeLabel, MARGIN, 685, width, 9, "normal", MUTED);
  const target = personalPage ? { pageNumber: personalPage, top: TOP } : contents.length ? { pageNumber: contents[0].page, top: TOP } : destinations[0];
  panel(MARGIN, 725, width, 39, "#eaf2f8", undefined, 6);
  text(personalPage ? "Otevřít srovnání pro klienta" : rows.length > 1 ? "Prohlédnout obsah srovnání" : rows[0].title, MARGIN + 13, 738, 10, "bold", BLUE);
  rightText("→", right - 14, 732, 18, "normal", BLUE);
  pdf.link(MARGIN, 725, width, 39, target);

  let contentsPage = 0;
  for (const entry of contents) {
    pdf.setPage(entry.page);
    if (contentsPage !== entry.page) {
      contentsPage = entry.page;
      text("PRŮVODCE DOKUMENTEM", MARGIN, TOP, 8.5, "bold", BLUE);
      text("Obsah srovnání", MARGIN, TOP + 19, 25, "bold");
      text(pinnedIds.size ? "Připnutá témata jsou první. Kliknutím otevřete podrobnosti." : "Vyberte téma a přejděte rovnou k podrobnostem.", MARGIN, TOP + 51, 9.5, "normal", MUTED);
    }
    const { rowIndex: index, height, y: rowY } = entry;
    const important = pinnedIds.has(rows[index].id);
    if (important || index % 2 === 0) panel(MARGIN, rowY, width, height, important ? "#f4eef9" : "#f3f6fa", undefined, 4);
    text(String(index + 1).padStart(2, "0"), MARGIN + 10, rowY + 8, 9, "bold", BLUE);
    paragraph(rows[index].title, MARGIN + 41, rowY + 7, contentsTextWidth(rows[index]), 10.2, important ? "bold" : "normal");
    if (important) text("PŘIPNUTO", right - 101, rowY + 10, 7, "bold", PURPLE);
    rightText(String(destinations[index].pageNumber).padStart(2, "0"), right - 12, rowY + 8, 10, "bold", BLUE);
    pdf.link(MARGIN, rowY, width, height, destinations[index]);
  }

  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page); rule(MARGIN, 793, width); rule(MARGIN, 793, width * page / total, "#7caecb");
    const footer = [advisor.fullName || advisor.email, advisor.phone].filter(Boolean).join(" · ");
    text(singleLine(footer, width - 90, 8), MARGIN, 804, 8, "normal", MUTED);
    rightText(`${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, right, 804, 8, "bold", BLUE);
    if (contents.length && page > 1 && page !== contents[0].page) pdf.link(right - 65, 799, 65, 22, { pageNumber: contents[0].page, top: TOP });
  }
  return pdf;
}

export async function downloadComparisonPdf(options: ComparisonPdfOptions) {
  const pdf = await createComparisonPdf(options);
  const date = (options.generatedAt ?? new Date()).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  await pdf.save(`neon-life-vs-metlife-oneguard-${date}.pdf`, { returnPromise: true });
}
