"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Download, Eye } from "lucide-react";

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
  };
};

export default function PlanProdukcePage() {
  const [user, setUser] = useState<User | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const [lifeContracts, setLifeContracts] = useState("0");
  const [lifePremium, setLifePremium] = useState("0");

  const [autoContracts, setAutoContracts] = useState("0");
  const [autoPremium, setAutoPremium] = useState("0");

  const [propertyContracts, setPropertyContracts] = useState("0");
  const [propertyPremium, setPropertyPremium] = useState("0");

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (current) => {
      setUser(current);
      if (!current?.email) {
        setPosition(null);
        return;
      }
      try {
        const payload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
          current,
          "/api/user/profile",
          { method: "GET" }
        );
        const profilePosition = payload?.profile?.position;
        if (typeof profilePosition === "string") {
          setPosition(profilePosition as Position);
        } else {
          setPosition(null);
        }
      } catch (err) {
        console.error("Načtení profilu pro plán produkce selhalo:", err);
        setPosition(null);
      }
    });
    return () => unsub();
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
            body {
              margin: 0;
              padding: 24px 0;
              background: #eef2ff;
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
              color: #0f172a;
            }
            .page {
              width: 760px;
              margin: 0 auto;
              background: #f8fbff;
              border-radius: 22px;
              border: 1px solid #d7e1f3;
              box-shadow: 0 24px 70px rgba(15,23,42,0.18);
              padding: 24px 26px 28px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            }
            .title h1 { margin: 0; font-size: 22px; letter-spacing: 0.02em; }
            .title p { margin: 2px 0 0; font-size: 12px; color: #475569; }
            .card {
              margin-top: 12px;
              padding: 14px 16px;
              border-radius: 16px;
              background: linear-gradient(135deg,#ffffff,#f5f7fb);
              border: 1px solid #d7e1f3;
              box-shadow: 0 12px 40px rgba(15,23,42,0.12);
            }
            .rows { display: grid; gap: 8px; }
            .row {
              display: grid;
              grid-template-columns: 1fr 120px 120px 120px;
              gap: 8px;
              font-size: 12px;
              align-items: center;
            }
            .row.header {
              text-transform: uppercase;
              letter-spacing: 0.08em;
              font-weight: 700;
              color: #64748b;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
              margin-bottom: 4px;
            }
            .row strong { font-weight: 700; }
            .total {
              display: flex;
              justify-content: space-between;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid #e2e8f0;
              font-size: 13px;
              font-weight: 700;
            }
            .hint { font-size: 11px; color: #475569; margin-top: 6px; }
          </style>
        </head>
        <body>
            <div class="page">
              <div class="header">
                <div class="title">
                  <h1>Plán produkce</h1>
                  <p>${fullName} • ${posLabel} • ${dateLabel}</p>
                </div>
                <div style="text-align:right">
                  <div style="font-size:11px;color:#475569;">Odhad celkové okamžité provize</div>
                  <div style="font-size:18px;font-weight:700;">${formatMoney(estimates.total)}</div>
                </div>
              </div>

            <div class="card">
              <div class="row header">
                <div>Sekce</div>
                <div style="text-align:right">Počet smluv</div>
                <div style="text-align:right">Celkové pojistné</div>
              </div>
              <div class="rows">
                ${planRows
                  .map(
                    (r) => `
                    <div class="row">
                      <div>${r.title}</div>
                      <div style="text-align:right">${r.contracts}</div>
                      <div style="text-align:right;font-weight:700">${r.premium && Number(r.premium) > 0 ? formatMoney(parseNumber(r.premium)) : "—"}</div>
                    </div>
                  `
                  )
                  .join("")}
              </div>
            </div>

            <div class="card" style="margin-top:12px;">
              <div class="row header">
                <div>Odpovídající provize</div>
                <div style="text-align:right">Počet smluv</div>
                <div style="text-align:right">Provize / smlouva</div>
                <div style="text-align:right">Celkem</div>
              </div>
              <div class="rows">
                ${provizeRows
                  .map((r) => {
                    const has = r.contracts > 0 && r.total > 0;
                    return `
                      <div class="row">
                        <div>${r.title}</div>
                        <div style="text-align:right">${r.contracts}</div>
                        <div style="text-align:right">${has ? formatMoney(r.per) : "—"}</div>
                        <div style="text-align:right;font-weight:700">${has ? formatMoney(r.total) : "—"}</div>
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

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={handlePreview}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-7 py-2.5 text-sm sm:text-base font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Eye className="h-4 w-4" />
            {generating ? "Připravuji PDF…" : "Náhled PDF"}
          </button>
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-8 py-2.5 text-sm sm:text-base font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition hover:bg-slate-950 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            {generating ? "Generuji PDF…" : "Vygenerovat PDF"}
          </button>
        </div>

        {errorText && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
            {errorText}
          </p>
        )}

        {position === null && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
            Nepodařilo se načíst tvoji pozici. Odhad provize může být nepřesný.
          </p>
        )}

        {previewHtml && (
          <section className="mt-2 relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] space-y-3">
            <span className="absolute inset-x-0 top-0 h-1 bg-slate-900" />
            <h2 className="text-sm font-semibold text-slate-900">
              Náhled PDF
            </h2>
            <p className="text-xs text-slate-600">
              Náhled odpovídá tomu, co stáhneš jako PDF.
            </p>
            <div className="mt-2 h-[640px] rounded-2xl border border-slate-200 overflow-hidden bg-white">
              <iframe
                srcDoc={previewHtml}
                title="Náhled PDF Plán produkce"
                className="w-full h-full bg-white"
              />
            </div>
          </section>
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
