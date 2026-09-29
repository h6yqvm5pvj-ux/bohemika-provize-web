import type { jsPDF } from "jspdf";
import { createQrSymbol, type ContactDetails, type ContactQr } from "../tvorba/contactQr";
import { COMPARISON_ICONS, type IconShape } from "./icons";
import { insurerById } from "./insurers";
import { clientName, comparisonCellText, emptyCell, formatDate, insurerName, offerGroups, TONES, type ComparisonDocument, type ComparisonRow, type Offer } from "./model";
import { INSURANCE_TYPES } from "./lifeCoverage";
import { formatPremium } from "./money";

export type PdfOrientation = "portrait" | "landscape";
type Options = { doc: ComparisonDocument; advisor: ContactDetails; contact: ContactQr; orientation?: PdfOrientation; onProgress?: (message: string) => void };
const FONT = "LiberationSans", INK = "#17243b", MUTED = "#526077", ACCENT = "#1d4ed8", BORDER = "#cbd5e1";
const MARGIN = 28, PAD = 9, LINE = 11.5, TEXT_SIZE = 8.5;
type Line = { text: string; bold?: boolean; color?: string; size?: number };
const CONTACT_ICONS: Record<string, IconShape[]> = {
  phone: [{ points: [[6, 3], [3, 5], [4, 11], [8, 17], [14, 21], [19, 21], [21, 18], [17, 14], [14, 16], [8, 10], [10, 7], [7, 3]], closed: true }],
  mail: [{ points: [[3, 5], [21, 5], [21, 19], [3, 19]], closed: true }, { points: [[3, 6], [12, 13], [21, 6]] }],
  pin: [{ points: [[12, 22], [5, 13], [4, 8], [6, 4], [12, 2], [18, 4], [20, 8], [19, 13]], closed: true }, { circle: [12, 9, 3] }],
};

async function asset(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Nepodařilo se načíst logo nebo písmo pro PDF. Zkontroluj připojení a zkus export znovu.");
  return new Uint8Array(await response.arrayBuffer());
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function safeCardLink(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

/** Render icons as PDF paths, not font glyphs, so they survive printing and copying. */
function drawIcon(pdf: jsPDF, id: string, x: number, y: number, size: number, color: string) {
  const shapes = COMPARISON_ICONS.find(icon => icon.id === id)?.shapes ?? CONTACT_ICONS[id] ?? [];
  pdf.setDrawColor(color); pdf.setLineWidth(size / 15); pdf.setLineCap("round"); pdf.setLineJoin("round");
  const scale = size / 24;
  for (const shape of shapes) {
    if ("circle" in shape) { pdf.circle(x + shape.circle[0] * scale, y + shape.circle[1] * scale, shape.circle[2] * scale, "S"); continue; }
    const [first, ...rest] = shape.points;
    const relative = rest.map((point, index) => [point[0] - shape.points[index][0], point[1] - shape.points[index][1]]);
    pdf.lines(relative, x + first[0] * scale, y + first[1] * scale, [scale, scale], "S", !!shape.closed);
  }
}

export async function createComparisonPdf({ doc, advisor, contact, orientation = doc.offers.length === 2 ? "portrait" : "landscape", onProgress = () => {} }: Options): Promise<Blob> {
  if (doc.offers.length < 2) throw new Error("Srovnání musí obsahovat současnou smlouvu a alespoň jednu nabídku.");
  const logoPaths = [...new Set(doc.offers.flatMap(offer => { const insurer = insurerById(offer.insurerId); return insurer ? [insurer.logo] : []; }))];
  const [{ jsPDF: Pdf }, regular, bold, companyLogo, qr, loadedLogos] = await Promise.all([
    import("jspdf"), asset("/fonts/LiberationSans-Regular.ttf"), asset("/fonts/LiberationSans-Bold.ttf"), asset("/icons/nadpislogo.jpg"),
    createQrSymbol(contact.payload), Promise.all(logoPaths.map(async path => [path, await asset(path)] as const)),
  ]);
  const portrait = orientation === "portrait";
  const pdf = new Pdf({ orientation, unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  for (const [style, data] of [["normal", regular], ["bold", bold]] as const) {
    pdf.addFileToVFS(`${FONT}-${style}.ttf`, base64(data)); pdf.addFont(`${FONT}-${style}.ttf`, FONT, style);
  }
  pdf.setProperties({ title: doc.title || "Srovnání pojištění", subject: clientName(doc), author: advisor.fullName || advisor.email, creator: "Bohemika · Srovnání nabídek" });
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight(), contentWidth = width - MARGIN * 2;
  const logoProperties = pdf.getImageProperties(companyLogo);
  const logos = new Map(loadedLogos.map(([path, bytes]) => [path, { bytes, ...pdf.getImageProperties(bytes) }]));
  const groups = offerGroups(doc.offers, portrait ? 1 : 3);
  const link = safeCardLink(contact.href);

  function font(size = TEXT_SIZE, bold = false, color = INK) {
    pdf.setFont(FONT, bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
  }
  function text(value: string, x: number, y: number, size = TEXT_SIZE, bold = false, color = INK) {
    font(size, bold, color); pdf.text(value, x, y, { baseline: "top" });
  }
  function wrap(value: string, space: number, bold = false, color = INK, size = TEXT_SIZE): Line[] {
    font(size, bold);
    return (pdf.splitTextToSize(value || "", space) as string[]).map(text => ({ text, bold, color, size }));
  }
  function lines(items: Line[], x: number, y: number, spacing = LINE) {
    items.forEach((line, index) => text(line.text, x, y + index * spacing, line.size, line.bold, line.color));
  }
  function rule(y: number) { pdf.setDrawColor(BORDER); pdf.setLineWidth(.5); pdf.line(MARGIN, y, width - MARGIN, y); }
  function box(x: number, y: number, w: number, h: number, fill = "#ffffff") {
    pdf.setFillColor(fill); pdf.setDrawColor(BORDER); pdf.setLineWidth(.5); pdf.rect(x, y, w, h, "FD");
  }

  // Keep dense vCards large enough to scan, including their quiet zone.
  const qrSize = Math.max(68, qr.size * .85);
  const qrPanelWidth = Math.max(112, qrSize + 30);
  const identityWidth = portrait ? 210 : 310, identityInset = portrait ? 58 : 68;
  const identityTextWidth = identityWidth - identityInset - 19;
  const advisorName = wrap(advisor.fullName || advisor.email, identityTextWidth, true, "#ffffff", 15);
  const advisorRole = advisor.jobTitle ? wrap(advisor.jobTitle, identityTextWidth, false, "#d5e4f5", 8.5) : [];
  const advisorCompany = advisor.companyId ? wrap(`IČO: ${advisor.companyId}`, identityTextWidth, false, "#b6c9e0", 7.5) : [];
  const identityHeight = 30 + advisorName.length * 18 + (advisorRole.length ? 4 + advisorRole.length * LINE : 0) + (advisorCompany.length ? 8 + advisorCompany.length * LINE : 0) + 15;
  const nameParts = advisor.fullName.trim().split(/\s+/).filter(part => part && !/^(?:bc|bca|ing|mgr|mga|mudr|judr|phdr|rndr|mvdr|paeddr|pharmdr|thdr|ph\.?d|csc|dis|doc|prof|mba|msc)\.?[,]?$/i.test(part));
  const initials = nameParts.filter((_, i) => i === 0 || i === nameParts.length - 1).map(part => Array.from(part)[0]).join("").toLocaleUpperCase("cs");
  const contacts = ([{ icon: "phone", value: advisor.phone }, { icon: "mail", value: advisor.email }, { icon: "pin", value: advisor.officeAddress }])
    .filter(item => item.value.trim()).map(item => {
      const items = wrap(item.value, contentWidth - identityWidth - qrPanelWidth - 67, item.icon === "phone", INK, 9);
      return { ...item, items, height: Math.max(22, items.length * LINE + 4) };
    });
  const contactsHeight = contacts.reduce((sum, item) => sum + item.height, 0) + Math.max(0, contacts.length - 1) * 5;
  const footerHeight = Math.max(106, qrSize + 36, identityHeight, contactsHeight + 28);
  if (footerHeight > height * .35) throw new Error("Kontaktní vizitka je příliš dlouhá. Zkrať prosím údaje poradce.");
  const footerY = height - MARGIN - footerHeight;
  const bottom = footerY - 14;
  const titleX = MARGIN + 99, clientPanelWidth = portrait ? 160 : 215, clientPanelX = width - MARGIN - clientPanelWidth;
  const headerTitle = wrap(doc.title || "Srovnání pojištění", clientPanelX - titleX - 24, true, INK, 21);
  const insuranceLabel = INSURANCE_TYPES.find(type => type.id === doc.insuranceType)?.label;
  const headerType = insuranceLabel ? wrap(insuranceLabel, clientPanelX - titleX - 24, false, MUTED, 8.5) : [];
  const headerClient = wrap(clientName(doc) || "Klient", clientPanelWidth - 30, true, INK, 12);
  const clientPanelHeight = 53 + headerClient.length * 15;
  const headerBottom = Math.max(100, 43 + headerTitle.length * 24 + headerType.length * LINE + 12, 22 + clientPanelHeight + 12);
  let pageCount = 0, y = 0, tableStart = 0;
  let currentGroup: Offer[] = groups[0];
  let groupIndex = 0;
  const criterionWidth = portrait ? 138 : 168;
  let columnWidths: number[] = [];

  function footer() {
    pdf.setFillColor("#e7edf5"); pdf.roundedRect(MARGIN, footerY + 2, contentWidth, footerHeight, 9, 9, "F");
    pdf.setFillColor("#f3f6fb"); pdf.roundedRect(MARGIN, footerY, contentWidth, footerHeight, 9, 9, "F");
    pdf.setFillColor(INK); pdf.roundedRect(MARGIN, footerY, identityWidth, footerHeight, 9, 9, "F");
    pdf.rect(MARGIN + identityWidth - 10, footerY, 10, footerHeight, "F");
    pdf.setFillColor("#68bce5"); pdf.roundedRect(MARGIN + 17, footerY + 15, 22, 2, 1, 1, "F");
    const avatarX = MARGIN + (portrait ? 29 : 34), avatarRadius = portrait ? 15 : 18;
    pdf.setFillColor("#2b4261"); pdf.circle(avatarX, footerY + 46, avatarRadius, "F");
    if (initials) {
      font(11, true, "#ffffff"); pdf.text(initials, avatarX, footerY + 46, { align: "center", baseline: "middle" });
    } else drawIcon(pdf, "briefcase", avatarX - 9, footerY + 37, 18, "#d5e4f5");
    const identityX = MARGIN + identityInset;
    text("VÁŠ PORADCE", identityX, footerY + 15, 6.5, true, "#8ed0ef");
    lines(advisorName, identityX, footerY + 30, 18);
    const roleY = footerY + 30 + advisorName.length * 18 + (advisorRole.length ? 4 : 0);
    lines(advisorRole, identityX, roleY);
    lines(advisorCompany, identityX, roleY + advisorRole.length * LINE + 8);
    let contactY = footerY + (footerHeight - contactsHeight) / 2;
    const contactX = MARGIN + identityWidth + 19;
    for (const item of contacts) {
      pdf.setFillColor("#e3edf9"); pdf.circle(contactX + 10, contactY + 11, 10, "F");
      drawIcon(pdf, item.icon, contactX + 4, contactY + 5, 12, ACCENT);
      lines(item.items, contactX + 29, contactY + (item.height - item.items.length * LINE) / 2);
      contactY += item.height + 5;
    }
    const qrPanelX = width - MARGIN - qrPanelWidth;
    pdf.setDrawColor("#dce5f0"); pdf.setLineWidth(.5); pdf.line(qrPanelX, footerY + 16, qrPanelX, footerY + footerHeight - 16);
    const qrX = qrPanelX + (qrPanelWidth - qrSize) / 2, qrY = footerY + (footerHeight - qrSize - 23) / 2;
    pdf.setFillColor("#ffffff"); pdf.roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 5, 5, "F");
    pdf.setFillColor("#ffffff"); pdf.rect(qrX, qrY, qrSize, qrSize, "F");
    pdf.setFillColor("#102d40");
    for (const run of qr.runs) pdf.rect(qrX + run.x / qr.size * qrSize, qrY + run.y / qr.size * qrSize, run.width / qr.size * qrSize, qrSize / qr.size, "F");
    font(7, true, INK); pdf.text(contact.label, qrX + qrSize / 2, qrY + qrSize + 6, { align: "center", baseline: "top" });
    font(6.5, false, MUTED); pdf.text("Naskenujte QR kód", qrX + qrSize / 2, qrY + qrSize + 16, { align: "center", baseline: "top" });
    if (link) pdf.link(qrX, qrY, qrSize, qrSize, { url: link });
  }

  function tableHeader() {
    if (groups.length > 1) {
      text(`Část ${groupIndex + 1} / ${groups.length}`, MARGIN, y, 7, true, ACCENT);
      y += 16;
    }
    const offerWidth = (contentWidth - criterionWidth) / currentGroup.length;
    const ribbonHeight = currentGroup.some(offer => offer.id === doc.recommendedOfferId) ? 21 : 0;
    columnWidths = [criterionWidth, ...currentGroup.map(() => offerWidth)];
    const headings = currentGroup.map(offer => [
      ...wrap(offer.label || "Nabídka", offerWidth - PAD * 2, true, ACCENT),
      ...wrap(insurerName(offer), offerWidth - PAD * 2, true),
      ...(offer.product ? wrap(offer.product, offerWidth - PAD * 2) : []),
      ...(offer.year ? wrap(`Ročník / verze: ${offer.year}`, offerWidth - PAD * 2, false, MUTED) : []),
      ...(offer.premium ? wrap(`Pojistné: ${formatPremium(offer.premium)}`, offerWidth - PAD * 2, true) : []),
    ]);
    const headerHeight = Math.max(90, ...headings.map(items => items.length * LINE + 47)) + ribbonHeight;
    if (y + headerHeight + LINE * 2 + PAD * 2 > bottom) throw new Error("Hlavička smluv je příliš dlouhá. Zkrať názvy produktů, popisky sloupců nebo údaje vizitky.");
    box(MARGIN, y, criterionWidth, headerHeight, "#f3f6fb");
    text("CO POROVNÁVÁME", MARGIN + PAD, y + 15, 8, true, MUTED);
    text("Krytí a podmínky", MARGIN + PAD, y + 35, 13, true);
    text("Částky, limity a souvislosti", MARGIN + PAD, y + 55, 8, false, MUTED);
    let x = MARGIN + criterionWidth;
    currentGroup.forEach((offer, i) => {
      const recommended = offer.id === doc.recommendedOfferId;
      box(x, y, offerWidth, headerHeight, recommended ? "#edf8f2" : i === 0 ? "#f3f6fb" : "#edf4ff");
      pdf.setFillColor(recommended ? "#16634b" : i === 0 ? "#64748b" : "#2563eb"); pdf.rect(x, y, offerWidth, recommended ? ribbonHeight : 2, "F");
      if (recommended) {
        drawIcon(pdf, "check", x + PAD, y + 5, 11, "#ffffff");
        text("DOPORUČENO", x + PAD + 17, y + 6, 8, true, "#ffffff");
      }
      const path = insurerById(offer.insurerId)?.logo;
      const logo = path ? logos.get(path) : undefined;
      if (logo) {
        const scale = Math.min(75 / logo.width, 25 / logo.height);
        pdf.addImage(logo.bytes, logo.fileType, x + PAD, y + ribbonHeight + 10 + (25 - logo.height * scale) / 2, logo.width * scale, logo.height * scale, `insurer:${path}`);
      } else drawIcon(pdf, "shield", x + PAD, y + ribbonHeight + 10, 24, ACCENT);
      lines(headings[i], x + PAD, y + ribbonHeight + 39); x += offerWidth;
    });
    y += headerHeight; tableStart = y;
  }

  function newPage(withTable = true) {
    if (pageCount >= 400) throw new Error("Srovnání přesahuje 400 stran. Rozděl ho prosím do více dokumentů.");
    if (pageCount++) pdf.addPage();
    onProgress(`Připravuji stranu ${pageCount}…`);
    y = MARGIN;
    if (pageCount === 1) {
      const logoHeight = 42, logoWidth = logoProperties.width / logoProperties.height * logoHeight;
      pdf.addImage(companyLogo, "JPEG", MARGIN + 2, 31, logoWidth, logoHeight, "bohemika");
      pdf.setDrawColor(BORDER); pdf.setLineWidth(.5); pdf.line(MARGIN + 82, 31, MARGIN + 82, 75);
      text("OSOBNÍ SROVNÁNÍ", titleX, 27, 7, true, ACCENT);
      lines(headerTitle, titleX, 43, 24);
      lines(headerType, titleX, 47 + headerTitle.length * 24);
      pdf.setFillColor("#f0f5fc"); pdf.roundedRect(clientPanelX, 22, clientPanelWidth, clientPanelHeight, 8, 8, "F");
      text("PŘIPRAVENO PRO", clientPanelX + 15, 33, 6.5, true, MUTED);
      lines(headerClient, clientPanelX + 15, 47, 15);
      const dateY = 53 + headerClient.length * 15;
      text(`Vyhotoveno ${formatDate(doc.date)}`, clientPanelX + 15, dateY, 7.5, false, MUTED);
      rule(headerBottom);
      pdf.setDrawColor("#68bce5"); pdf.setLineWidth(2); pdf.line(MARGIN, headerBottom, MARGIN + 67, headerBottom);
      y = headerBottom + 14;
    }
    if (withTable) tableHeader(); else tableStart = y;
  }

  function wideBlock(title: string, body: string, options: { icon?: string; table?: boolean; fill?: string; keepNext?: boolean } = {}) {
    if (!title.trim() && !body.trim()) return;
    const iconSpace = options.icon && options.icon !== "none" ? 22 : 0;
    const queue = [
      ...(title ? wrap(title, contentWidth - PAD * 2 - iconSpace, true, ACCENT, 10) : []),
      ...(title && body ? [{ text: "" }] : []),
      ...(body ? wrap(body, contentWidth - PAD * 2 - iconSpace) : []),
    ];
    const totalHeight = queue.length * LINE + PAD * 2;
    const keepNext = options.keepNext ? 2 * LINE + PAD * 2 : 0;
    if (y + Math.min(totalHeight + keepNext, bottom - tableStart) > bottom) newPage(options.table !== false);
    while (queue.length) {
      const capacity = Math.floor((bottom - y - PAD * 2) / LINE);
      if (capacity < 1) { newPage(options.table !== false); continue; }
      const picked = queue.splice(0, capacity), h = picked.length * LINE + PAD * 2;
      box(MARGIN, y, contentWidth, h, options.fill || "#ffffff");
      if (iconSpace) drawIcon(pdf, options.icon!, MARGIN + PAD, y + PAD, 14, ACCENT);
      lines(picked, MARGIN + PAD + iconSpace, y + PAD); y += h;
      if (queue.length) newPage(options.table !== false);
    }
  }

  function drawRow(row: ComparisonRow) {
    const rowIconSpace = row.icon === "none" ? 0 : 20;
    const rowLabel = row.label.trim() || "Položka";
    const cellTones = currentGroup.map(offer => TONES.find(tone => tone.id === row.cells[offer.id]?.tone) || TONES[0]);
    const queues = [
      wrap(rowLabel, criterionWidth - PAD * 2 - rowIconSpace, true),
      ...currentGroup.map((offer, i) => wrap(comparisonCellText(row.cells[offer.id] || emptyCell()) || "—", columnWidths[i + 1] - PAD * 2 - (cellTones[i].icon === "none" ? 0 : 19), false, cellTones[i].color)),
    ];
    const totalHeight = Math.max(...queues.map(queue => queue.length)) * LINE + PAD * 2;
    if (y + Math.min(totalHeight, bottom - tableStart) > bottom) newPage();
    let continuation = false;
    while (queues.some(queue => queue.length)) {
      const availableLines = Math.floor((bottom - y - PAD * 2) / LINE);
      if (availableLines < 1) { newPage(); continue; }
      const chunks = queues.map(queue => queue.splice(0, availableLines));
      if (continuation && !chunks[0].length) chunks[0] = [
        ...wrap(rowLabel, criterionWidth - PAD * 2 - rowIconSpace, true).slice(0, 2),
        { text: "(pokračování)", color: MUTED },
      ].slice(0, availableLines);
      const h = Math.max(...chunks.map(chunk => chunk.length)) * LINE + PAD * 2;
      let x = MARGIN;
      chunks.forEach((chunk, i) => {
        const tone = i ? cellTones[i - 1] : null;
        const icon = tone?.icon ?? row.icon;
        box(x, y, columnWidths[i], h, tone?.fill ?? "#f8fafc");
        if (icon !== "none") drawIcon(pdf, icon, x + PAD, y + PAD, 13, tone?.color ?? ACCENT);
        lines(chunk, x + PAD + (icon === "none" ? 0 : i ? 19 : 20), y + PAD);
        x += columnWidths[i];
      });
      y += h;
      if (queues.some(queue => queue.length)) { newPage(); continuation = true; }
    }
  }

  for (const [index, group] of groups.entries()) {
    groupIndex = index; currentGroup = group; newPage();
    if (index === 0 && doc.introduction.trim()) wideBlock("", doc.introduction);
    for (const [rowIndex, row] of doc.rows.entries()) {
      if (row.kind === "section") wideBlock(row.label || "Skupina", "", { icon: row.icon, fill: "#e8f0ff", keepNext: true });
      else drawRow(row);
      if (rowIndex > 0 && rowIndex % 40 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (group.some(offer => offer.note.trim())) {
      drawRow({ id: "notes", kind: "item", label: "Doplňující informace", icon: "info", cells: Object.fromEntries(group.map(offer => [offer.id, { text: offer.note, tone: "neutral" }])) });
    }
  }
  if (doc.notes.trim()) { y += 12; wideBlock(doc.notesTitle || "Poznámky", doc.notes, { icon: "info", table: false, fill: "#f3f6fb" }); }
  // Notes can add pages, so draw the contact card only after all content is laid out.
  footer();
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    text("Bohemika a.s. · Srovnání pojištění", MARGIN, height - 17, 7, false, MUTED);
    font(7, true, ACCENT); pdf.text(`${page} / ${pdf.getNumberOfPages()}`, width - MARGIN, height - 17, { align: "right", baseline: "top" });
  }
  onProgress("PDF je hotové.");
  return pdf.output("blob");
}
