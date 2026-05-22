import { formatDateTime, formatFileSize, isSentMailboxItem, nameFromEmail, normalizeEmail, parseMailboxAttachments } from "./postaHelpers";
import type { MailboxItem } from "./postaTypes";

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
  return null;
};
