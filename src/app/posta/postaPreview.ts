import {
  formatDateTime,
  formatFileSize,
  isSentMailboxItem,
  isTipsterTipMailboxItem,
  nameFromEmail,
  normalizeEmail,
  parseMailboxAttachments,
} from "./postaHelpers";
import type { MailboxAttachment, MailboxItem } from "./postaTypes";

const parseNonNegativeInt = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
};

const parseNonNegativeNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const formatMoney = (value: number): string => {
  try {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} Kč`;
  }
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const splitMeetingTopicsAndMessage = (
  topicsRaw: string,
  messageRaw: string
): { topics: string[]; message: string } => {
  const directTopics = topicsRaw
    .split("||")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 16);
  if (directTopics.length > 0) {
    return { topics: directTopics, message: messageRaw.trim() };
  }

  const trimmedMessage = messageRaw.trim();
  if (!trimmedMessage) {
    return { topics: [], message: "" };
  }

  const lines = trimmedMessage.split(/\r?\n/);
  const firstLine = (lines[0] ?? "").trim();
  const match = firstLine.match(/^t[ée]mata zájmu:\s*(.+)$/i);
  if (!match) {
    return { topics: [], message: trimmedMessage };
  }

  const topics = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 16);
  const message = lines
    .slice(1)
    .join("\n")
    .trim();

  return { topics, message };
};

type TipsterPreviewField = {
  label: string;
  value: string;
};

type TipPreviewIconName =
  | "address"
  | "briefcase"
  | "building"
  | "car"
  | "chart"
  | "clock"
  | "file"
  | "gauge"
  | "home"
  | "id"
  | "image"
  | "info"
  | "mail"
  | "note"
  | "package"
  | "paperclip"
  | "phone"
  | "user"
  | "users";

const normalizePreviewText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeTipLabel = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const parseTipsterTipFields = (textRaw: string): TipsterPreviewField[] => {
  const fields: TipsterPreviewField[] = [];
  let current: TipsterPreviewField | null = null;

  textRaw.split(/\r?\n/).forEach((lineRaw) => {
    const line = lineRaw.trim();
    if (!line || /^nový tip z tipařského formuláře$/i.test(line)) return;

    const match = line.match(/^([^:]{1,90}):\s*(.*)$/);
    if (match) {
      current = {
        label: match[1]?.trim() ?? "",
        value: match[2]?.trim() ?? "",
      };
      if (current.label) fields.push(current);
      return;
    }

    if (current) {
      current.value = `${current.value}\n${line}`.trim();
    }
  });

  return fields.filter((field) => field.label || field.value);
};

const findTipsterFieldValue = (fields: TipsterPreviewField[], label: string): string => {
  const wanted = normalizeTipLabel(label);
  return fields.find((field) => normalizeTipLabel(field.label) === wanted)?.value ?? "";
};

const isTipsterMetaField = (field: TipsterPreviewField): boolean => {
  const label = normalizeTipLabel(field.label);
  return (
    label === "produkt" ||
    label === "tipař" ||
    label === "e-mail tipaře" ||
    label === "tp přední strana" ||
    label === "tp zadní strana"
  );
};

const isImageAttachment = (file: MailboxAttachment): boolean => {
  const contentType = file.contentType.toLowerCase();
  if (contentType.startsWith("image/")) return true;
  return /\.(apng|avif|gif|jpe?g|png|webp)$/i.test(file.name);
};

const tipPreviewIcon = (name: TipPreviewIconName): string => {
  const paths: Record<TipPreviewIconName, string> = {
    address:
      '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    briefcase:
      '<path d="M10 6h4a2 2 0 0 1 2 2v1H8V8a2 2 0 0 1 2-2Z"/><path d="M4 9h16v11H4Z"/><path d="M4 13h16"/><path d="M10 13v2h4v-2"/>',
    building:
      '<path d="M4 21V5a2 2 0 0 1 2-2h8v18"/><path d="M14 9h4a2 2 0 0 1 2 2v10"/><path d="M8 7h2M8 11h2M8 15h2M17 13h1M17 17h1"/><path d="M3 21h18"/>',
    car:
      '<path d="M7 17h10"/><path d="M5 17h1a2 2 0 0 0 4 0h4a2 2 0 0 0 4 0h1v-4l-2-5H7l-2 5v4Z"/><path d="M7 13h10"/><path d="M9 8l-1 5M15 8l1 5"/>',
    chart:
      '<path d="M4 19V5"/><path d="M4 19h17"/><path d="M8 16v-5"/><path d="M13 16V8"/><path d="M18 16v-9"/>',
    clock:
      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
    gauge:
      '<path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><path d="M7 14h.01M17 14h.01M12 6v.01"/>',
    home:
      '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-7h6v7"/>',
    id:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5"/><path d="M7 13h3"/><circle cx="16.5" cy="12" r="2"/><path d="M14 16c.7-1 1.6-1.5 2.5-1.5S18.3 15 19 16"/>',
    image:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5L5 19"/>',
    info:
      '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    mail:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
    note:
      '<path d="M5 3h14v18H5Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    package:
      '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/>',
    paperclip:
      '<path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3 3 0 0 1 4 4l-8.5 8.5a1 1 0 0 1-1.5-1.5L16 8"/>',
    phone:
      '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.5 1.7L7.8 9.7a16 16 0 0 0 6.5 6.5l1.3-1.3a2 2 0 0 1 1.7-.5l3 .5a2 2 0 0 1 1.7 2Z"/>',
    user:
      '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:
      '<circle cx="9" cy="8" r="3"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 11a3 3 0 1 0 0-6"/><path d="M18 21a7 7 0 0 0-3-5.7"/>',
  };

  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
};

const iconForTipProduct = (label: string): TipPreviewIconName => {
  const normalized = normalizeTipLabel(label);
  if (/vozidel|vozidlo|auto/.test(normalized)) return "car";
  if (/podnikatel|firma|ico|ičo/.test(normalized)) return "building";
  if (/majetek|odpovědnost|dum|dům|byt/.test(normalized)) return "home";
  return "package";
};

const iconForTipField = (label: string): TipPreviewIconName => {
  const normalized = normalizeTipLabel(label);
  if (/telefon/.test(normalized)) return "phone";
  if (/e-mail|email|mail/.test(normalized)) return "mail";
  if (/rodné|rodne|ičo|ico/.test(normalized)) return "id";
  if (/spz|vozidlo|auto/.test(normalized)) return "car";
  if (/nájezd|najezd|km/.test(normalized)) return "gauge";
  if (/čas|cas|datum/.test(normalized)) return "clock";
  if (/adresa|sídlo|sidlo/.test(normalized)) return "address";
  if (/jméno|jmeno|název|nazev|klient/.test(normalized)) return "user";
  if (/obrat/.test(normalized)) return "chart";
  if (/zaměstnanc|zamestnanc/.test(normalized)) return "users";
  if (/činnost|cinnost/.test(normalized)) return "briefcase";
  if (/poznámka|poznamka|popis/.test(normalized)) return "note";
  return "info";
};

const renderTipsterFieldCards = (fields: TipsterPreviewField[]): string => {
  if (fields.length === 0) {
    return `<div class="empty">Nejsou vyplněné žádné další údaje.</div>`;
  }

  return fields
    .map((field) => {
      const wide =
        field.value.length > 70 ||
        field.value.includes("\n") ||
        /adresa|popis|poznámka|činnost/i.test(field.label);
      return `<div class="field-card${wide ? " wide" : ""}">
        <div class="field-head">
          <span class="icon-badge">${tipPreviewIcon(iconForTipField(field.label))}</span>
          <div class="field-label">${escapeHtml(field.label)}</div>
        </div>
        <div class="field-value">${escapeHtml(field.value || "Neuvedeno")}</div>
      </div>`;
    })
    .join("");
};

const renderTipsterAttachments = (
  attachments: MailboxAttachment[],
  productLabel: string
): string => {
  if (attachments.length === 0) return "";

  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter((file) => !isImageAttachment(file));
  const isVehicleTip = /vozidel|vozidlo/i.test(productLabel);

  return `
    <section class="section attachments-section">
      <div class="section-label section-label-with-icon">
        <span class="icon-badge section-icon">${tipPreviewIcon("paperclip")}</span>
        <span>Přílohy</span>
      </div>
      <h2>Technický průkaz a soubory</h2>
      ${
        imageAttachments.length > 0
          ? `<div class="photo-grid">
              ${imageAttachments
                .map((file, index) => {
                  const label = isVehicleTip
                    ? index === 0
                      ? "Technický průkaz - přední strana"
                      : index === 1
                      ? "Technický průkaz - zadní strana"
                      : file.name
                    : file.name;
                  return `<a class="photo-card" href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer noopener">
                    <img src="${escapeHtml(file.url)}" alt="${escapeHtml(label)}" loading="lazy" />
                    <span>
                      <strong>${tipPreviewIcon("image")}${escapeHtml(label)}</strong>
                      <small>${escapeHtml(file.name)} • ${escapeHtml(formatFileSize(file.sizeBytes))}</small>
                    </span>
                  </a>`;
                })
                .join("")}
            </div>`
          : ""
      }
      ${
        fileAttachments.length > 0
          ? `<div class="file-list">
              ${fileAttachments
                .map(
                  (file) =>
                    `<a class="file-link" href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer noopener">${tipPreviewIcon(
                      "file"
                    )}<span>${escapeHtml(file.name)} • ${escapeHtml(formatFileSize(file.sizeBytes))}</span></a>`
                )
                .join("")}
            </div>`
          : ""
      }
    </section>
  `;
};

const buildTipsterTipPreviewHtml = ({
  item,
  textRaw,
  attachments,
  isSent,
  senderName,
  recipientName,
}: {
  item: MailboxItem;
  textRaw: string;
  attachments: MailboxAttachment[];
  isSent: boolean;
  senderName: string;
  recipientName: string;
}): string => {
  const metadata = item.metadata ?? {};
  const fields = parseTipsterTipFields(textRaw);
  const metadataProductLabel = normalizePreviewText(metadata.tipProductLabel);
  const productLabel =
    metadataProductLabel ||
    findTipsterFieldValue(fields, "Produkt") ||
    item.title.replace(/^nový tip\s*-\s*/i, "").trim() ||
    "Tip";
  const tipperName = findTipsterFieldValue(fields, "Tipař") || senderName;
  const tipperEmail = findTipsterFieldValue(fields, "E-mail tipaře");
  const detailFields = fields.filter((field) => !isTipsterMetaField(field));
  const metaTarget = isSent ? recipientName : tipperName;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html {
            min-height: 100%;
            background: #0b0615;
          }
          body {
            margin: 0;
            min-height: 100%;
            padding: 0;
            background:
              radial-gradient(circle at 16% 8%, rgba(168, 85, 247, 0.18), transparent 34%),
              linear-gradient(180deg, #22143c 0%, #12091f 52%, #0b0615 100%);
            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-weight: 400;
            color: #f8fafc;
          }
          .page {
            width: 100%;
            max-width: none;
            min-height: 100vh;
            margin: 0;
            border-radius: 0;
            border: 0;
            background:
              radial-gradient(circle at 82% 4%, rgba(139, 92, 246, 0.22), transparent 30%),
              linear-gradient(180deg, #22143c 0%, #12091f 52%, #0b0615 100%);
            box-shadow: none;
            padding: 32px;
          }
          .kicker {
            color: rgba(221, 214, 254, 0.82);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          h1 {
            margin: 10px 0 8px;
            color: #ffffff;
            font-size: 36px;
            font-weight: 700;
            line-height: 1.04;
            letter-spacing: -0.025em;
          }
          .meta {
            color: rgba(237, 233, 254, 0.72);
            font-size: 14px;
          }
          .meta strong {
            color: #ffffff;
            font-weight: 600;
          }
          .hero-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-top: 20px;
          }
          .hero-card,
          .field-card,
          .empty {
            border: 1px solid rgba(196, 181, 253, 0.20);
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.055);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
            padding: 14px;
          }
          .hero-head,
          .field-head,
          .section-label-with-icon {
            display: flex;
            align-items: center;
            gap: 9px;
          }
          .icon-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            flex: 0 0 auto;
            border-radius: 10px;
            border: 1px solid rgba(196, 181, 253, 0.28);
            background: rgba(168, 85, 247, 0.14);
            color: #ddd6fe;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          .icon-badge svg,
          .photo-card strong svg,
          .file-link svg {
            width: 16px;
            height: 16px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
          .hero-icon {
            width: 34px;
            height: 34px;
            border-radius: 12px;
            color: #ffffff;
            background: rgba(168, 85, 247, 0.24);
          }
          .hero-card strong {
            display: block;
            margin-top: 6px;
            color: #ffffff;
            font-size: 17px;
            font-weight: 600;
          }
          .field-label,
          .section-label {
            color: rgba(221, 214, 254, 0.76);
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .field-value {
            margin-top: 6px;
            color: #ffffff;
            font-size: 15px;
            font-weight: 400;
            line-height: 1.45;
            white-space: pre-wrap;
          }
          .section {
            margin-top: 20px;
          }
          .section h2 {
            margin: 5px 0 12px;
            color: #ffffff;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.02em;
          }
          .field-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .field-card.wide {
            grid-column: 1 / -1;
          }
          .empty {
            color: rgba(237, 233, 254, 0.72);
          }
          .photo-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }
          .photo-card {
            display: block;
            overflow: hidden;
            border: 1px solid rgba(196, 181, 253, 0.24);
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.055);
            color: inherit;
            text-decoration: none;
          }
          .photo-card img {
            display: block;
            width: 100%;
            height: 260px;
            object-fit: contain;
            background: rgba(10, 6, 21, 0.72);
          }
          .photo-card span {
            display: block;
            padding: 12px 14px;
          }
          .photo-card strong {
            display: flex;
            align-items: center;
            gap: 7px;
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
          }
          .photo-card small {
            display: block;
            margin-top: 3px;
            color: rgba(237, 233, 254, 0.62);
            font-size: 12px;
          }
          .file-list {
            display: grid;
            gap: 8px;
            margin-top: 12px;
          }
          .file-link {
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid rgba(196, 181, 253, 0.22);
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.05);
            color: #ede9fe;
            padding: 10px 12px;
            text-decoration: none;
          }
          .footer {
            margin-top: 20px;
            border-top: 1px dashed rgba(196, 181, 253, 0.24);
            padding-top: 12px;
            color: rgba(237, 233, 254, 0.58);
            font-size: 12px;
          }
          @media (max-width: 720px) {
            .page { padding: 20px; }
            h1 { font-size: 30px; }
            .hero-grid,
            .field-grid,
            .photo-grid { grid-template-columns: 1fr; }
            .photo-card img { height: 220px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="kicker">${isSent ? "Odeslaný tip" : "Přijatý tip"} z tipařského formuláře</div>
          <h1>Nový tip - ${escapeHtml(productLabel)}</h1>
          <div class="meta">${isSent ? "Komu" : "Od"}: <strong>${escapeHtml(
    metaTarget
  )}</strong> • ${escapeHtml(formatDateTime(item.createdAtMs))}</div>

          <div class="hero-grid">
            <div class="hero-card">
              <div class="hero-head">
                <span class="icon-badge hero-icon">${tipPreviewIcon(iconForTipProduct(productLabel))}</span>
                <div class="field-label">Produkt</div>
              </div>
              <strong>${escapeHtml(productLabel)}</strong>
            </div>
            <div class="hero-card">
              <div class="hero-head">
                <span class="icon-badge hero-icon">${tipPreviewIcon("user")}</span>
                <div class="field-label">Tipař</div>
              </div>
              <strong>${escapeHtml(tipperName)}</strong>
            </div>
            <div class="hero-card">
              <div class="hero-head">
                <span class="icon-badge hero-icon">${tipPreviewIcon("mail")}</span>
                <div class="field-label">E-mail tipaře</div>
              </div>
              <strong>${escapeHtml(tipperEmail || normalizeEmail(metadata.senderEmail) || "Neuvedeno")}</strong>
            </div>
          </div>

          <section class="section">
            <div class="section-label">Údaje k tipu</div>
            <h2>${escapeHtml(productLabel)}</h2>
            <div class="field-grid">${renderTipsterFieldCards(detailFields)}</div>
          </section>

          ${renderTipsterAttachments(attachments, productLabel)}

          <div class="footer">
            Tip je odlišený od běžné interní zprávy podle metadat tipařského formuláře.
          </div>
        </div>
      </body>
    </html>
  `;
};

const buildSharedPlanPreviewHtml = (item: MailboxItem): string | null => {
  if (item.type !== "production_plan_share") return null;
  const metadata = item.metadata ?? {};
  const senderNameRaw =
    typeof metadata.senderName === "string" && metadata.senderName.trim().length > 0
      ? metadata.senderName.trim()
      : "Kolega z týmu";

  const senderName = escapeHtml(senderNameRaw);
  const generatedAt = escapeHtml(formatDateTime(item.createdAtMs));
  const lifeContracts = parseNonNegativeInt(metadata.lifeContracts);
  const lifePremium = parseNonNegativeNumber(metadata.lifePremium);
  const autoContracts = parseNonNegativeInt(metadata.autoContracts);
  const autoPremium = parseNonNegativeNumber(metadata.autoPremium);
  const propertyContracts = parseNonNegativeInt(metadata.propertyContracts);
  const propertyPremium = parseNonNegativeNumber(metadata.propertyPremium);
  const totalImmediate = parseNonNegativeNumber(metadata.totalImmediate);
  const noteText =
    typeof metadata.noteText === "string" && metadata.noteText.trim().length > 0
      ? metadata.noteText.trim()
      : "";

  const rows = [
    {
      title: "Životní pojištění",
      contracts: lifeContracts,
      premium: lifePremium,
      tone: "#059669",
    },
    {
      title: "Auta",
      contracts: autoContracts,
      premium: autoPremium,
      tone: "#2563eb",
    },
    {
      title: "Majetek",
      contracts: propertyContracts,
      premium: propertyPremium,
      tone: "#d97706",
    },
  ];

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: linear-gradient(155deg, #edf3fb 0%, #f8fbff 55%, #eef4fc 100%);
            font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #10213d;
          }
          .page {
            max-width: 820px;
            margin: 0 auto;
            border-radius: 24px;
            border: 1px solid #d8e2f0;
            background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
            box-shadow: 0 24px 58px rgba(16, 33, 61, 0.16);
            padding: 18px 20px 22px;
          }
          .pill {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid #ccd9ec;
            background: #f4f8ff;
            color: #26406e;
            padding: 5px 12px;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
          }
          h1 {
            margin: 12px 0 4px;
            font-size: 42px;
            line-height: 0.98;
            color: #112347;
            font-weight: 800;
          }
          .meta {
            font-size: 13px;
            color: #4b5f83;
            margin-bottom: 12px;
          }
          .kpi {
            margin-top: 8px;
            border-radius: 14px;
            border: 1px solid #cfdced;
            background: linear-gradient(155deg, #f6faff 0%, #eef5ff 100%);
            padding: 10px 12px;
            text-align: right;
          }
          .kpi-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.09em;
            color: #5d7090;
            font-weight: 700;
          }
          .kpi-value {
            margin-top: 4px;
            color: #112347;
            font-size: 30px;
            font-weight: 800;
          }
          .note {
            margin-top: 10px;
            border-radius: 12px;
            border: 1px solid #d7e3f4;
            background: #f7fbff;
            padding: 10px 12px;
            font-size: 13px;
            color: #1f355d;
            white-space: pre-wrap;
          }
          .card {
            margin-top: 12px;
            padding: 14px;
            border-radius: 16px;
            border: 1px solid #cfdced;
            background: linear-gradient(170deg, #ffffff 0%, #f8fbff 100%);
          }
          .title {
            margin: 0 0 10px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #13284d;
            font-weight: 800;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            text-align: right;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #64748b;
            border-bottom: 1px solid #dbe5f2;
            padding-bottom: 7px;
          }
          th:first-child, td:first-child { text-align: left; }
          td {
            font-size: 13px;
            padding: 8px 0;
            border-bottom: 1px solid #eef2f8;
          }
          tr:last-child td { border-bottom: none; }
          .dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 999px;
            margin-right: 8px;
          }
          .footer {
            margin-top: 10px;
            font-size: 11px;
            color: #60748f;
            border-top: 1px dashed #cad7ea;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <span class="pill">Sdílený plán produkce</span>
          <h1>Plán produkce</h1>
          <div class="meta">Autor: <strong>${senderName}</strong> • Vygenerováno ${generatedAt}</div>

          <div class="kpi">
            <div class="kpi-label">Odhad okamžité provize</div>
            <div class="kpi-value">${escapeHtml(formatMoney(totalImmediate))}</div>
          </div>

          ${noteText ? `<div class="note"><strong>Poznámka:</strong> ${escapeHtml(noteText)}</div>` : ""}

          <div class="card">
            <p class="title">Souhrn vstupních sekcí</p>
            <table>
              <thead>
                <tr>
                  <th>Sekce</th>
                  <th>Počet smluv</th>
                  <th>Celkové pojistné</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td><span class="dot" style="background:${row.tone}"></span>${escapeHtml(row.title)}</td>
                        <td>${row.contracts}</td>
                        <td><strong>${escapeHtml(formatMoney(row.premium))}</strong></td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="footer">
            Náhled je sestaven z dat ve sdílené zprávě z notifikačního centra.
          </div>
        </div>
      </body>
    </html>
  `;
};

const buildSharedExportPreviewHtml = (item: MailboxItem): string | null => {
  if (item.type !== "production_export_share") return null;
  const metadata = item.metadata ?? {};
  const senderName =
    typeof metadata.senderName === "string" && metadata.senderName.trim().length > 0
      ? metadata.senderName.trim()
      : "Kolega z týmu";
  const scopeLabel =
    typeof metadata.scopeLabel === "string" && metadata.scopeLabel.trim().length > 0
      ? metadata.scopeLabel.trim()
      : "Vlastní produkce";
  const dateRangeLabel =
    typeof metadata.dateRangeLabel === "string" && metadata.dateRangeLabel.trim().length > 0
      ? metadata.dateRangeLabel.trim()
      : "Aktuální období";
  const periodFrom =
    typeof metadata.periodFrom === "string" && metadata.periodFrom.trim().length > 0
      ? metadata.periodFrom.trim()
      : "N/A";
  const periodTo =
    typeof metadata.periodTo === "string" && metadata.periodTo.trim().length > 0
      ? metadata.periodTo.trim()
      : "N/A";
  const categories =
    typeof metadata.selectedCategoryLabel === "string" && metadata.selectedCategoryLabel.trim().length > 0
      ? metadata.selectedCategoryLabel.trim()
      : "Všechny kategorie";
  const advisers =
    typeof metadata.selectedAdvisersLabel === "string" && metadata.selectedAdvisersLabel.trim().length > 0
      ? metadata.selectedAdvisersLabel.trim()
      : "Bez týmu";
  const topProduct =
    typeof metadata.topProductName === "string" && metadata.topProductName.trim().length > 0
      ? metadata.topProductName.trim()
      : "Bez dominantního produktu";
  const noteText =
    typeof metadata.noteText === "string" && metadata.noteText.trim().length > 0
      ? metadata.noteText.trim()
      : "";

  const totalContracts = parseNonNegativeInt(metadata.totalContracts);
  const totalAnnual = parseNonNegativeNumber(metadata.totalAnnual);
  const lifeAnnual = parseNonNegativeNumber(metadata.lifeAnnual);
  const nonLifeAnnual = parseNonNegativeNumber(metadata.nonLifeAnnual);
  const goldTotal = parseNonNegativeNumber(metadata.goldTotal);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: linear-gradient(155deg, #edf3fb 0%, #f8fbff 55%, #eef4fc 100%);
            font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #10213d;
          }
          .page {
            max-width: 880px;
            margin: 0 auto;
            border-radius: 24px;
            border: 1px solid #d8e2f0;
            background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
            box-shadow: 0 24px 58px rgba(16, 33, 61, 0.16);
            padding: 18px 20px 22px;
          }
          .pill {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid #ccd9ec;
            background: #f4f8ff;
            color: #26406e;
            padding: 5px 12px;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
          }
          h1 {
            margin: 12px 0 4px;
            font-size: 42px;
            line-height: 0.98;
            color: #112347;
            font-weight: 800;
          }
          .meta {
            font-size: 13px;
            color: #4b5f83;
            margin-bottom: 12px;
          }
          .stats-grid {
            margin-top: 10px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .stat {
            border: 1px solid #d4deec;
            border-radius: 12px;
            padding: 10px;
            background: #f8fbff;
          }
          .label {
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #5f7494;
            font-weight: 700;
          }
          .value {
            margin-top: 4px;
            color: #13284d;
            font-size: 17px;
            font-weight: 800;
          }
          .note {
            margin-top: 10px;
            border-radius: 12px;
            border: 1px solid #d7e3f4;
            background: #f7fbff;
            padding: 10px 12px;
            font-size: 13px;
            color: #1f355d;
            white-space: pre-wrap;
          }
          .footer {
            margin-top: 12px;
            font-size: 11px;
            color: #60748f;
            border-top: 1px dashed #cad7ea;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <span class="pill">Sdílený export produkce</span>
          <h1>Export produkce</h1>
          <div class="meta">Autor: <strong>${escapeHtml(senderName)}</strong> • Vygenerováno ${escapeHtml(
    formatDateTime(item.createdAtMs)
  )}</div>

          <div class="stats-grid">
            <div class="stat">
              <div class="label">Rozsah</div>
              <div class="value">${escapeHtml(scopeLabel)}</div>
            </div>
            <div class="stat">
              <div class="label">Období</div>
              <div class="value">${escapeHtml(dateRangeLabel)}</div>
            </div>
            <div class="stat">
              <div class="label">Filtr data</div>
              <div class="value">${escapeHtml(periodFrom)} – ${escapeHtml(periodTo)}</div>
            </div>
            <div class="stat">
              <div class="label">Celkem smluv</div>
              <div class="value">${totalContracts}</div>
            </div>
            <div class="stat">
              <div class="label">Roční pojistné celkem</div>
              <div class="value">${escapeHtml(formatMoney(totalAnnual))}</div>
            </div>
            <div class="stat">
              <div class="label">Dominantní produkt</div>
              <div class="value">${escapeHtml(topProduct)}</div>
            </div>
            <div class="stat">
              <div class="label">Kategorie</div>
              <div class="value">${escapeHtml(categories)}</div>
            </div>
            <div class="stat">
              <div class="label">Tým</div>
              <div class="value">${escapeHtml(advisers)}</div>
            </div>
            <div class="stat">
              <div class="label">Život (roční)</div>
              <div class="value">${escapeHtml(formatMoney(lifeAnnual))}</div>
            </div>
            <div class="stat">
              <div class="label">Neživot (roční)</div>
              <div class="value">${escapeHtml(formatMoney(nonLifeAnnual))}</div>
            </div>
            <div class="stat">
              <div class="label">Zlato</div>
              <div class="value">${escapeHtml(formatMoney(goldTotal))}</div>
            </div>
          </div>

          ${
            noteText
              ? `<div class="note"><strong>Poznámka:</strong> ${escapeHtml(noteText)}</div>`
              : ""
          }

          <div class="footer">
            Náhled je sestaven z dat ve sdílené zprávě z notifikačního centra.
          </div>
        </div>
      </body>
    </html>
  `;
};

const buildDirectMessagePreviewHtml = (item: MailboxItem): string | null => {
  if (item.type !== "direct_message") return null;
  const metadata = item.metadata ?? {};
  const senderEmail = normalizeEmail(metadata.senderEmail);
  const senderNameRaw =
    typeof metadata.senderName === "string" && metadata.senderName.trim().length > 0
      ? metadata.senderName.trim()
      : senderEmail
      ? nameFromEmail(senderEmail)
      : "Uživatel";
  const recipientEmail = normalizeEmail(metadata.recipientEmail);
  const recipientNameRaw =
    typeof metadata.recipientName === "string" && metadata.recipientName.trim().length > 0
      ? metadata.recipientName.trim()
      : recipientEmail
      ? nameFromEmail(recipientEmail)
      : "Uživatel";
  const textRaw =
    typeof metadata.messageText === "string" && metadata.messageText.trim().length > 0
      ? metadata.messageText.trim()
      : item.body.trim();
  const attachments = parseMailboxAttachments(item);
  const isSent = isSentMailboxItem(item);

  if (isTipsterTipMailboxItem(item)) {
    return buildTipsterTipPreviewHtml({
      item,
      textRaw,
      attachments,
      isSent,
      senderName: senderNameRaw,
      recipientName: recipientNameRaw,
    });
  }

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: linear-gradient(155deg, #edf3fb 0%, #f8fbff 55%, #eef4fc 100%);
            font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #10213d;
          }
          .page {
            max-width: 860px;
            margin: 0 auto;
            border-radius: 24px;
            border: 1px solid #d8e2f0;
            background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
            box-shadow: 0 24px 58px rgba(16, 33, 61, 0.16);
            padding: 18px 20px 22px;
          }
          .pill {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid #ccd9ec;
            background: #f4f8ff;
            color: #26406e;
            padding: 5px 12px;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
          }
          h1 {
            margin: 12px 0 6px;
            font-size: 34px;
            line-height: 1.02;
            color: #112347;
            font-weight: 800;
          }
          .meta {
            font-size: 13px;
            color: #4b5f83;
            margin-bottom: 12px;
          }
          .card {
            margin-top: 12px;
            padding: 14px;
            border-radius: 16px;
            border: 1px solid #cfdced;
            background: linear-gradient(170deg, #ffffff 0%, #f8fbff 100%);
          }
          .label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #5f7494;
            font-weight: 700;
          }
          .value {
            margin-top: 4px;
            color: #13284d;
            font-size: 18px;
            font-weight: 700;
          }
          .text {
            margin-top: 8px;
            border-radius: 12px;
            border: 1px solid #d9e4f4;
            background: #f7fbff;
            padding: 12px;
            color: #1f355d;
            font-size: 15px;
            white-space: pre-wrap;
          }
          .attachments {
            margin-top: 10px;
            border-top: 1px dashed #cad7ea;
            padding-top: 10px;
          }
          .attachment {
            display: block;
            padding: 8px 10px;
            border: 1px solid #d4deec;
            border-radius: 10px;
            background: #f8fbff;
            text-decoration: none;
            color: #1e3a6a;
            margin-top: 6px;
            font-size: 13px;
          }
          .attachment:hover { background: #eef5ff; }
          .footer {
            margin-top: 12px;
            font-size: 11px;
            color: #60748f;
            border-top: 1px dashed #cad7ea;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <span class="pill">${isSent ? "Odeslaná zpráva" : "Přijatá zpráva"}</span>
          <h1>${escapeHtml(item.title || "Zpráva")}</h1>
          <div class="meta">${isSent ? "Komu" : "Od"}: <strong>${escapeHtml(
    isSent ? recipientNameRaw : senderNameRaw
  )}</strong> • ${escapeHtml(formatDateTime(item.createdAtMs))}</div>

          <div class="card">
            <div class="label">Text zprávy</div>
            <div class="text">${escapeHtml(textRaw || "Bez textu.")}</div>

            ${
              attachments.length > 0
                ? `<div class="attachments">
                    <div class="label">Přílohy (${attachments.length})</div>
                    ${attachments
                      .map(
                        (file) =>
                          `<a class="attachment" href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(
                            file.name
                          )} • ${escapeHtml(formatFileSize(file.sizeBytes))}</a>`
                      )
                      .join("")}
                  </div>`
                : ""
            }
          </div>

          <div class="footer">
            Náhled interní zprávy z notifikačního centra.
          </div>
        </div>
      </body>
    </html>
  `;
};

const buildOnlineCardMeetingRequestPreviewHtml = (item: MailboxItem): string | null => {
  if (item.type !== "online_card_meeting_request") return null;
  const metadata = item.metadata ?? {};

  const requesterName =
    typeof metadata.requesterName === "string" && metadata.requesterName.trim().length > 0
      ? metadata.requesterName.trim()
      : "Neznámý žadatel";
  const requesterEmail =
    typeof metadata.requesterEmail === "string" && metadata.requesterEmail.trim().length > 0
      ? metadata.requesterEmail.trim()
      : "";
  const requesterPhone =
    typeof metadata.requesterPhone === "string" && metadata.requesterPhone.trim().length > 0
      ? metadata.requesterPhone.trim()
      : "";
  const ownerName =
    typeof metadata.meetingOwnerName === "string" && metadata.meetingOwnerName.trim().length > 0
      ? metadata.meetingOwnerName.trim()
      : "";
  const slug =
    typeof metadata.slug === "string" && metadata.slug.trim().length > 0
      ? metadata.slug.trim()
      : "";
  const requestId =
    typeof metadata.requestId === "string" && metadata.requestId.trim().length > 0
      ? metadata.requestId.trim()
      : item.id;
  const topicsRaw =
    typeof metadata.requesterTopics === "string" ? metadata.requesterTopics : "";
  const messageRaw =
    typeof metadata.requesterMessage === "string" ? metadata.requesterMessage : "";
  const { topics, message } = splitMeetingTopicsAndMessage(topicsRaw, messageRaw);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: linear-gradient(155deg, #edf3fb 0%, #f8fbff 55%, #eef4fc 100%);
            font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #10213d;
          }
          .page {
            max-width: 860px;
            margin: 0 auto;
            border-radius: 24px;
            border: 1px solid #d8e2f0;
            background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
            box-shadow: 0 24px 58px rgba(16, 33, 61, 0.16);
            padding: 18px 20px 22px;
          }
          .pill {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid #ccd9ec;
            background: #f4f8ff;
            color: #26406e;
            padding: 5px 12px;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
          }
          h1 {
            margin: 12px 0 6px;
            font-size: 34px;
            line-height: 1.02;
            color: #112347;
            font-weight: 800;
          }
          .meta {
            font-size: 13px;
            color: #4b5f83;
            margin-bottom: 12px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 10px;
          }
          .card {
            border: 1px solid #d4deec;
            border-radius: 12px;
            padding: 10px;
            background: #f8fbff;
          }
          .label {
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #5f7494;
            font-weight: 700;
          }
          .value {
            margin-top: 4px;
            color: #13284d;
            font-size: 16px;
            font-weight: 700;
            word-break: break-word;
          }
          .topics {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }
          .topic {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid #c8d7ee;
            background: #eff6ff;
            color: #1d4f91;
            padding: 5px 10px;
            font-size: 12px;
            font-weight: 700;
          }
          .message {
            margin-top: 10px;
            border-radius: 12px;
            border: 1px solid #d9e4f4;
            background: #f7fbff;
            padding: 12px;
            color: #1f355d;
            font-size: 15px;
            white-space: pre-wrap;
          }
          .footer {
            margin-top: 12px;
            font-size: 11px;
            color: #60748f;
            border-top: 1px dashed #cad7ea;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <span class="pill">Žádost z online vizitky</span>
          <h1>${escapeHtml(item.title || "Nová žádost o schůzku")}</h1>
          <div class="meta">Doručeno ${escapeHtml(formatDateTime(item.createdAtMs))}${
            ownerName ? ` • Poradce: <strong>${escapeHtml(ownerName)}</strong>` : ""
          }</div>

          <div class="grid">
            <div class="card">
              <div class="label">Žadatel</div>
              <div class="value">${escapeHtml(requesterName)}</div>
            </div>
            <div class="card">
              <div class="label">Telefon</div>
              <div class="value">${escapeHtml(requesterPhone || "Neuvedeno")}</div>
            </div>
            <div class="card">
              <div class="label">E-mail</div>
              <div class="value">${escapeHtml(requesterEmail || "Neuvedeno")}</div>
            </div>
            <div class="card">
              <div class="label">Vizitka</div>
              <div class="value">${escapeHtml(slug ? `/vizitka/${slug}` : "Neuvedeno")}</div>
            </div>
          </div>

          ${
            topics.length > 0
              ? `<div class="topics">${topics.map((topic) => `<span class="topic">${escapeHtml(topic)}</span>`).join("")}</div>`
              : ""
          }

          <div class="message">${escapeHtml(message || "Žadatel neposlal doplňující zprávu.")}</div>

          <div class="footer">
            ID žádosti: ${escapeHtml(requestId)} • Náhled z notifikačního centra.
          </div>
        </div>
      </body>
    </html>
  `;
};

export const buildMailboxPreviewHtml = (item: MailboxItem): string | null => {
  if (item.type === "production_plan_share") {
    return buildSharedPlanPreviewHtml(item);
  }
  if (item.type === "production_export_share") {
    return buildSharedExportPreviewHtml(item);
  }
  if (item.type === "direct_message") {
    return buildDirectMessagePreviewHtml(item);
  }
  if (item.type === "online_card_meeting_request") {
    return buildOnlineCardMeetingRequestPreviewHtml(item);
  }
  return null;
};
