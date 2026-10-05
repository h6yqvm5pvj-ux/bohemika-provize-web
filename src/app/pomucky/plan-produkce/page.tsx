"use client";

import { openPreviewWindow } from "@/lib/openPreviewWindow";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  Download,
  CarFront,
  ChartNoAxesCombined,
  Eye,
  ExternalLink,
  FileText,
  HeartPulse,
  House,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Send,
  Target,
  UserCheck,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import {
  formatMoney,
  positionLabel as positionLabelValue,
} from "@/app/lib/formatters";
import {
  calculateNeon,
  calculateKooperativaAuto,
  calculateDomex,
  calculateMaxdomov,
} from "@/app/lib/productFormulas";
import {
  type Position,
  type CommissionResultItemDTO,
} from "@/app/types/domain";
import styles from "./productionPlan.module.css";

// html2pdf lazy load
let html2pdfPromise: Promise<any> | null = null;
async function getHtml2Pdf() {
  if (!html2pdfPromise) {
    html2pdfPromise = import("html2pdf.js").then((mod: unknown) => {
      const m = mod as { default?: unknown } & Record<string, unknown>;
      return m.default ?? m;
    });
  }
  return html2pdfPromise;
}

function parseNumber(text: string): number {
  if (!text) return 0;
  const v = parseFloat(text.replace(",", "."));
  return Number.isNaN(v) ? 0 : v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHARE_EMOJIS = ["🙂", "👏", "🔥", "💪", "🚀", "✅", "🎯"];

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function findImmediate(items: CommissionResultItemDTO[]): number {
  const hit = items.find((it) =>
    (it.title ?? "").toLowerCase().includes("okamžitá")
  );
  return hit?.amount ?? 0;
}

function stripUnsupportedColors(html: string): string {
  return html.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function temporarilyDisableGlobalStyles(exceptNodes: Set<Node>): () => void {
  const toggled: { sheet: StyleSheet; prev: boolean }[] = [];
  const sheets = Array.from(document.styleSheets);
  for (const sheet of sheets) {
    const owner = sheet.ownerNode;
    if (owner && exceptNodes.has(owner)) continue;
    try {
      const prev = (sheet as CSSStyleSheet).disabled;
      (sheet as CSSStyleSheet).disabled = true;
      toggled.push({ sheet, prev });
    } catch {
      // ignore cross-origin
    }
  }
  return () => {
    for (const { sheet, prev } of toggled) {
      try {
        (sheet as CSSStyleSheet).disabled = prev;
      } catch {
        // ignore
      }
    }
  };
}

function positionLabel(pos?: Position | null): string {
  return positionLabelValue(pos, { emptyLabel: "neznámá" });
}

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý uživatel";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.map(cap).join(" ");
}

type BlockEstimate = {
  perContractPremium: number;
  immediatePerContract: number;
  totalImmediate: number;
};

type UserProfileApiResponse = {
  ok?: boolean;
  profile?: {
    fullName?: string | null;
    position?: Position | null;
    managerEmail?: string | null;
  };
};

type UserLookupResponse = {
  ok?: boolean;
  exists?: boolean;
  email?: string | null;
  name?: string | null;
};

type UserSearchResponse = {
  ok?: boolean;
  users?: Array<{
    email?: string;
    name?: string;
    managerEmail?: string | null;
  }>;
  error?: string;
};

type PlanShareResponse = {
  ok?: boolean;
  recipientEmail?: string;
  recipientName?: string;
  written?: number;
  error?: string;
};

type RecipientOption = {
  email: string;
  name: string;
};

export default function PlanProdukcePage() {
  const [user, setUser] = useState<User | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [profileFullName, setProfileFullName] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [directManager, setDirectManager] = useState<RecipientOption | null>(null);

  const [lifeContracts, setLifeContracts] = useState("0");
  const [lifePremium, setLifePremium] = useState("0");

  const [autoContracts, setAutoContracts] = useState("0");
  const [autoPremium, setAutoPremium] = useState("0");

  const [propertyContracts, setPropertyContracts] = useState("0");
  const [propertyPremium, setPropertyPremium] = useState("0");

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewGeneratedAt, setPreviewGeneratedAt] = useState<Date | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareRecipientQuery, setShareRecipientQuery] = useState("");
  const [shareSuggestions, setShareSuggestions] = useState<RecipientOption[]>([]);
  const [shareSuggestionsLoading, setShareSuggestionsLoading] = useState(false);
  const [shareSelectedRecipient, setShareSelectedRecipient] = useState<RecipientOption | null>(null);
  const [shareUseDirectManager, setShareUseDirectManager] = useState(false);
  const [shareMessageText, setShareMessageText] = useState("");
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareErrorText, setShareErrorText] = useState<string | null>(null);
  const [shareSuccessText, setShareSuccessText] = useState<string | null>(null);
  const shareLookupSeq = useRef(0);
  const shareDialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!shareModalOpen) return;
    const previousFocus = document.activeElement;
    shareDialogRef.current?.querySelector<HTMLInputElement>("#plan-share-recipient")?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [shareModalOpen]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    const loadProfile = async () => {
      if (!user || !effectiveEmail) {
        setProfileFullName(null);
        setPosition(null);
        setDirectManager(null);
        return;
      }
      try {
        const payload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
          user,
          "/api/user/profile",
          { method: "GET" }
        );
        if (!alive) return;

        const profilePosition = payload?.profile?.position;
        const fullName =
          typeof payload?.profile?.fullName === "string"
            ? payload.profile.fullName.trim()
            : "";
        setProfileFullName(fullName || null);

        if (typeof profilePosition === "string") {
          setPosition(profilePosition as Position);
        } else {
          setPosition(null);
        }

        const managerEmail = normalizeEmail(payload?.profile?.managerEmail);
        if (!managerEmail) {
          setDirectManager(null);
          return;
        }

        let managerName = nameFromEmail(managerEmail);
        try {
          const lookup = await fetchAuthedJsonOrThrow<UserLookupResponse>(
            user,
            `/api/user/lookup?email=${encodeURIComponent(managerEmail)}`,
            { method: "GET" }
          );
          if (lookup?.exists && typeof lookup.name === "string" && lookup.name.trim().length > 0) {
            managerName = lookup.name.trim();
          }
        } catch (lookupErr) {
          console.warn("Načtení jména přímého nadřízeného selhalo:", lookupErr);
        }

        if (!alive) return;
        setDirectManager({
          email: managerEmail,
          name: managerName,
        });
      } catch (err) {
        console.error("Načtení profilu pro plán produkce selhalo:", err);
        if (!alive) return;
        setProfileFullName(null);
        setPosition(null);
        setDirectManager(null);
      }
    };

    void loadProfile();
    return () => {
      alive = false;
    };
  }, [effectiveEmail, user]);

  const estimates = useMemo(() => {
    const pos = position ?? "poradce1";

    const lifeCount = Math.max(0, parseInt(lifeContracts, 10) || 0);
    const lifePrem = Math.max(0, parseNumber(lifePremium));
    const autoCount = Math.max(0, parseInt(autoContracts, 10) || 0);
    const autoPrem = Math.max(0, parseNumber(autoPremium));
    const propCount = Math.max(0, parseInt(propertyContracts, 10) || 0);
    const propPrem = Math.max(0, parseNumber(propertyPremium));

    const life: BlockEstimate = { perContractPremium: 0, immediatePerContract: 0, totalImmediate: 0 };
    if (lifeCount > 0 && lifePrem > 0) {
      const perContract = lifePrem / lifeCount; // měsíční
      const dto = calculateNeon(perContract, pos);
      const immediate = findImmediate(dto.items) || dto.total;
      life.perContractPremium = perContract;
      life.immediatePerContract = immediate;
      life.totalImmediate = immediate * lifeCount;
    }

    const auto: BlockEstimate = { perContractPremium: 0, immediatePerContract: 0, totalImmediate: 0 };
    if (autoCount > 0 && autoPrem > 0) {
      const perContract = autoPrem / autoCount; // roční
      const dto = calculateKooperativaAuto(perContract, "annual", pos);
      const immediate = findImmediate(dto.items) || dto.total;
      auto.perContractPremium = perContract;
      auto.immediatePerContract = immediate;
      auto.totalImmediate = immediate * autoCount;
    }

    const prop: BlockEstimate = { perContractPremium: 0, immediatePerContract: 0, totalImmediate: 0 };
    if (propCount > 0 && propPrem > 0) {
      const perContract = propPrem / propCount; // roční
      const domex = calculateDomex(perContract, "annual", pos);
      const maxdom = calculateMaxdomov(perContract, "annual", pos);
      const domImmediate = findImmediate(domex.items) || domex.total;
      const maxImmediate = findImmediate(maxdom.items) || maxdom.total;
      const avgImmediate = (domImmediate + maxImmediate) / 2;
      prop.perContractPremium = perContract;
      prop.immediatePerContract = avgImmediate;
      prop.totalImmediate = avgImmediate * propCount;
    }

    const total =
      life.totalImmediate + auto.totalImmediate + prop.totalImmediate;

    return { life, auto, prop, total, lifeCount, autoCount, propCount };
  }, [
    position,
    lifeContracts,
    lifePremium,
    autoContracts,
    autoPremium,
    propertyContracts,
    propertyPremium,
  ]);

  const buildPdfHtml = (): { html: string; filename: string } => {
    const now = new Date();
    const dateLabel = now.toLocaleString("cs-CZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const fullName = profileFullName || nameFromEmail(effectiveEmail);
    const posLabel = positionLabel(position);

    const planRows = [
      {
        title: "Životní pojištění",
        contracts: estimates.lifeCount,
        premium: lifePremium,
      },
      {
        title: "Auta",
        contracts: estimates.autoCount,
        premium: autoPremium,
      },
      {
        title: "Majetek",
        contracts: estimates.propCount,
        premium: propertyPremium,
      },
    ];

    const provizeRows = [
      {
        title: "Životní pojištění (NEON)",
        contracts: estimates.lifeCount,
        per: estimates.life.immediatePerContract,
        total: estimates.life.totalImmediate,
      },
      {
        title: "Auta (průměr Auto)",
        contracts: estimates.autoCount,
        per: estimates.auto.immediatePerContract,
        total: estimates.auto.totalImmediate,
      },
      {
        title: "Majetek (DOMEX / MAXDOMOV průměr)",
        contracts: estimates.propCount,
        per: estimates.prop.immediatePerContract,
        total: estimates.prop.totalImmediate,
      },
    ];

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            :root {
              --ink: #10213d;
              --line: #d8e2f0;
              --navy: #112347;
              --blue: #2e6eff;
            }
            body {
              margin: 0;
              padding: 30px 0;
              background: linear-gradient(155deg, #edf3fb 0%, #f8fbff 55%, #eef4fc 100%);
              font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
              color: var(--ink);
              -webkit-font-smoothing: antialiased;
            }
            .page {
              width: 760px;
              margin: 0 auto;
              background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
              border-radius: 28px;
              border: 1px solid var(--line);
              box-shadow:
                0 26px 76px rgba(16, 33, 61, 0.14),
                0 1px 0 rgba(255, 255, 255, 0.9) inset;
              padding: 22px 26px 28px;
              position: relative;
              overflow: hidden;
            }
            .page::before {
              content: "";
              position: absolute;
              right: -120px;
              top: -120px;
              width: 280px;
              height: 280px;
              border-radius: 999px;
              background: radial-gradient(circle at center, rgba(46,110,255,0.20) 0%, rgba(46,110,255,0) 72%);
              pointer-events: none;
            }
            .page-topbar {
              position: relative;
              z-index: 1;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 14px;
            }
            .topbar-pill {
              display: inline-flex;
              align-items: center;
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
            .topbar-meta {
              font-size: 10px;
              color: #6a7a96;
              letter-spacing: 0.03em;
              font-weight: 600;
            }
            .page-header {
              position: relative;
              z-index: 1;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 12px;
              margin-bottom: 14px;
            }
            .brand-head {
              display: flex;
              align-items: center;
              gap: 12px;
              min-width: 0;
            }
            .logo {
              width: 58px;
              height: 58px;
              border-radius: 16px;
              background: linear-gradient(165deg, #ffffff 0%, #ecf3ff 100%);
              border: 1px solid #ccd9ec;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow:
                0 10px 26px rgba(16, 33, 61, 0.14),
                0 1px 0 rgba(255,255,255,0.9) inset;
              flex-shrink: 0;
            }
            .logo img {
              max-width: 36px;
              max-height: 36px;
            }
            .title h1 {
              margin: 0;
              font-size: 42px;
              line-height: 0.95;
              font-family: "Avenir Next Condensed", "Avenir Next", "Segoe UI", sans-serif;
              letter-spacing: 0.01em;
              color: var(--navy);
              font-weight: 700;
            }
            .title-sub {
              margin: 4px 0 0;
              font-size: 12px;
              color: #3f5270;
              letter-spacing: 0.04em;
              font-weight: 600;
            }
            .title-tags {
              margin-top: 8px;
              display: flex;
              flex-wrap: wrap;
              gap: 7px;
            }
            .title-tag {
              display: inline-flex;
              align-items: center;
              border-radius: 999px;
              padding: 5px 10px;
              border: 1px solid #d7e3f4;
              background: #f5f9ff;
              color: #294775;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
            .title-tag-accent {
              background: linear-gradient(135deg, #264da3 0%, #1d3277 100%);
              border-color: #213f89;
              color: #ffffff;
            }
            .total-kpi {
              flex-shrink: 0;
              min-width: 220px;
              border-radius: 16px;
              border: 1px solid #cfdced;
              background: linear-gradient(155deg, #f6faff 0%, #eef5ff 100%);
              box-shadow: 0 12px 30px rgba(23, 48, 94, 0.10);
              padding: 10px 12px;
              text-align: right;
            }
            .kpi-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.09em;
              color: #5d7090;
              font-weight: 700;
            }
            .kpi-value {
              margin-top: 4px;
              color: #112347;
              font-size: 34px;
              letter-spacing: 0.01em;
              font-weight: 800;
              font-family: "Avenir Next Condensed", "Avenir Next", "Segoe UI", sans-serif;
            }
            .card {
              margin-top: 12px;
              padding: 14px 15px;
              border-radius: 16px;
              border: 1px solid #cfdced;
              background: linear-gradient(170deg, #ffffff 0%, #f8fbff 100%);
              box-shadow:
                0 12px 30px rgba(15, 30, 58, 0.09),
                0 1px 0 rgba(255,255,255,0.9) inset;
            }
            .card-title {
              margin: 0 0 8px;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: #13284d;
              font-weight: 800;
              display: inline-flex;
              align-items: center;
              gap: 7px;
            }
            .card-title::before {
              content: "";
              width: 8px;
              height: 8px;
              border-radius: 999px;
              background: linear-gradient(135deg, #2e6eff 0%, #8eb0ff 100%);
              box-shadow: 0 0 0 4px rgba(46,110,255,0.15);
            }
            .rows {
              display: grid;
              gap: 2px;
            }
            .row {
              display: grid;
              align-items: center;
              gap: 8px;
              font-size: 13px;
              padding: 6px 0;
            }
            .row-3 {
              grid-template-columns: minmax(0, 1fr) 120px 178px;
            }
            .row-4 {
              grid-template-columns: minmax(0, 1fr) 110px 140px 150px;
            }
            .row.header {
              text-transform: uppercase;
              letter-spacing: 0.08em;
              font-weight: 700;
              color: #64748b;
              border-bottom: 1px solid #dbe5f2;
              padding-bottom: 7px;
              margin-bottom: 2px;
              font-size: 10px;
            }
            .cell-key {
              display: flex;
              align-items: center;
              gap: 8px;
              color: #1b3154;
              min-width: 0;
            }
            .tone-dot {
              width: 8px;
              height: 8px;
              border-radius: 999px;
              flex-shrink: 0;
              box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.06);
            }
            .tone-life { background: #0f9f6e; }
            .tone-auto { background: #2e6eff; }
            .tone-property { background: #c78b1f; }
            .align-right { text-align: right; }
            .strong {
              font-weight: 800;
              color: #142949;
              font-family: "Avenir Next Condensed", "Avenir Next", "Segoe UI", sans-serif;
              font-size: 18px;
            }
            .total {
              display: flex;
              justify-content: space-between;
              margin-top: 10px;
              padding-top: 9px;
              border-top: 1px solid #dbe5f2;
              font-size: 14px;
              font-weight: 800;
              color: #10284b;
            }
            .hint {
              font-size: 10px;
              color: #60748f;
              margin-top: 7px;
              line-height: 1.45;
              border-top: 1px dashed #cad7ea;
              padding-top: 7px;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="page-topbar">
              <span class="topbar-pill">Bohemika.App interní report</span>
              <span class="topbar-meta">Vygenerováno ${dateLabel}</span>
            </div>

            <div class="page-header">
              <div class="brand-head">
                <div class="logo">
                  <img src="/icons/bohemika_logo.png" alt="Bohemika logo" />
                </div>
                <div class="title">
                  <h1>Plán produkce</h1>
                  <p class="title-sub">${escapeHtml(fullName)} • ${escapeHtml(posLabel)}</p>
                  <div class="title-tags">
                    <span class="title-tag">Měsíční plán</span>
                    <span class="title-tag title-tag-accent">Okamžitá provize</span>
                  </div>
                </div>
              </div>

              <div class="total-kpi">
                <div class="kpi-label">Odhad celkové okamžité provize</div>
                <div class="kpi-value">${formatMoney(estimates.total)}</div>
              </div>
            </div>

            <div class="card">
              <h2 class="card-title">Souhrn vstupních sekcí</h2>
              <div class="rows">
                <div class="row row-3 header">
                  <div>Sekce</div>
                  <div class="align-right">Počet smluv</div>
                  <div class="align-right">Celkové pojistné</div>
                </div>
                ${planRows
                  .map((r, idx) => {
                    const premiumValue = parseNumber(r.premium);
                    const hasPremium = premiumValue > 0;
                    const toneClass =
                      idx === 0 ? "tone-life" : idx === 1 ? "tone-auto" : "tone-property";
                    return `
                    <div class="row row-3">
                      <div class="cell-key">
                        <span class="tone-dot ${toneClass}"></span>
                        <span>${r.title}</span>
                      </div>
                      <div class="align-right">${r.contracts}</div>
                      <div class="align-right strong">${hasPremium ? formatMoney(premiumValue) : "—"}</div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>

            <div class="card">
              <h2 class="card-title">Odpovídající provize</h2>
              <div class="rows">
                <div class="row row-4 header">
                  <div>Produkt</div>
                  <div class="align-right">Počet smluv</div>
                  <div class="align-right">Provize / smlouva</div>
                  <div class="align-right">Celkem</div>
                </div>
                ${provizeRows
                  .map((r, idx) => {
                    const has = r.contracts > 0 && r.total > 0;
                    const toneClass =
                      idx === 0 ? "tone-life" : idx === 1 ? "tone-auto" : "tone-property";
                    return `
                      <div class="row row-4">
                        <div class="cell-key">
                          <span class="tone-dot ${toneClass}"></span>
                          <span>${r.title}</span>
                        </div>
                        <div class="align-right">${r.contracts}</div>
                        <div class="align-right">${has ? formatMoney(r.per) : "—"}</div>
                        <div class="align-right strong">${has ? formatMoney(r.total) : "—"}</div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
              <div class="total">
                <span>Celkem</span>
                <span>${formatMoney(estimates.total)}</span>
              </div>
              <div class="hint">
                Odhad provize je orientační: život dle NEON (měsíční), auta průměr z auto produktů, majetek průměr DOMEX a MAXDOMOV.
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const filename = `plan_produkce_${now.toISOString().slice(0, 10)}.pdf`;
    return { html, filename };
  };

  const handleGeneratePdf = async () => {
    if (!user) return;
    setGenerating(true);
    setErrorText(null);
    let cleanup: (() => void) | null = null;
    try {
      const { html, filename } = buildPdfHtml();
      const safeHtml = stripUnsupportedColors(html);
      const html2pdf = await getHtml2Pdf();
      const parser = new DOMParser();
      const parsed = parser.parseFromString(safeHtml, "text/html");

      const styleEl = parsed.querySelector("style");
      const pageEl = parsed.querySelector(".page");

      const wrapper = document.createElement("div");
      wrapper.style.position = "fixed";
      wrapper.style.inset = "-10000px";
      wrapper.style.width = "0";
      wrapper.style.height = "0";
      wrapper.style.overflow = "hidden";

      if (styleEl) wrapper.appendChild(styleEl);
      if (pageEl) wrapper.appendChild(pageEl);
      document.body.appendChild(wrapper);

      const element = pageEl;
      if (!element) {
        wrapper.remove();
        throw new Error("Nepodařilo se připravit obsah PDF.");
      }

      const except = new Set<Node>(styleEl ? [styleEl] : []);
      const reenable = temporarilyDisableGlobalStyles(except);
      cleanup = () => {
        reenable();
        wrapper.remove();
      };

      const opt: any = {
        margin: [10, 10, 10, 10],
        filename,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          onclone: (doc: Document) => {
            doc
              .querySelectorAll("link[rel='stylesheet']")
              .forEach((n) => n.remove());
            doc.querySelectorAll("style").forEach((n) => {
              const text = n.textContent ?? "";
              if (/(oklch|lab)\(/i.test(text)) n.remove();
            });
          },
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      };
      await (html2pdf() as any).from(element).set(opt).save();
      cleanup();
      cleanup = null;
    } catch (e) {
      console.error("Chyba při generování PDF", e);
      setErrorText("PDF se nepodařilo vygenerovat. Zkus to prosím znovu.");
    } finally {
      setGenerating(false);
      if (cleanup) cleanup();
    }
  };

  const handlePreview = () => {
    const { html } = buildPdfHtml();
    setPreviewHtml(stripUnsupportedColors(html));
    setPreviewGeneratedAt(new Date());
  };

  const handleOpenPreviewInNewTab = () => {
    if (!previewHtml || typeof window === "undefined") return;
    const opened = openPreviewWindow();
    if (!opened) {
      setErrorText("Prohlížeč zablokoval otevření nového panelu s náhledem.");
      return;
    }
    setErrorText(null);
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    opened.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  useEffect(() => {
    if (!shareModalOpen) {
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      return;
    }
    if (shareUseDirectManager) {
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      return;
    }
    if (!user) {
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      return;
    }

    const query = shareRecipientQuery.trim();
    if (query.length < 2) {
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      return;
    }

    const seq = ++shareLookupSeq.current;
    const timeoutId = window.setTimeout(async () => {
      setShareSuggestionsLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(query)}`,
          { method: "GET" }
        );
        if (seq !== shareLookupSeq.current) return;

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
        setShareSuggestions(nextSuggestions);
      } catch (err) {
        console.error("Načtení našeptávání příjemců selhalo:", err);
        if (seq !== shareLookupSeq.current) return;
        setShareSuggestions([]);
      } finally {
        if (seq === shareLookupSeq.current) {
          setShareSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [shareModalOpen, shareUseDirectManager, shareRecipientQuery, user]);

  const openShareModal = () => {
    shareLookupSeq.current += 1;
    setShareModalOpen(true);
    setShareErrorText(null);
    setShareRecipientQuery("");
    setShareSelectedRecipient(null);
    setShareSuggestions([]);
    setShareSuggestionsLoading(false);
    setShareUseDirectManager(false);
    setShareMessageText("");
  };

  const closeShareModal = () => {
    if (shareSubmitting) return;
    shareLookupSeq.current += 1;
    setShareModalOpen(false);
    setShareSuggestions([]);
    setShareSuggestionsLoading(false);
    setShareUseDirectManager(false);
    setShareSelectedRecipient(null);
    setShareRecipientQuery("");
    setShareErrorText(null);
    setShareMessageText("");
  };

  const handleSelectSuggestion = (recipient: RecipientOption) => {
    setShareUseDirectManager(false);
    setShareSelectedRecipient(recipient);
    setShareRecipientQuery(`${recipient.name} <${recipient.email}>`);
    setShareSuggestions([]);
    setShareErrorText(null);
  };

  const handleToggleDirectManager = (nextChecked: boolean) => {
    shareLookupSeq.current += 1;
    setShareUseDirectManager(nextChecked);
    setShareErrorText(null);
    if (nextChecked) {
      setShareSuggestions([]);
      if (directManager) {
        setShareSelectedRecipient(directManager);
        setShareRecipientQuery(`${directManager.name} <${directManager.email}>`);
      } else {
        setShareSelectedRecipient(null);
      }
      return;
    }

    setShareSelectedRecipient(null);
    setShareRecipientQuery("");
  };

  const appendShareEmoji = (emoji: string) => {
    setShareMessageText((prev) => `${prev}${emoji}`);
  };

  const handleSharePlan = async () => {
    if (!user) return;
    if (!effectiveEmail || effectiveUserEmail(user.email) !== effectiveEmail) {
      setShareErrorText("Přepnutí uživatele se změnilo. Plán odešli znovu.");
      return;
    }

    let recipient: RecipientOption | null = shareUseDirectManager
      ? directManager
      : shareSelectedRecipient;
    if (!recipient && !shareUseDirectManager) {
      const exactEmail = normalizeEmail(shareRecipientQuery);
      if (exactEmail && EMAIL_RE.test(exactEmail)) {
        const exactMatch = shareSuggestions.find((row) => row.email === exactEmail);
        if (exactMatch) {
          recipient = exactMatch;
        }
      }
    }

    if (!recipient?.email) {
      setShareErrorText("Vyber prosím příjemce ze seznamu návrhů nebo zvol přímého nadřízeného.");
      return;
    }

    setShareSubmitting(true);
    setShareErrorText(null);
    setShareSuccessText(null);

    try {
      const payload = await fetchAuthedJsonOrThrow<PlanShareResponse>(
        user,
        "/api/plan-produkce/share",
        {
          method: "POST",
          body: JSON.stringify({
            recipientEmail: recipient.email,
            noteText: shareMessageText,
            plan: {
              lifeContracts: estimates.lifeCount,
              lifePremium: parseNumber(lifePremium),
              autoContracts: estimates.autoCount,
              autoPremium: parseNumber(autoPremium),
              propertyContracts: estimates.propCount,
              propertyPremium: parseNumber(propertyPremium),
              totalImmediate: estimates.total,
            },
          }),
        }
      );

      const sentName =
        typeof payload?.recipientName === "string" && payload.recipientName.trim().length > 0
          ? payload.recipientName.trim()
          : recipient.name;
      setShareSuccessText(`Plán byl odeslán uživateli ${sentName}.`);
      setShareModalOpen(false);
      setShareUseDirectManager(false);
      setShareSelectedRecipient(null);
      setShareRecipientQuery("");
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      setShareMessageText("");
    } catch (err: any) {
      setShareErrorText(err?.message || "Plán se nepodařilo odeslat.");
    } finally {
      setShareSubmitting(false);
    }
  };

  if (!user) {
    return (
      <AppLayout active="tools">
        <div className="w-full max-w-4xl mx-auto">
          <p className="text-sm text-slate-800">
            Přihlas se, abys mohl plánovat produkci.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}><ChartNoAxesCombined size={14} aria-hidden="true" />Obchod · Pomůcky</p>
            <h1>Plán produkce<span>.</span></h1>
            <p className={styles.heroDescription}>Proměň svoje cíle v konkrétní čísla. Naplánuj smlouvy a podívej se na orientační provizi.</p>
            <div className={styles.heroMeta}>
              <span><Target size={14} aria-hidden="true" />Tvoje pozice: <strong>{positionLabel(position)}</strong></span>
              <span><FileText size={14} aria-hidden="true" />Náhled, PDF a sdílení</span>
            </div>
          </div>
          <svg className={styles.heroArt} viewBox="0 0 230 150" fill="none" aria-hidden="true">
            <ellipse cx="118" cy="78" rx="104" ry="66" fill="#f3edf8" />
            <path d="M39 121h155" stroke="#d8c9e4" strokeWidth="2" strokeLinecap="round" />
            <rect x="53" y="91" width="29" height="30" rx="5" fill="#d7c4e6" />
            <rect x="97" y="64" width="29" height="57" rx="5" fill="#bca0d1" />
            <rect x="141" y="33" width="29" height="88" rx="5" fill="#9772af" />
            <path d="m53 71 44-27 39-19m-9-1 11-1-3 11" stroke="#a588ba" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="184" cy="105" r="24" fill="white" stroke="#e1d5ea" strokeWidth="3" />
            <circle cx="184" cy="105" r="15" stroke="#a886bd" strokeWidth="2" />
            <circle cx="184" cy="105" r="7" fill="#e6d8f0" />
            <path d="m184 105 17-17m-7-1h8v8" stroke="#7c598f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </header>

        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>01 · Sestav svůj plán</p><h2>Tři oblasti. Jeden přehled.</h2></div>
          <span><span className={styles.liveDot} />Odhad se přepočítává průběžně</span>
        </div>
        <div className={styles.cards}>
          <PlanCard title="Životní pojištění" premiumLabel="Celkové měsíční pojistné" tone="emerald"
            contracts={lifeContracts} premium={lifePremium} onContractsChange={setLifeContracts}
            onPremiumChange={setLifePremium} estimate={estimates.life} />
          <PlanCard title="Auta" premiumLabel="Celkové roční pojistné" tone="sky"
            contracts={autoContracts} premium={autoPremium} onContractsChange={setAutoContracts}
            onPremiumChange={setAutoPremium} estimate={estimates.auto} />
          <PlanCard title="Majetek" premiumLabel="Celkové roční pojistné" tone="amber"
            contracts={propertyContracts} premium={propertyPremium} onContractsChange={setPropertyContracts}
            onPremiumChange={setPropertyPremium} estimate={estimates.prop} />
        </div>

        <section className={styles.summary} aria-label="Souhrn plánu">
          <div className={styles.total}>
            <p className={styles.eyebrow}>Odhad okamžité provize</p>
            <p className={styles.totalAmount} data-plan-total>{formatMoney(estimates.total)}</p>
            <p className={styles.totalCaption}>{estimates.lifeCount + estimates.autoCount + estimates.propCount} smluv v plánu · {positionLabel(position)}</p>
          </div>
          <div className={styles.mix}>
            <h3>Rozložení provize</h3>
            {[
              { label: "Život", amount: estimates.life.totalImmediate, tone: "emerald" },
              { label: "Auta", amount: estimates.auto.totalImmediate, tone: "sky" },
              { label: "Majetek", amount: estimates.prop.totalImmediate, tone: "amber" },
            ].map(item => <div key={item.tone} className={styles.mixRow} data-tone={item.tone}>
              <span>{item.label}</span>
              <span className={styles.mixTrack} aria-hidden="true"><span style={{ width: `${estimates.total > 0 ? item.amount / estimates.total * 100 : 0}%` }} /></span>
              <strong>{formatMoney(item.amount)}</strong>
            </div>)}
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={handleGeneratePdf} disabled={generating} className={styles.primaryButton}>
              {generating ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              {generating ? "Připravuji PDF…" : "Stáhnout PDF"}
            </button>
            <div>
              <button type="button" onClick={handlePreview} disabled={generating} className={styles.secondaryButton}><Eye size={15} aria-hidden="true" />Náhled PDF</button>
              <button type="button" onClick={openShareModal} disabled={generating || shareSubmitting} className={styles.secondaryButton}><Send size={15} aria-hidden="true" />Odeslat</button>
            </div>
          </div>
        </section>
        <p className={styles.estimateNote}><Info size={15} aria-hidden="true" />Orientační odhad: život podle NEON, auta podle Kooperativy, majetek jako průměr DOMEX a MAXDOMOV. Závisí na tvé pozici.</p>

        {errorText && (
          <p role="alert" className={styles.warning}>
            {errorText}
          </p>
        )}

        {shareSuccessText && (
          <p role="status" className={styles.success}>
            {shareSuccessText}
          </p>
        )}

        {position === null && (
          <p role="status" className={styles.warning}>
            Nepodařilo se načíst tvoji pozici. Odhad provize může být nepřesný.
          </p>
        )}

        <section className={styles.preview} aria-labelledby="production-preview-heading">
          <div className={styles.previewHeader}>
            <div><p className={styles.eyebrow}>02 · Připraveno ke sdílení</p><h2 id="production-preview-heading">Náhled tvého plánu</h2><p>Zkontroluj plán před stažením nebo odesláním.</p></div>
            <div className={styles.previewTools}>
              <span className={styles.previewBadge}>A4 · na výšku</span>
              {previewGeneratedAt && <span className={styles.previewBadge}>Aktualizováno {previewGeneratedAt.toLocaleTimeString("cs-CZ")}</span>}
              {previewHtml && <>
                <button type="button" onClick={handleOpenPreviewInNewTab} className={styles.secondaryButton}><ExternalLink size={14} aria-hidden="true" />Otevřít v kartě</button>
                <button type="button" onClick={() => setPreviewExpanded(prev => !prev)} className={styles.secondaryButton} aria-expanded={previewExpanded}>
                  {previewExpanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}{previewExpanded ? "Zmenšit" : "Rozšířit"}
                </button>
              </>}
            </div>
          </div>
          {previewHtml ? <div className={styles.previewViewport} data-expanded={previewExpanded}>
            <iframe srcDoc={previewHtml} title="Náhled PDF Plán produkce" className={styles.previewFrame} sandbox="" />
          </div> : <div className={styles.previewEmpty}>
            <div className={styles.emptyDocument} aria-hidden="true"><FileText size={27} strokeWidth={1.3} /><i /><i /><i /></div>
            <div><h3>Tvůj plán má zatím prázdný list.</h3><p>Doplň smlouvy a pojistné. Tlačítkem „Náhled PDF“ si zobrazíš připravený dokument.</p></div>
            <button type="button" onClick={handlePreview} disabled={generating} className={styles.secondaryButton}><Eye size={15} aria-hidden="true" />Zobrazit náhled</button>
          </div>}
        </section>

        {shareModalOpen && (
          <div className={styles.shareOverlay}>
            <button
              type="button"
              aria-label="Zavřít okno odeslání"
              onClick={closeShareModal}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />

            <div className="relative z-[91] flex min-h-full items-center justify-center p-4">
              <section ref={shareDialogRef} className={styles.shareDialog} role="dialog" aria-modal="true" aria-labelledby="plan-share-title"
                onKeyDown={event => {
                  if (event.key === "Escape") { event.preventDefault(); closeShareModal(); }
                  if (event.key !== "Tab") return;
                  const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]');
                  const first = controls[0];
                  const last = controls[controls.length - 1];
                  if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
                  if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
                }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                      <Send className="h-3.5 w-3.5" />
                      Odeslat plán
                    </div>
                    <h3 id="plan-share-title" className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                      Vyber příjemce
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Vyhledej uživatele podle jména nebo e-mailu a odešli mu plán do pošty.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeShareModal}
                    aria-label="Zavřít odeslání plánu"
                    disabled={shareSubmitting}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="plan-share-recipient"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Příjemce
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="plan-share-recipient"
                        type="text"
                        value={shareRecipientQuery}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setShareRecipientQuery(nextValue);
                          setShareUseDirectManager(false);
                          setShareSelectedRecipient(null);
                          setShareErrorText(null);
                        }}
                        placeholder="Jméno nebo e-mail"
                        autoComplete="off"
                        className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                      {shareSuggestionsLoading ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
                      ) : null}
                    </div>

                    {!shareUseDirectManager && shareSuggestions.length > 0 && (
                      <div className="max-h-52 overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_14px_30px_rgba(15,23,42,0.1)]">
                        {shareSuggestions.map((option) => (
                          <button
                            key={option.email}
                            type="button"
                            onClick={() => handleSelectSuggestion(option)}
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
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                    {directManager ? (
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={shareUseDirectManager}
                          onChange={(e) => handleToggleDirectManager(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                            <UserCheck className="h-4 w-4 text-emerald-700" />
                            Přímý nadřízený
                          </span>
                          <span className="ml-1">{directManager.name}</span>
                          <span className="ml-1 text-xs text-slate-500">
                            ({directManager.email})
                          </span>
                        </span>
                      </label>
                    ) : (
                      <p className="text-xs text-slate-600">
                        Přímý nadřízený není v profilu nastaven.
                      </p>
                    )}
                  </div>

                  {(shareUseDirectManager ? directManager : shareSelectedRecipient) && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
                      <span className="font-semibold text-emerald-900">Vybraný příjemce:</span>{" "}
                      <span className="text-emerald-900">
                        {(shareUseDirectManager ? directManager : shareSelectedRecipient)?.name}
                      </span>
                      <span className="text-emerald-700">
                        {" "}
                        ({(shareUseDirectManager ? directManager : shareSelectedRecipient)?.email})
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label
                      htmlFor="plan-share-message"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Text zprávy (volitelné)
                    </label>
                    <textarea
                      id="plan-share-message"
                      value={shareMessageText}
                      onChange={(e) => setShareMessageText(e.target.value)}
                      rows={3}
                      maxLength={240}
                      placeholder="Napiš krátký vzkaz k plánu…"
                      className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Emoji:</span>
                      {SHARE_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => appendShareEmoji(emoji)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base transition hover:border-slate-300 hover:bg-slate-50"
                          aria-label={`Přidat emoji ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {shareErrorText && (
                    <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                      {shareErrorText}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeShareModal}
                      disabled={shareSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSharePlan()}
                      disabled={shareSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#1d4ed8_100%)] px-4 py-2 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {shareSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {shareSubmitting ? "Odesílám…" : "Odeslat"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PlanCard({
  title,
  premiumLabel,
  tone,
  contracts,
  premium,
  onContractsChange,
  onPremiumChange,
  estimate,
}: {
  title: string;
  premiumLabel: string;
  tone: "emerald" | "sky" | "amber";
  contracts: string;
  premium: string;
  onContractsChange: (v: string) => void;
  onPremiumChange: (v: string) => void;
  estimate: BlockEstimate;
}) {
  const fieldId = useId();
  const Icon = tone === "emerald" ? HeartPulse : tone === "sky" ? CarFront : House;
  const description = tone === "emerald" ? "Měsíční pojistné · NEON" : tone === "sky" ? "Roční pojistné · Kooperativa" : "Roční pojistné · DOMEX / MAXDOMOV";

  return <section className={styles.planCard} data-tone={tone} aria-labelledby={`${fieldId}-heading`}>
    <header className={styles.cardHeader}>
      <span className={styles.productIcon}><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></span>
      <div><h3 id={`${fieldId}-heading`}>{title}</h3><p>{description}</p></div>
    </header>
    <div className={styles.cardFields}>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-contracts`}>Počet smluv</label>
        <div><input id={`${fieldId}-contracts`} type="number" min={0} value={contracts} onChange={e => onContractsChange(e.target.value)} placeholder="např. 5" /><span aria-hidden="true">smluv</span></div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-premium`}>{premiumLabel} (Kč)</label>
        <div><input id={`${fieldId}-premium`} type="number" min={0} value={premium} onChange={e => onPremiumChange(e.target.value)} placeholder="např. 10000" /><span aria-hidden="true">Kč</span></div>
      </div>
    </div>
    <dl className={styles.cardMetrics}>
      <div><dt>Průměr pojistného / smlouva</dt><dd>{estimate.perContractPremium > 0 ? formatMoney(estimate.perContractPremium) : "—"}</dd></div>
      <div><dt>Okamžitá provize / smlouva</dt><dd>{estimate.immediatePerContract > 0 ? formatMoney(estimate.immediatePerContract) : "—"}</dd></div>
      <div className={styles.cardTotal}><dt>Celková provize</dt><dd>{estimate.totalImmediate > 0 ? formatMoney(estimate.totalImmediate) : "—"}</dd></div>
    </dl>
  </section>;
}
