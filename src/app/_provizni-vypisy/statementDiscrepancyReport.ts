import type {
  DiscrepancyPdfItem,
  PrintableDiscrepancyItem,
  StatementDiscrepancyIssue,
} from "./statementTypes";

type PrintableStatement = {
  fileName: string;
  header: {
    advisorNumber: string | null;
    period: string | null;
    statementNumber: string | null;
    statementDate: string | null;
  };
};

type DiscrepancyPdfIcon =
  | "alert"
  | "check"
  | "file"
  | "info"
  | "list"
  | "money";

type DiscrepancyPdfTone = "amber" | "blue" | "emerald" | "rose" | "slate";

type JsPdfFontRegistrar = {
  addFileToVFS: (fileName: string, fileData: string) => void;
  addFont: (postScriptName: string, id: string, fontStyle: string) => void;
};

const DISCREPANCY_PDF_FONT_NAME = "LiberationSans";
const DISCREPANCY_PDF_FONTS = {
  regular: {
    fileName: "LiberationSans-Regular.ttf",
    path: "/fonts/LiberationSans-Regular.ttf",
    style: "normal",
  },
  bold: {
    fileName: "LiberationSans-Bold.ttf",
    path: "/fonts/LiberationSans-Bold.ttf",
    style: "bold",
  },
} as const;

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

let discrepancyPdfFontDataPromise: Promise<
  Record<keyof typeof DISCREPANCY_PDF_FONTS, string>
> | null = null;

const normalizeText = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeCommissionTitle = (value: unknown): string =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}%]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const formatMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatWholeMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const hasFiniteNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const discrepancyScopeLabel = (
  scope: StatementDiscrepancyIssue["scope"]
): string => {
  if (scope === "team") return "Týmová smlouva";
  if (scope === "tip") return "TIP provize";
  if (scope === "my") return "Vlastní smlouva";
  return "Výpis";
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char);

const safePdfFileNamePart = (value: string): string =>
  normalizeCommissionTitle(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "provizni-vypis";

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
};

const loadDiscrepancyPdfFontData = async () => {
  if (!discrepancyPdfFontDataPromise) {
    discrepancyPdfFontDataPromise = Promise.all(
      Object.entries(DISCREPANCY_PDF_FONTS).map(async ([key, font]) => {
        const response = await fetch(font.path);
        if (!response.ok) {
          throw new Error(`PDF font ${font.fileName} se nepodařilo načíst.`);
        }

        return [key, arrayBufferToBase64(await response.arrayBuffer())] as const;
      })
    ).then(
      (entries) =>
        Object.fromEntries(entries) as Record<
          keyof typeof DISCREPANCY_PDF_FONTS,
          string
        >
    );
  }

  return discrepancyPdfFontDataPromise;
};

const registerDiscrepancyPdfFonts = async (doc: JsPdfFontRegistrar) => {
  const fontData = await loadDiscrepancyPdfFontData();

  for (const [key, font] of Object.entries(DISCREPANCY_PDF_FONTS) as Array<
    [
      keyof typeof DISCREPANCY_PDF_FONTS,
      (typeof DISCREPANCY_PDF_FONTS)[keyof typeof DISCREPANCY_PDF_FONTS],
    ]
  >) {
    doc.addFileToVFS(font.fileName, fontData[key]);
    doc.addFont(font.fileName, DISCREPANCY_PDF_FONT_NAME, font.style);
  }
};

const isPremiumDiscrepancyIssue = (issue: StatementDiscrepancyIssue): boolean =>
  normalizeCommissionTitle(issue.title).includes("pojist");

const isCommissionAmountDiscrepancyIssue = (
  issue: StatementDiscrepancyIssue
): boolean =>
  !isPremiumDiscrepancyIssue(issue) &&
  hasFiniteNumber(issue.statementAmount) &&
  hasFiniteNumber(issue.expectedAmount) &&
  hasFiniteNumber(issue.difference);

const formatSignedWholeMoney = (value: number): string => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatWholeMoney(Math.abs(value))} Kč`;
};

const formatSettlementMoney = (value: number): string =>
  `${formatMoney(Math.abs(value))} Kč`;

const issueCommissionCodeLabel = (issue: StatementDiscrepancyIssue): string => {
  const [code] = issue.title.split(":");
  return normalizeText(code) || issue.title;
};

export const downloadDiscrepancySummaryPdf = async (
  items: DiscrepancyPdfItem[]
) => {
  if (items.length === 0) return;

  const statementLabels = [...new Set(items.map((item) => item.statementLabel))];
  const title =
    statementLabels.length === 1
      ? `Souhrn nesrovnalostí - ${statementLabels[0]}`
      : "Souhrn nesrovnalostí";
  const totalAdditionalCommission = items.reduce(
    (sum, item) =>
      sum +
      item.autoIssues
        .filter(isCommissionAmountDiscrepancyIssue)
        .reduce((itemSum, issue) => {
          const additional = (issue.expectedAmount ?? 0) - (issue.statementAmount ?? 0);
          return additional > 0 ? itemSum + additional : itemSum;
        }, 0),
    0
  );
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await registerDiscrepancyPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 4.45;
  let y = 16;

  const addPageIfNeeded = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const setText = (
    size: number,
    style: "normal" | "bold" = "normal",
    color: [number, number, number] = [17, 24, 39]
  ) => {
    doc.setFont(DISCREPANCY_PDF_FONT_NAME, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setCharSpace(0);
  };

  const setStroke = (color: [number, number, number], width = 0.2) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
  };

  const iconTone = (
    tone: DiscrepancyPdfTone
  ): {
    fill: [number, number, number];
    stroke: [number, number, number];
  } => {
    switch (tone) {
      case "amber":
        return { fill: [255, 251, 235], stroke: [217, 119, 6] };
      case "blue":
        return { fill: [239, 246, 255], stroke: [37, 99, 235] };
      case "emerald":
        return { fill: [236, 253, 245], stroke: [5, 150, 105] };
      case "rose":
        return { fill: [255, 241, 242], stroke: [225, 29, 72] };
      default:
        return { fill: [248, 250, 252], stroke: [71, 85, 105] };
    }
  };

  const drawPdfIcon = (
    icon: DiscrepancyPdfIcon,
    x: number,
    y: number,
    size: number,
    color: [number, number, number]
  ) => {
    const px = (value: number) => x + size * value;
    const py = (value: number) => y + size * value;
    setStroke(color, 0.42);
    doc.setFillColor(...color);
    const cx = x + size / 2;
    const cy = y + size / 2;

    switch (icon) {
      case "alert":
        doc.line(px(0.5), py(0.14), px(0.84), py(0.82));
        doc.line(px(0.84), py(0.82), px(0.16), py(0.82));
        doc.line(px(0.16), py(0.82), px(0.5), py(0.14));
        doc.line(px(0.5), py(0.38), px(0.5), py(0.61));
        doc.circle(px(0.5), py(0.71), size * 0.035, "F");
        break;
      case "check":
        doc.circle(cx, cy, size * 0.36, "S");
        doc.line(px(0.29), py(0.52), px(0.43), py(0.66));
        doc.line(px(0.43), py(0.66), px(0.72), py(0.34));
        break;
      case "file":
        doc.roundedRect(
          px(0.25),
          py(0.14),
          size * 0.5,
          size * 0.72,
          size * 0.08,
          size * 0.08,
          "S"
        );
        doc.line(px(0.59), py(0.14), px(0.75), py(0.3));
        doc.line(px(0.34), py(0.39), px(0.66), py(0.39));
        doc.line(px(0.34), py(0.55), px(0.66), py(0.55));
        doc.line(px(0.34), py(0.71), px(0.58), py(0.71));
        break;
      case "info":
        doc.circle(cx, cy, size * 0.36, "S");
        doc.circle(cx, py(0.34), size * 0.035, "F");
        doc.line(cx, py(0.45), cx, py(0.69));
        break;
      case "list":
        [0.28, 0.5, 0.72].forEach((lineY) => {
          doc.line(px(0.17), py(lineY), px(0.22), py(lineY + 0.05));
          doc.line(px(0.22), py(lineY + 0.05), px(0.31), py(lineY - 0.06));
          doc.line(px(0.43), py(lineY), px(0.83), py(lineY));
        });
        break;
      case "money":
        setText(size * 1.25, "bold", color);
        doc.text("Kč", cx, py(0.68), { align: "center" });
        break;
    }
  };

  const drawIconBadge = (
    x: number,
    y: number,
    icon: DiscrepancyPdfIcon,
    tone: DiscrepancyPdfTone = "slate",
    size = 9
  ) => {
    const palette = iconTone(tone);
    doc.setFillColor(...palette.fill);
    setStroke([226, 232, 240]);
    doc.roundedRect(x, y, size, size, 2, 2, "FD");
    drawPdfIcon(icon, x + 1.2, y + 1.2, size - 2.4, palette.stroke);
  };

  const addWrappedText = (
    text: string,
    x: number,
    width: number,
    options: {
      size?: number;
      style?: "normal" | "bold";
      color?: [number, number, number];
      gapAfter?: number;
    } = {}
  ) => {
    setText(options.size ?? 9, options.style ?? "normal", options.color);
    const lines = doc.splitTextToSize(normalizeText(text) || "—", width) as string[];
    const height = Math.max(lineHeight, lines.length * lineHeight) + (options.gapAfter ?? 0);
    addPageIfNeeded(height);
    doc.text(lines, x, y);
    y += height;
  };

  const drawMetricCard = ({
    x,
    y: cardY,
    width,
    label,
    value,
    icon,
    tone = "slate",
  }: {
    x: number;
    y: number;
    width: number;
    label: string;
    value: string;
    icon: DiscrepancyPdfIcon;
    tone?: DiscrepancyPdfTone;
  }) => {
    setStroke([226, 232, 240]);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, width, 18, 2.3, 2.3, "FD");
    drawIconBadge(x + 3, cardY + 4.5, icon, tone, 9);
    setText(7.2, "bold", [71, 85, 105]);
    doc.text(label, x + 15, cardY + 6);
    setText(11, "bold", [15, 23, 42]);
    doc.text(value, x + 15, cardY + 13);
  };

  const addLabelValue = (
    label: string,
    value: string,
    x: number,
    width: number
  ): number => {
    setText(7.5, "bold", [100, 116, 139]);
    doc.text(label, x, y);
    setText(8.7, "normal", [15, 23, 42]);
    const lines = doc.splitTextToSize(normalizeText(value) || "—", width) as string[];
    doc.text(lines, x, y + 4.3);
    return Math.max(9, 4.3 + lines.length * lineHeight);
  };

  doc.setFillColor(255, 255, 255);
  setStroke([226, 232, 240]);
  doc.roundedRect(margin, y, contentWidth, 30, 3, 3, "FD");
  drawIconBadge(margin + 5, y + 6, "file", "blue", 11);
  setText(16.5, "bold", [15, 23, 42]);
  doc.text(title, margin + 19, y + 11);
  setText(8.8, "normal", [71, 85, 105]);
  doc.text(
    "Podklad pro účetní opravu: provize vyplacená z jiného pojistného, než má smlouva v systému.",
    margin + 19,
    y + 19
  );
  setText(8, "normal", [100, 116, 139]);
  doc.text(`Vygenerováno ${new Date().toLocaleDateString("cs-CZ")}`, margin + 19, y + 25);
  y += 38;

  const summaryCardGap = 4;
  const summaryCardWidth = (contentWidth - summaryCardGap * 2) / 3;
  drawMetricCard({
    x: margin,
    y,
    width: summaryCardWidth,
    label: "Označeno",
    value: `${items.length} smluv`,
    icon: "list",
    tone: "blue",
  });
  drawMetricCard({
    x: margin + summaryCardWidth + summaryCardGap,
    y,
    width: summaryCardWidth,
    label: "Výpisů",
    value: String(statementLabels.length),
    icon: "file",
    tone: "slate",
  });
  drawMetricCard({
    x: margin + (summaryCardWidth + summaryCardGap) * 2,
    y,
    width: summaryCardWidth,
    label: "Celkem k doplacení",
    value: `${formatMoney(totalAdditionalCommission)} Kč`,
    icon: "money",
    tone: "emerald",
  });
  y += 27;

  items.forEach((item, index) => {
    const premiumIssue = item.autoIssues.find(isPremiumDiscrepancyIssue) ?? null;
    const commissionIssues = item.autoIssues.filter(isCommissionAmountDiscrepancyIssue);
    const manualIssues = item.autoIssues.filter(
      (issue) =>
        !isPremiumDiscrepancyIssue(issue) &&
        !isCommissionAmountDiscrepancyIssue(issue)
    );
    const statementPremium = premiumIssue?.statementAmount;
    const systemPremium = premiumIssue?.expectedAmount;
    const premiumDifference =
      hasFiniteNumber(statementPremium) && hasFiniteNumber(systemPremium)
        ? systemPremium - statementPremium
        : null;
    const itemAdditionalCommission = commissionIssues.reduce((sum, issue) => {
      const additional = (issue.expectedAmount ?? 0) - (issue.statementAmount ?? 0);
      return additional > 0 ? sum + additional : sum;
    }, 0);

    addPageIfNeeded(80);

    doc.setFillColor(255, 255, 255);
    setStroke([203, 213, 225]);
    doc.roundedRect(margin, y, contentWidth, 14, 2.5, 2.5, "FD");
    drawIconBadge(margin + 3, y + 2.5, "file", "blue", 9);
    setText(10.5, "bold", [15, 23, 42]);
    doc.text(`${index + 1}. Smlouva ${item.contractNumber || "—"}`, margin + 15, y + 8.8);
    setText(8, "normal", [71, 85, 105]);
    doc.text(item.statementLabel, margin + contentWidth - 4, y + 8.8, { align: "right" });
    y += 19;

    const infoColumnWidth = (contentWidth - 8) / 3;
    const infoTop = y;
    const infoHeight1 = addLabelValue("Klient", item.client || "—", margin + 2, infoColumnWidth);
    const infoHeight2 = addLabelValue(
      "Produkt",
      item.product || "—",
      margin + 2 + infoColumnWidth + 4,
      infoColumnWidth
    );
    const infoHeight3 = addLabelValue(
      "Typ smlouvy",
      `${item.category} · ${discrepancyScopeLabel(item.scope)}`,
      margin + 2 + (infoColumnWidth + 4) * 2,
      infoColumnWidth
    );
    y = infoTop + Math.max(infoHeight1, infoHeight2, infoHeight3) + 4;

    if (premiumIssue && premiumDifference !== null) {
      doc.setFillColor(248, 250, 252);
      setStroke([226, 232, 240]);
      doc.roundedRect(margin, y, contentWidth, 20, 2.5, 2.5, "FD");
      drawIconBadge(margin + 4, y + 5, "alert", "amber", 9);
      setText(8.5, "bold", [15, 23, 42]);
      doc.text("Vysvětlení pro účetní", margin + 15, y + 6.2);
      setText(8.4, "normal", [71, 85, 105]);
      const explanation = doc.splitTextToSize(
        "Provize byla ve výpisu vyplacena z jiného pojistného, než má smlouva aktuálně v systému. Níže je rozdíl pojistného a částka provize, kterou je potřeba doplatit.",
        contentWidth - 20
      ) as string[];
      doc.text(explanation, margin + 15, y + 11);
      y += 26;

      const premiumCardWidth = (contentWidth - 8) / 3;
      drawMetricCard({
        x: margin,
        y,
        width: premiumCardWidth,
        label: "Pojistné ve výpisu",
        value: `${formatWholeMoney(statementPremium ?? 0)} Kč`,
        icon: "money",
        tone: "slate",
      });
      drawMetricCard({
        x: margin + premiumCardWidth + 4,
        y,
        width: premiumCardWidth,
        label: "Skutečné pojistné",
        value: `${formatWholeMoney(systemPremium ?? 0)} Kč`,
        icon: "check",
        tone: "blue",
      });
      drawMetricCard({
        x: margin + (premiumCardWidth + 4) * 2,
        y,
        width: premiumCardWidth,
        label: "Rozdíl pojistného",
        value: formatSignedWholeMoney(premiumDifference),
        icon: "alert",
        tone: "amber",
      });
      y += 25;
    } else {
      addWrappedText(
        "Smlouva je označená ke kontrole. Automatický rozdíl pojistného nebyl k této položce jednoznačně dopočtený.",
        margin + 2,
        contentWidth - 4,
        {
          size: 8.5,
          color: [71, 85, 105],
          gapAfter: 3,
        }
      );
    }

    if (commissionIssues.length > 0) {
      doc.setFillColor(255, 255, 255);
      setStroke([187, 247, 208]);
      doc.roundedRect(margin, y, contentWidth, 12, 2.5, 2.5, "FD");
      drawIconBadge(margin + 3, y + 1.5, "money", "emerald", 9);
      setText(9.3, "bold", [15, 23, 42]);
      doc.text("Doplatek provize podle správného pojistného", margin + 15, y + 7.8);
      setText(10, "bold", [5, 150, 105]);
      doc.text(`${formatMoney(itemAdditionalCommission)} Kč`, margin + contentWidth - 4, y + 7.8, {
        align: "right",
      });
      y += 17;

      const tableX = margin;
      const codeWidth = 34;
      const amountWidth = 36;
      const rowHeight = 8.5;
      doc.setFillColor(241, 245, 249);
      setStroke([226, 232, 240]);
      doc.roundedRect(tableX, y, contentWidth, rowHeight, 1.8, 1.8, "FD");
      setText(7.5, "bold", [71, 85, 105]);
      doc.text("Položka", tableX + 3, y + 5.6);
      doc.text("Vyplaceno", tableX + codeWidth + amountWidth, y + 5.6, { align: "right" });
      doc.text("Má být", tableX + codeWidth + amountWidth * 2, y + 5.6, { align: "right" });
      doc.text("Doplatek", tableX + contentWidth - 3, y + 5.6, { align: "right" });
      y += rowHeight;

      commissionIssues.forEach((issue, issueIndex) => {
        const paid = issue.statementAmount ?? 0;
        const expected = issue.expectedAmount ?? 0;
        const additional = expected - paid;
        const isPositive = additional > 0;
        doc.setFillColor(issueIndex % 2 === 0 ? 255 : 248, issueIndex % 2 === 0 ? 255 : 250, issueIndex % 2 === 0 ? 255 : 252);
        setStroke([226, 232, 240]);
        doc.rect(tableX, y, contentWidth, rowHeight, "FD");
        setText(8.2, "bold", [30, 41, 59]);
        doc.text(issueCommissionCodeLabel(issue), tableX + 3, y + 5.8);
        setText(8.2, "normal", [51, 65, 85]);
        doc.text(`${formatMoney(paid)} Kč`, tableX + codeWidth + amountWidth, y + 5.8, {
          align: "right",
        });
        doc.text(`${formatMoney(expected)} Kč`, tableX + codeWidth + amountWidth * 2, y + 5.8, {
          align: "right",
        });
        setText(8.4, "bold", isPositive ? [21, 128, 61] : [190, 18, 60]);
        doc.text(
          isPositive ? formatSettlementMoney(additional) : `-${formatSettlementMoney(additional)}`,
          tableX + contentWidth - 3,
          y + 5.8,
          { align: "right" }
        );
        y += rowHeight;
      });
      y += 5;
    } else if (premiumIssue) {
      doc.setFillColor(255, 255, 255);
      setStroke([253, 230, 138]);
      doc.roundedRect(margin, y, contentWidth, 12, 2.5, 2.5, "FD");
      drawIconBadge(margin + 3, y + 1.5, "alert", "amber", 9);
      setText(8.5, "bold", [146, 64, 14]);
      doc.text("Doplatek provize není automaticky dopočtený. Prosím zkontrolovat ručně.", margin + 15, y + 7.8);
      y += 17;
    }

    if (manualIssues.length > 0) {
      addWrappedText("Další kontrolní body", margin + 2, contentWidth - 4, {
        size: 8.8,
        style: "bold",
        color: [30, 41, 59],
        gapAfter: 0.8,
      });
      manualIssues.forEach((issue) => {
        addWrappedText(`- ${issue.title}`, margin + 6, contentWidth - 10, {
          size: 8,
          color: [71, 85, 105],
          gapAfter: 0,
        });
      });
    }

    if (normalizeText(item.note)) {
      addWrappedText("Poznámka pro účetní", margin + 2, contentWidth - 4, {
        size: 8.8,
        style: "bold",
        color: [30, 41, 59],
        gapAfter: 0.8,
      });
      addWrappedText(item.note, margin + 6, contentWidth - 10, {
        size: 8,
        color: [71, 85, 105],
        gapAfter: 1,
      });
    }

    y += 7;
  });

  addPageIfNeeded(8);
  setText(8, "normal", [107, 114, 128]);
  doc.text("Vygenerováno z kontroly provizního výpisu v Bohemika provize.", margin, y);

  const fileBase =
    statementLabels.length === 1 ? safePdfFileNamePart(statementLabels[0]) : "vice-vypisu";
  doc.save(`souhrn-nesrovnalosti-${fileBase}.pdf`);
};

export const printDiscrepancyReport = (
  statement: PrintableStatement,
  items: PrintableDiscrepancyItem[]
) => {
  if (items.length === 0 || typeof window === "undefined") return;

  const totalDifference = items.reduce(
    (sum, item) => sum + (hasFiniteNumber(item.difference) ? item.difference : 0),
    0
  );
  const title = `Souhrn nesrovnalostí - výpis ${statement.header.statementNumber ?? "bez čísla"}`;
  const metaRows = [
    ["Soubor", statement.fileName],
    ["Číslo výpisu", statement.header.statementNumber ?? "—"],
    ["Období", statement.header.period ?? "—"],
    ["Vystaveno", statement.header.statementDate ?? "—"],
    ["Číslo poradce", statement.header.advisorNumber ?? "—"],
  ];
  const tableRows = items
    .map((item, index) => {
      const amountLines = [
        hasFiniteNumber(item.statementAmount) ? `Výpis: ${formatMoney(item.statementAmount)} Kč` : null,
        hasFiniteNumber(item.expectedAmount) ? `Systém: ${formatMoney(item.expectedAmount)} Kč` : null,
        hasFiniteNumber(item.difference) ? `Rozdíl: ${formatMoney(item.difference)} Kč` : null,
        item.manualAmountText ? item.manualAmountText : null,
      ].filter(Boolean);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.contractNumber || "—")}</strong><br>
            <span>${escapeHtml(discrepancyScopeLabel(item.scope))}</span>
          </td>
          <td>${escapeHtml(item.client || "—")}</td>
          <td>
            <strong>${escapeHtml(item.category)}</strong><br>
            <span>${escapeHtml(item.product || "—")}</span>
          </td>
          <td>
            <strong>${escapeHtml(item.title)}</strong>
            ${
              item.details.length > 0
                ? `<ul>${item.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>`
                : ""
            }
          </td>
          <td>${amountLines.map((line) => escapeHtml(line)).join("<br>") || "—"}</td>
          <td>${escapeHtml(item.note || "—")}</td>
          <td>${item.source === "manual" ? "Ručně" : "Automaticky"}</td>
        </tr>`;
    })
    .join("");
  const metaHtml = metaRows
    .map(
      ([label, value]) =>
        `<div class="meta-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join("");
  const reportHtml = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report { padding: 8px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .subtitle { margin: 0 0 16px; color: #4b5563; }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 14px;
    }
    .meta-item {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 7px 9px;
      break-inside: avoid;
    }
    .meta-item span {
      display: block;
      color: #6b7280;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .meta-item strong { display: block; margin-top: 2px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 16px;
    }
    .summary div {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 8px 9px;
      background: #f9fafb;
    }
    .summary span {
      display: block;
      color: #6b7280;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .summary strong { display: block; margin-top: 3px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px;
      vertical-align: top;
      text-align: left;
    }
    th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
    td ul { margin: 4px 0 0 16px; padding: 0; }
    td span { color: #4b5563; }
    tr { break-inside: avoid; }
    .footer { margin-top: 14px; color: #6b7280; font-size: 10px; }
  </style>
</head>
<body>
  <main class="report">
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">Podklad pro kontrolu a opravu provizního výpisu.</p>
    <section class="meta">${metaHtml}</section>
    <section class="summary">
      <div><span>Vybrané položky</span><strong>${items.length}</strong></div>
      <div><span>Ručně označeno</span><strong>${items.filter((item) => item.source === "manual").length}</strong></div>
      <div><span>Součet rozdílů</span><strong>${formatMoney(totalDifference)} Kč</strong></div>
    </section>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Smlouva</th>
          <th>Klient</th>
          <th>Oblast</th>
          <th>Nález</th>
          <th>Částka</th>
          <th>Poznámka</th>
          <th>Zdroj</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p class="footer">Vygenerováno z kontroly provizního výpisu v Bohemika provize.</p>
  </main>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=980,height=1200");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(reportHtml);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 250);
};
