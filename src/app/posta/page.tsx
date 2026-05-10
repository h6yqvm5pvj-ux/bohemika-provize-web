"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Space_Grotesk } from "next/font/google";
import {
  CheckCheck,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Smile,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { AppLayout } from "@/components/AppLayout";
import styles from "./postaWall.module.css";

type MailboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string;
  read: boolean;
  createdAtMs: number | null;
  readAtMs: number | null;
  metadata?: Record<string, unknown> | null;
};

type MailboxResponse = {
  ok: boolean;
  unreadCount?: number;
  items?: MailboxItem[];
  error?: string;
};

type MailboxPatchResponse = {
  ok: boolean;
  unreadCount?: number;
  error?: string;
};

type MailboxDeleteResponse = {
  ok: boolean;
  deleted?: number;
  unreadCount?: number;
  error?: string;
};

type MailboxSharedPreviewResponse = {
  ok?: boolean;
  html?: string;
  error?: string;
};

type RecipientOption = {
  email: string;
  name: string;
};

type UserSearchResponse = {
  ok?: boolean;
  users?: Array<{
    email?: string | null;
    name?: string | null;
    managerEmail?: string | null;
  }>;
  error?: string;
};

type MailboxComposeResponse = {
  ok?: boolean;
  recipientName?: string;
  recipientEmail?: string;
  attachments?: number;
  error?: string;
};

type MailFilterMode = "all" | "unread" | "sent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPOSE_SUBJECT_MAX_LEN = 160;
const COMPOSE_MESSAGE_MAX_LEN = 4000;
const COMPOSE_FILES_MAX_COUNT = 6;
const QUICK_EMOJIS = ["🙂", "👏", "🔥", "💪", "🚀", "✅", "🎯", "👀", "🙏", "✨", "📎", "💬"];

const mailFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const formatDateTime = (ms: number | null): string => {
  if (!ms || !Number.isFinite(ms)) return "Neznámý čas";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "Neznámý čas";
  }
};

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

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length > 0
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part
    )
    .join(" ");
};

type MailboxAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

const parseMailboxAttachments = (item: MailboxItem): MailboxAttachment[] => {
  const raw = item.metadata && Array.isArray(item.metadata.attachments) ? item.metadata.attachments : [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      if (!name || !url) return null;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `${name}-${url}`;
      const contentType =
        typeof row.contentType === "string" && row.contentType.trim()
          ? row.contentType.trim()
          : "application/octet-stream";
      const sizeBytes =
        typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes) ? Math.max(0, row.sizeBytes) : 0;
      return { id, name, url, contentType, sizeBytes } satisfies MailboxAttachment;
    })
    .filter((entry): entry is MailboxAttachment => entry !== null);
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

const buildMailboxPreviewHtml = (item: MailboxItem): string | null => {
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

const isSentMailboxItem = (item: MailboxItem): boolean =>
  Boolean(item.metadata && item.metadata.mailboxDirection === "sent");

const sentRecipientText = (item: MailboxItem): string => {
  const recipientName =
    item.metadata && typeof item.metadata.recipientName === "string"
      ? item.metadata.recipientName.trim()
      : "";
  const recipientEmail =
    item.metadata && typeof item.metadata.recipientEmail === "string"
      ? item.metadata.recipientEmail.trim()
      : "";
  if (recipientName && recipientEmail) return `Příjemce: ${recipientName} (${recipientEmail})`;
  if (recipientName) return `Příjemce: ${recipientName}`;
  if (recipientEmail) return `Příjemce: ${recipientEmail}`;
  return "";
};

export default function PostaPage() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MailboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mailFilter, setMailFilter] = useState<MailFilterMode>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<MailboxItem | null>(null);
  const [sharedExportPreviewHtml, setSharedExportPreviewHtml] = useState<string | null>(null);
  const [sharedExportPreviewLoading, setSharedExportPreviewLoading] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeErrorText, setComposeErrorText] = useState<string | null>(null);
  const [composeRecipientQuery, setComposeRecipientQuery] = useState("");
  const [composeSelectedRecipient, setComposeSelectedRecipient] = useState<RecipientOption | null>(null);
  const [composeSuggestions, setComposeSuggestions] = useState<RecipientOption[]>([]);
  const [composeSuggestionsLoading, setComposeSuggestionsLoading] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessageText, setComposeMessageText] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const composeLookupSeq = useRef(0);
  const composeFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      setUser(null);
      setAuthReady(true);
    }, 5000);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setUser(fbUser ?? null);
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

  const loadMailbox = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthedJsonOrThrow<MailboxResponse>(
        currentUser,
        "/api/mailbox?limit=80",
        { method: "GET" }
      );
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(
        typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount)
          ? Math.max(0, Math.floor(data.unreadCount))
          : 0
      );
    } catch (err: any) {
      setError(err?.message || "Poštu se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }
    void loadMailbox();

    const intervalId = window.setInterval(() => {
      void loadMailbox();
    }, 45_000);

    const onFocus = () => {
      void loadMailbox();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, user]);

  const receivedItems = useMemo(() => items.filter((item) => !isSentMailboxItem(item)), [items]);
  const sentItems = useMemo(() => items.filter(isSentMailboxItem), [items]);

  const visibleItems = useMemo(() => {
    if (mailFilter === "sent") {
      return sentItems;
    }
    if (mailFilter === "unread") {
      return receivedItems.filter((item) => !item.read);
    }
    return receivedItems;
  }, [mailFilter, receivedItems, sentItems]);

  useEffect(() => {
    if (!composeModalOpen || !user) {
      setComposeSuggestions([]);
      setComposeSuggestionsLoading(false);
      return;
    }

    const query = composeRecipientQuery.trim();
    if (query.length < 2) {
      setComposeSuggestions([]);
      setComposeSuggestionsLoading(false);
      return;
    }

    const seq = ++composeLookupSeq.current;
    const timeoutId = window.setTimeout(async () => {
      setComposeSuggestionsLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(query)}`,
          { method: "GET" }
        );
        if (seq !== composeLookupSeq.current) return;

        const rows = Array.isArray(payload?.users) ? payload.users : [];
        const nextSuggestions = rows
          .map((row) => {
            const email = normalizeEmail(row.email);
            if (!email) return null;
            const name =
              typeof row.name === "string" && row.name.trim().length > 0
                ? row.name.trim()
                : nameFromEmail(email);
            return { email, name } satisfies RecipientOption;
          })
          .filter((row): row is RecipientOption => row !== null);
        setComposeSuggestions(nextSuggestions);
      } catch (err) {
        console.error("Načtení našeptávání příjemce v poště selhalo:", err);
        if (seq !== composeLookupSeq.current) return;
        setComposeSuggestions([]);
      } finally {
        if (seq === composeLookupSeq.current) {
          setComposeSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [composeModalOpen, composeRecipientQuery, user]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const mailboxPreviewHtml = useMemo(() => {
    if (!previewItem) return null;
    if (previewItem.type === "production_export_share" && sharedExportPreviewHtml) {
      return sharedExportPreviewHtml;
    }
    return buildMailboxPreviewHtml(previewItem);
  }, [previewItem, sharedExportPreviewHtml]);

  const closePreviewModal = () => {
    setPreviewItem(null);
    setSharedExportPreviewHtml(null);
    setSharedExportPreviewLoading(false);
  };

  const markItemsRead = async (ids: string[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser || ids.length === 0) return;
    setSaving(true);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify({ ids }),
        }
      );
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id)
            ? { ...item, read: true, readAtMs: item.readAtMs ?? Date.now() }
            : item
        )
      );
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      }
    } catch (err: any) {
      setError(err?.message || "Nepodařilo se označit zprávu jako přečtenou.");
    } finally {
      setSaving(false);
    }
  };

  const markAllRead = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || unreadCount <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify({ markAllRead: true }),
        }
      );
      setItems((prev) => prev.map((item) => ({ ...item, read: true, readAtMs: item.readAtMs ?? Date.now() })));
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      } else {
        setUnreadCount(0);
      }
    } catch (err: any) {
      setError(err?.message || "Nepodařilo se označit zprávy jako přečtené.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMailboxItems = async (ids: string[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser || ids.length === 0) return;

    setDeletingIds((prev) => [...new Set([...prev, ...ids])]);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxDeleteResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        }
      );
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      }
      if (previewItem && ids.includes(previewItem.id)) {
        closePreviewModal();
      }
    } catch (err: any) {
      setError(err?.message || "Nepodařilo se smazat zprávu.");
    } finally {
      setDeletingIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const selectedVisibleCount = useMemo(
    () => selectedIds.filter((id) => visibleItemIds.includes(id)).length,
    [selectedIds, visibleItemIds]
  );
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;

  const toggleSelectAllVisible = () => {
    if (visibleItems.length === 0) return;
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleItemIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleItemIds])]);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    await deleteMailboxItems(idsToDelete);
    setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
  };

  const openComposeModal = () => {
    composeLookupSeq.current += 1;
    setComposeModalOpen(true);
    setComposeErrorText(null);
    setComposeRecipientQuery("");
    setComposeSelectedRecipient(null);
    setComposeSuggestions([]);
    setComposeSuggestionsLoading(false);
    setComposeSubject("");
    setComposeMessageText("");
    setComposeFiles([]);
    if (composeFileInputRef.current) composeFileInputRef.current.value = "";
  };

  const closeComposeModal = (force = false) => {
    if (composeSubmitting && !force) return;
    composeLookupSeq.current += 1;
    setComposeModalOpen(false);
    setComposeErrorText(null);
    setComposeSuggestions([]);
    setComposeSuggestionsLoading(false);
    setComposeSelectedRecipient(null);
    setComposeRecipientQuery("");
    setComposeSubject("");
    setComposeMessageText("");
    setComposeFiles([]);
    if (composeFileInputRef.current) composeFileInputRef.current.value = "";
  };

  const handleSelectComposeSuggestion = (recipient: RecipientOption) => {
    setComposeSelectedRecipient(recipient);
    setComposeRecipientQuery(`${recipient.name} <${recipient.email}>`);
    setComposeSuggestions([]);
    setComposeErrorText(null);
  };

  const appendComposeEmoji = (emoji: string) => {
    setComposeMessageText((prev) => `${prev}${emoji}`);
  };

  const handleComposeFilesChange = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const current = new Map(composeFiles.map((file) => [`${file.name}-${file.size}`, file]));
    Array.from(list).forEach((file) => {
      current.set(`${file.name}-${file.size}`, file);
    });
    const merged = [...current.values()].slice(0, COMPOSE_FILES_MAX_COUNT);
    setComposeFiles(merged);
    if (composeFileInputRef.current) composeFileInputRef.current.value = "";
  };

  const removeComposeFile = (targetKey: string) => {
    setComposeFiles((prev) => prev.filter((file) => `${file.name}-${file.size}` !== targetKey));
  };

  const handleComposeSend = async () => {
    if (!user) return;

    let recipient = composeSelectedRecipient;
    if (!recipient) {
      const exactEmail = normalizeEmail(composeRecipientQuery);
      if (exactEmail && EMAIL_RE.test(exactEmail)) {
        recipient = composeSuggestions.find((option) => option.email === exactEmail) ?? null;
      }
    }
    if (!recipient) {
      setComposeErrorText("Vyber příjemce z našeptávače.");
      return;
    }

    const subject = composeSubject.trim();
    if (!subject) {
      setComposeErrorText("Doplň předmět zprávy.");
      return;
    }

    const messageText = composeMessageText.trim();
    if (!messageText && composeFiles.length === 0) {
      setComposeErrorText("Doplň text zprávy nebo přilož soubor.");
      return;
    }

    const formData = new FormData();
    formData.set("recipientEmail", recipient.email);
    formData.set("subject", subject.slice(0, COMPOSE_SUBJECT_MAX_LEN));
    formData.set("text", messageText.slice(0, COMPOSE_MESSAGE_MAX_LEN));
    composeFiles.forEach((file) => {
      formData.append("files", file);
    });

    setComposeSubmitting(true);
    setComposeErrorText(null);
    try {
      await fetchAuthedJsonOrThrow<MailboxComposeResponse>(user, "/api/mailbox/compose", {
        method: "POST",
        body: formData,
      });
      closeComposeModal(true);
      await loadMailbox();
    } catch (err: any) {
      setComposeErrorText(err?.message || "Zprávu se nepodařilo odeslat.");
    } finally {
      setComposeSubmitting(false);
    }
  };

  const openItem = async (item: MailboxItem) => {
    if (!item.read) {
      await markItemsRead([item.id]);
    }
    if (item.type === "direct_message") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      return;
    }
    if (item.type === "production_plan_share") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      return;
    }
    if (item.type === "production_export_share") {
      setPreviewItem(item);
      setSharedExportPreviewHtml(null);
      const payloadId =
        item.metadata && typeof item.metadata.payloadId === "string"
          ? item.metadata.payloadId.trim()
          : "";
      if (!payloadId) {
        setSharedExportPreviewLoading(false);
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setSharedExportPreviewLoading(false);
        return;
      }

      setSharedExportPreviewLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<MailboxSharedPreviewResponse>(
          currentUser,
          `/api/mailbox/shared-preview?payloadId=${encodeURIComponent(payloadId)}`,
          { method: "GET" }
        );
        const html = typeof payload?.html === "string" ? payload.html : "";
        if (html.trim()) {
          setSharedExportPreviewHtml(html);
        }
      } catch (err) {
        console.error("Načtení 1:1 sdíleného náhledu exportu selhalo:", err);
      } finally {
        setSharedExportPreviewLoading(false);
      }
      return;
    }
    window.location.href = item.deepLink || "/nastaveni";
  };

  useEffect(() => {
    if (!previewItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewItem(null);
        setSharedExportPreviewHtml(null);
        setSharedExportPreviewLoading(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewItem]);

  useEffect(() => {
    if (!composeModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (composeSubmitting) return;
        composeLookupSeq.current += 1;
        setComposeModalOpen(false);
        setComposeErrorText(null);
        setComposeSuggestions([]);
        setComposeSuggestionsLoading(false);
        setComposeSelectedRecipient(null);
        setComposeRecipientQuery("");
        setComposeSubject("");
        setComposeMessageText("");
        setComposeFiles([]);
        if (composeFileInputRef.current) composeFileInputRef.current.value = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composeModalOpen, composeSubmitting]);

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="text-sm text-slate-700">Načítám přihlášení…</div>
      </main>
    );
  }

  if (!user) {
    return <AppLayout active="home">{null}</AppLayout>;
  }

  return (
    <AppLayout active="home">
      <div className={`${mailFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className={styles.canvas} aria-hidden="true">
          <span className={`${styles.orb} ${styles.orbA}`} />
          <span className={`${styles.orb} ${styles.orbB}`} />
          <span className={`${styles.orb} ${styles.orbC}`} />
          <span className={styles.mesh} />
          <span className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl min-w-0 space-y-5 text-slate-900">
          <section
            className={`${styles.heroPanel} rounded-[34px] border border-white/70 bg-white/74 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-6`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">
                  <Mail className="h-3.5 w-3.5" />
                  Pošta
                </div>

                <div>
                  <h1 className="text-3xl font-bold tracking-[-0.02em] text-slate-900 sm:text-4xl">
                    Notifikační centrum
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
                    Přehled novinek z týmu, intranetu a reportů na jednom místě.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Nepřečtené: <strong>{unreadCount}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Přijaté zprávy: <strong>{receivedItems.length}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Odeslané: <strong>{sentItems.length}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={openComposeModal}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-indigo-700/70 bg-[linear-gradient(135deg,#1d4ed8_0%,#3730a3_100%)] px-4 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_14px_32px_rgba(59,130,246,0.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <SquarePen className="h-4 w-4" />
                  Napsat zprávu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((prev) => {
                      const next = !prev;
                      if (!next) setSelectedIds([]);
                      return next;
                    });
                  }}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectMode
                      ? "border-indigo-700/70 bg-[linear-gradient(135deg,#1d4ed8_0%,#3730a3_100%)] text-white shadow-[0_14px_32px_rgba(59,130,246,0.3)]"
                      : "border-slate-300/90 bg-white/95 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white"
                  }`}
                >
                  Označit
                </button>
                <button
                  type="button"
                  onClick={() => void loadMailbox()}
                  disabled={loading || saving}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-slate-300/90 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Obnovit
                </button>
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={saving || unreadCount <= 0}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-4 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_14px_32px_rgba(16,185,129,0.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <CheckCheck className="h-4 w-4" />
                  Vše přečteno
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/65 bg-white/74 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.13)] backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-2xl border border-slate-300/85 bg-white/90 p-1">
                <button
                  type="button"
                  onClick={() => setMailFilter("all")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "all"
                      ? "bg-slate-900 text-zinc-50 shadow-[0_6px_16px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  Všechny zprávy
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("unread")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "unread"
                      ? "bg-slate-900 text-zinc-50 shadow-[0_6px_16px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  Jen nepřečtené
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("sent")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "sent"
                      ? "bg-slate-900 text-zinc-50 shadow-[0_6px_16px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  Odeslané
                </button>
              </div>

              <div className="rounded-full border border-slate-300/85 bg-white/85 px-3 py-1 text-xs text-slate-600">
                Zobrazeno: <strong className="text-slate-800">{visibleItems.length}</strong>
              </div>
            </div>

            {selectMode ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-900">
                  Označeno: {selectedVisibleCount}/{visibleItems.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={visibleItems.length === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allVisibleSelected ? "Odznačit vše" : "Označit vše"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    disabled={selectedIds.length === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Vyčistit výběr
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSelected()}
                    disabled={selectedIds.length === 0 || deletingIds.length > 0}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Smazat označené
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-200/90 bg-rose-50/95 px-3 py-2 text-sm text-rose-700 shadow-[0_8px_20px_rgba(251,113,133,0.15)]">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-[92px] animate-pulse rounded-[24px] border border-slate-200/85 bg-slate-100/80"
                  />
                ))}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 px-6 py-10 text-center shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 shadow-[0_10px_28px_rgba(14,165,233,0.22)]">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Schránka je čistá</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                  Ve vybraném filtru zatím nejsou žádné zprávy.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleItems.map((item, index) => {
                  const isSent = isSentMailboxItem(item);
                  const sentTo = isSent ? sentRecipientText(item) : "";
                  const deleting = deletingIds.includes(item.id);
                  const attachments = item.type === "direct_message" ? parseMailboxAttachments(item) : [];

                  return (
                    <div
                      key={item.id}
                      className={`${styles.mailCard} group relative w-full overflow-hidden rounded-[24px] border p-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 ${
                        item.read
                          ? "border-slate-200/85 bg-white/92 hover:border-slate-300"
                          : "border-sky-200/90 bg-sky-50/88 hover:border-sky-300"
                      }`}
                      style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 w-1.5 ${
                          item.read ? "bg-slate-200" : "bg-[linear-gradient(180deg,#0ea5e9_0%,#22c55e_100%)]"
                        }`}
                        aria-hidden="true"
                      />

                      <div className="flex items-start justify-between gap-3 pl-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectMode) {
                              toggleSelected(item.id);
                              return;
                            }
                            void openItem(item);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            {selectMode ? (
                              <span
                                className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[11px] font-bold ${
                                  selectedIds.includes(item.id)
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-slate-400 bg-white text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                            ) : null}
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${
                                item.read ? "bg-slate-300" : "bg-sky-500"
                              }`}
                            />
                            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                              {item.title}
                            </p>
                            {isSent && (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700">
                                Odeslané
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.body}</p>
                          {attachments.length > 0 ? (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                              <Paperclip className="h-3.5 w-3.5" />
                              {attachments.length} {attachments.length === 1 ? "příloha" : "příloh"}
                            </p>
                          ) : null}
                          {sentTo ? (
                            <p className="mt-1 text-xs text-indigo-700">{sentTo}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500">{formatDateTime(item.createdAtMs)}</p>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void deleteMailboxItems([item.id])}
                            disabled={deleting}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deleting ? "Mažu…" : "Smazat"}
                          </button>
                          {!selectMode ? (
                            <button
                              type="button"
                              onClick={() => void openItem(item)}
                              className="rounded-full border border-slate-300 bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 transition group-hover:border-slate-400 group-hover:text-slate-900"
                            >
                              Otevřít
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {composeModalOpen && (
          <div className="fixed inset-0 z-[95]">
            <button
              type="button"
              aria-label="Zavřít psaní zprávy"
              onClick={() => closeComposeModal()}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            />

            <div className="relative z-[96] flex min-h-full items-center justify-center p-4">
              <section className="w-full max-w-2xl rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_78px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-800">
                      <SquarePen className="h-3.5 w-3.5" />
                      Napsat zprávu
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                      Nová zpráva
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Vyber příjemce dle jména nebo e-mailu a pošli interní zprávu.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => closeComposeModal()}
                    disabled={composeSubmitting}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="compose-recipient"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Příjemce
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="compose-recipient"
                        type="text"
                        value={composeRecipientQuery}
                        onChange={(event) => {
                          setComposeRecipientQuery(event.target.value);
                          setComposeSelectedRecipient(null);
                          setComposeErrorText(null);
                        }}
                        placeholder="Jméno nebo e-mail"
                        autoComplete="off"
                        className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                      {composeSuggestionsLoading ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
                      ) : null}
                    </div>

                    {composeSuggestions.length > 0 && (
                      <div className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_14px_30px_rgba(15,23,42,0.1)]">
                        {composeSuggestions.map((option) => (
                          <button
                            key={option.email}
                            type="button"
                            onClick={() => handleSelectComposeSuggestion(option)}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {option.name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {option.email}
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                              Vybrat
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {composeSelectedRecipient ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
                        <span className="font-semibold text-emerald-900">Vybraný příjemce:</span>{" "}
                        <span className="text-emerald-900">{composeSelectedRecipient.name}</span>
                        <span className="text-emerald-700"> ({composeSelectedRecipient.email})</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="compose-subject"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Předmět
                    </label>
                    <input
                      id="compose-subject"
                      type="text"
                      value={composeSubject}
                      onChange={(event) => {
                        setComposeSubject(event.target.value.slice(0, COMPOSE_SUBJECT_MAX_LEN));
                        setComposeErrorText(null);
                      }}
                      placeholder="Např. Shrnutí týdne"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <p className="text-right text-[11px] text-slate-500">
                      {composeSubject.length}/{COMPOSE_SUBJECT_MAX_LEN}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="compose-message"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Text
                    </label>
                    <textarea
                      id="compose-message"
                      rows={5}
                      value={composeMessageText}
                      onChange={(event) => {
                        setComposeMessageText(event.target.value.slice(0, COMPOSE_MESSAGE_MAX_LEN));
                        setComposeErrorText(null);
                      }}
                      placeholder="Napiš zprávu…"
                      className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          <Smile className="h-3.5 w-3.5" />
                          Emoji
                        </span>
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => appendComposeEmoji(emoji)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                            aria-label={`Přidat emoji ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {composeMessageText.length}/{COMPOSE_MESSAGE_MAX_LEN}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Příloha
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
                        <Paperclip className="h-4 w-4" />
                        Přidat soubor
                        <input
                          ref={composeFileInputRef}
                          type="file"
                          multiple
                          onChange={(event) => handleComposeFilesChange(event.target.files)}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-slate-500">
                        Max {COMPOSE_FILES_MAX_COUNT} souborů
                      </span>
                    </div>

                    {composeFiles.length > 0 ? (
                      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                        {composeFiles.map((file) => {
                          const key = `${file.name}-${file.size}`;
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="min-w-0 truncate text-sm text-slate-700">
                                {file.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  {formatFileSize(file.size)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeComposeFile(key)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                                  aria-label={`Odebrat ${file.name}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {composeErrorText ? (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {composeErrorText}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => closeComposeModal()}
                      disabled={composeSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleComposeSend()}
                      disabled={composeSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#1d4ed8_100%)] px-4 py-2 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {composeSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {composeSubmitting ? "Odesílám…" : "Odeslat"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {previewItem && mailboxPreviewHtml && (
          <div className="fixed inset-0 z-[90]">
            <button
              type="button"
              aria-label="Zavřít náhled"
              onClick={closePreviewModal}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            />

            <div className="relative z-[91] flex min-h-full items-center justify-center p-4">
              <section className="w-full max-w-[980px] overflow-hidden rounded-[30px] border border-[#9fb2cf] bg-[#d3dae5] shadow-[0_30px_82px_rgba(15,23,42,0.4)]">
                <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(130deg,#020617_0%,#031633_62%,#00153a_100%)] px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#fb7185]" />
                    <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
                    <span className="h-3 w-3 rounded-full bg-[#22c55e]" />
                    <span className="truncate font-mono text-[12px] font-medium tracking-[0.01em] text-[#f8fafc]">
                      Bohemka.App náhled
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={closePreviewModal}
                    aria-label="Zavřít náhled"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/20 text-white shadow-[0_6px_14px_rgba(2,6,23,0.35)] transition hover:bg-white/30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-[78vh] min-h-[560px] bg-[#d3dae5] p-0">
                  {previewItem.type === "production_export_share" && sharedExportPreviewLoading ? (
                    <div className="grid h-full place-items-center text-sm font-medium text-slate-700">
                      Načítám přesný náhled exportu…
                    </div>
                  ) : (
                    <iframe
                      srcDoc={mailboxPreviewHtml}
                      title={
                        previewItem.type === "production_export_share"
                          ? "Náhled sdíleného exportu produkce"
                          : previewItem.type === "production_plan_share"
                          ? "Náhled sdíleného plánu produkce"
                          : "Náhled zprávy"
                      }
                      className="h-full w-full bg-white"
                    />
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
