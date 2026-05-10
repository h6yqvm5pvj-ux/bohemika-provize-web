"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  Download,
  Eye,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Send,
  UserCheck,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
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
import SplitTitle from "./SplitTitle";

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
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareErrorText, setShareErrorText] = useState<string | null>(null);
  const [shareSuccessText, setShareSuccessText] = useState<string | null>(null);
  const shareLookupSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    const unsub = onAuthStateChanged(auth, async (current) => {
      if (!alive) return;
      setUser(current);
      if (!current?.email) {
        setPosition(null);
        setDirectManager(null);
        return;
      }
      try {
        const payload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
          current,
          "/api/user/profile",
          { method: "GET" }
        );
        if (!alive) return;

        const profilePosition = payload?.profile?.position;
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
            current,
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
        setPosition(null);
        setDirectManager(null);
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

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

    const fullName = nameFromEmail(user?.email);
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
                  <p class="title-sub">${fullName} • ${posLabel}</p>
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
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (!opened) {
      setErrorText("Prohlížeč zablokoval otevření nového panelu s náhledem.");
    }
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

  const handleSharePlan = async () => {
    if (!user) return;

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
      <div className="w-full max-w-5xl space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <SplitTitle text="Plán produkce" />
            <p className="text-sm text-slate-600">
              Naplánuj počet smluv a pojistné, spočítej orientační okamžitou
              provizi (pozice: {position ?? "neznámá"}).
            </p>
          </div>
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
            <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Celkem</span>
            <span className="text-base font-semibold text-slate-900">
              {formatMoney(estimates.total)}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlanCard
            title="Životní pojištění"
            premiumLabel="Celkové měsíční pojistné (Kč)"
            tone="emerald"
            contracts={lifeContracts}
            premium={lifePremium}
            onContractsChange={setLifeContracts}
            onPremiumChange={setLifePremium}
            estimate={estimates.life}
          />

          <PlanCard
            title="Auta"
            premiumLabel="Celkové roční pojistné (Kč)"
            tone="sky"
            contracts={autoContracts}
            premium={autoPremium}
            onContractsChange={setAutoContracts}
            onPremiumChange={setAutoPremium}
            estimate={estimates.auto}
          />

          <PlanCard
            title="Majetek"
            premiumLabel="Celkové roční pojistné (Kč)"
            tone="amber"
            contracts={propertyContracts}
            premium={propertyPremium}
            onContractsChange={setPropertyContracts}
            onPremiumChange={setPropertyPremium}
            estimate={estimates.prop}
          />
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] space-y-2">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-sky-400 to-amber-400" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Odhad okamžité provize
              </p>
              <p className="text-sm text-slate-800">
                Součet všech sekcí podle zadaného počtu smluv a pojistného.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Celkem</p>
              <p className="text-2xl font-semibold text-slate-900">
                {formatMoney(estimates.total)}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-[linear-gradient(135deg,#1e293b_0%,#0f172a_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_34px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Eye className="h-4 w-4" />
              {generating ? "Připravuji náhled…" : "Náhled PDF"}
            </button>

            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-700/70 bg-[linear-gradient(135deg,#1d4ed8_0%,#1e293b_100%)] px-6 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_16px_38px_rgba(30,64,175,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(30,64,175,0.38)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {generating ? "Připravuji PDF…" : "Stáhnout PDF"}
            </button>

            <button
              type="button"
              onClick={openShareModal}
              disabled={generating || shareSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-700/75 bg-[linear-gradient(135deg,#059669_0%,#1d4ed8_100%)] px-6 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_16px_38px_rgba(5,150,105,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(5,150,105,0.38)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Odeslat
            </button>
          </div>
        </section>

        {errorText && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
            {errorText}
          </p>
        )}

        {shareSuccessText && (
          <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2">
            {shareSuccessText}
          </p>
        )}

        {position === null && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
            Nepodařilo se načíst tvoji pozici. Odhad provize může být nepřesný.
          </p>
        )}

        <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.1)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(155deg,#f8fafc_0%,#eef5ff_100%)] px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                  Náhled PDF
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Náhled odpovídá tomu, co stáhneš jako PDF.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  A4 • na výšku
                </span>
                {previewGeneratedAt && (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                    Aktualizováno {previewGeneratedAt.toLocaleTimeString("cs-CZ")}
                  </span>
                )}
                {previewHtml && (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenPreviewInNewTab}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Otevřít v kartě
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                    >
                      {previewExpanded ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                      {previewExpanded ? "Zmenšit" : "Rozšířit"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {previewHtml ? (
            <div
              className={`overflow-hidden bg-[radial-gradient(circle_at_14%_8%,rgba(37,99,235,0.1)_0%,transparent_44%),radial-gradient(circle_at_84%_14%,rgba(14,165,233,0.08)_0%,transparent_40%),#f8fafc] p-3 transition-[height] duration-300 sm:p-4 ${
                previewExpanded ? "h-[78vh] min-h-[760px]" : "h-[640px]"
              }`}
            >
              <div className="h-full overflow-hidden rounded-[24px] border border-slate-300/90 bg-white shadow-[0_20px_48px_rgba(15,23,42,0.2)]">
                <div className="flex items-center gap-2 border-b border-[#1e293b] bg-[#0b1220] px-4 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                  <span className="ml-2 truncate rounded bg-[#1f2937] px-2 py-0.5 text-[10px] font-medium text-[#cbd5e1]">
                    Bohemika.App export preview
                  </span>
                </div>
                <iframe
                  srcDoc={previewHtml}
                  title="Náhled PDF Plán produkce"
                  className="h-[calc(100%-38px)] w-full bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="grid min-h-[320px] place-items-center bg-[linear-gradient(160deg,#f8fafc_0%,#ffffff_100%)] px-5 py-12 text-center">
              <div className="max-w-md space-y-2">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <Eye className="h-5 w-5" />
                </div>
                <p className="text-base font-semibold text-slate-900">Náhled zatím není připravený</p>
                <p className="text-sm text-slate-600">
                  Klikni na „Náhled PDF“ a otevře se vizuální kontrola exportu podle aktuálních hodnot.
                </p>
              </div>
            </div>
          )}
        </section>

        {shareModalOpen && (
          <div className="fixed inset-0 z-[90]">
            <button
              type="button"
              aria-label="Zavřít okno odeslání"
              onClick={closeShareModal}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />

            <div className="relative z-[91] flex min-h-full items-center justify-center p-4">
              <section className="w-full max-w-lg rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_78px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                      <Send className="h-3.5 w-3.5" />
                      Odeslat plán
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                      Vyber příjemce
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Vyhledej uživatele podle jména nebo e-mailu a odešli mu plán do pošty.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeShareModal}
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

                  {shareErrorText && (
                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
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
  const toneStyles = {
    emerald: {
      strip: "bg-emerald-400",
      focus: "focus:ring-emerald-500 focus:border-emerald-500",
      metric: "text-emerald-700",
      summaryBorder: "border-emerald-100",
      summaryBg: "bg-emerald-50/40",
    },
    sky: {
      strip: "bg-sky-400",
      focus: "focus:ring-sky-500 focus:border-sky-500",
      metric: "text-sky-700",
      summaryBorder: "border-sky-100",
      summaryBg: "bg-sky-50/40",
    },
    amber: {
      strip: "bg-amber-400",
      focus: "focus:ring-amber-500 focus:border-amber-500",
      metric: "text-amber-700",
      summaryBorder: "border-amber-100",
      summaryBg: "bg-amber-50/40",
    },
  }[tone];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)] space-y-4">
      <span className={`absolute inset-x-0 top-0 h-1 ${toneStyles.strip}`} />
      <div className="pt-1 text-center">
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Počet smluv
        </label>
        <input
          type="number"
          min={0}
          className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xl font-semibold text-slate-900 outline-none focus:ring-2 ${toneStyles.focus}`}
          value={contracts}
          onChange={(e) => onContractsChange(e.target.value)}
          placeholder="např. 5"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          {premiumLabel}
        </label>
        <input
          type="number"
          min={0}
          className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xl font-semibold text-slate-900 outline-none focus:ring-2 ${toneStyles.focus}`}
          value={premium}
          onChange={(e) => onPremiumChange(e.target.value)}
          placeholder="např. 10000"
        />
      </div>

      <div
        className={`rounded-2xl border px-4 py-3 text-sm text-slate-900 space-y-2 ${toneStyles.summaryBorder} ${toneStyles.summaryBg}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Průměr pojistného / smlouva</span>
          <span className="font-semibold text-slate-900">
            {estimate.perContractPremium > 0
              ? formatMoney(estimate.perContractPremium)
              : "—"}
          </span>
        </div>
        <div className="border-t border-slate-200" />
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Okamžitá provize / smlouva</span>
          <span className="font-semibold text-slate-900">
            {estimate.immediatePerContract > 0
              ? formatMoney(estimate.immediatePerContract)
              : "—"}
          </span>
        </div>
        <div className="border-t border-slate-200" />
        <div className="flex items-center justify-between">
          <span className="text-slate-700 font-medium">Celková provize</span>
          <span className={`text-xl font-semibold ${toneStyles.metric}`}>
            {estimate.totalImmediate > 0
              ? formatMoney(estimate.totalImmediate)
              : "—"}
          </span>
        </div>
      </div>
    </section>
  );
}
