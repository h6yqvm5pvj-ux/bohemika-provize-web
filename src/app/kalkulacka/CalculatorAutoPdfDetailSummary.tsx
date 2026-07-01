"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CarFront,
  CheckCircle2,
  LifeBuoy,
  Pencil,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";

export type AutoPdfDetailSummaryItem = {
  label: string;
  value: string;
  sideLabel?: string;
  sideValue?: string;
  section?: AutoPdfDetailSummarySection;
};

type CalculatorAutoPdfDetailSummaryProps = {
  items: AutoPdfDetailSummaryItem[];
  hullSumPrompt?: AutoPdfHullSumPrompt | null;
  editor?: ReactNode;
};

export type AutoPdfDetailSummarySection =
  | "vehicle"
  | "liability"
  | "hull"
  | "assistance"
  | "addons";

export type AutoPdfHullSumPrompt = {
  amountText: string;
  canUseUsualPrice: boolean;
  usualPriceSelected: boolean;
  onAmountTextChange: (value: string) => void;
  onAmountTextBlur?: () => void;
  onUsualPriceChange: (value: boolean) => void;
};

const normalizeLabel = (label: string) =>
  label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const SECTION_CONFIG: Array<{
  key: AutoPdfDetailSummarySection;
  title: string;
  icon: LucideIcon;
}> = [
  { key: "vehicle", title: "Vozidlo", icon: CarFront },
  { key: "liability", title: "Povinné ručení", icon: ShieldCheck },
  { key: "hull", title: "Havarijní pojištění", icon: Banknote },
  { key: "assistance", title: "Asistence", icon: LifeBuoy },
  { key: "addons", title: "Připojištění", icon: Wrench },
];

const inferSection = (label: string): AutoPdfDetailSummarySection => {
  const normalized = normalizeLabel(label);
  if (
    normalized.includes("znacka") ||
    normalized === "rz" ||
    normalized === "vin" ||
    normalized === "orv" ||
    normalized === "tp" ||
    normalized.includes("najezd") ||
    normalized.includes("rozsah")
  ) {
    return "vehicle";
  }
  if (normalized.includes("limit odpovednosti")) return "liability";
  if (
    normalized.includes("havar") ||
    normalized.includes("spoluucast") ||
    normalized === "odcizeni" ||
    normalized === "zivel" ||
    normalized === "vandalismus"
  ) {
    return "hull";
  }
  if (normalized.includes("asistence")) return "assistance";
  return "addons";
};

const isPillItem = (item: AutoPdfDetailSummaryItem) => item.value.trim().toLowerCase() === "ano";

export function CalculatorAutoPdfDetailSummary({
  items,
  hullSumPrompt,
  editor,
}: CalculatorAutoPdfDetailSummaryProps) {
  const [editing, setEditing] = useState(false);
  const showHullSumPrompt = Boolean(hullSumPrompt);
  const hasEditor = Boolean(editor);
  if (items.length === 0 && !showHullSumPrompt) return null;

  const groupedItems = SECTION_CONFIG.map((section) => ({
    ...section,
    items: items.filter((item) => (item.section ?? inferSection(item.label)) === section.key),
  })).filter((section) => section.items.length > 0 || (section.key === "hull" && showHullSumPrompt));

  return (
    <section className="rounded-[1.15rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-slate-950">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]">
            <CarFront size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="truncate">PDF → detail smlouvy</span>
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {hasEditor && (
            <button
              type="button"
              onClick={() => setEditing((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                editing
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {editing ? (
                <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" />
              ) : (
                <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />
              )}
              {editing ? "Hotovo" : "Upravit"}
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
            <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" />
            {items.length} polí
          </span>
        </div>
      </div>
      {editing && editor ? (
        editor
      ) : (
      <div className="space-y-4 pt-3">
        {groupedItems.map((section) => {
          const SectionIcon = section.icon;
          return (
            <div key={section.key}>
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase leading-none text-slate-500">
                <SectionIcon size={13} strokeWidth={2.25} aria-hidden="true" />
                <span>{section.title}</span>
              </div>
              {section.key === "hull" && hullSumPrompt && (
                <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <TriangleAlert
                      size={16}
                      strokeWidth={2.25}
                      className="mt-0.5 shrink-0 text-amber-700"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <div className="text-xs font-bold text-amber-900">
                          Chybí pojistná částka havarijního pojištění
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium leading-snug text-amber-800">
                          Doplň částku v Kč
                          {hullSumPrompt.canUseUsualPrice
                            ? " nebo označ obvyklou cenu vozidla."
                            : "."}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Havarijní pojistná částka</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={hullSumPrompt.amountText}
                            disabled={hullSumPrompt.usualPriceSelected}
                            onChange={(e) => hullSumPrompt.onAmountTextChange(e.target.value)}
                            onBlur={hullSumPrompt.onAmountTextBlur}
                            className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-amber-100/60 disabled:text-slate-500"
                            placeholder="Částka v Kč"
                          />
                        </label>
                        {hullSumPrompt.canUseUsualPrice && (
                          <label className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-900">
                            <input
                              type="checkbox"
                              checked={hullSumPrompt.usualPriceSelected}
                              onChange={(e) =>
                                hullSumPrompt.onUsualPriceChange(e.target.checked)
                              }
                              className="h-4 w-4 accent-amber-600"
                            />
                            Obvyklá cena vozidla
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {section.items.some((item) => !isPillItem(item)) && (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {section.items
                    .filter((item) => !isPillItem(item))
                    .map((item, index) => (
                      <div key={`${item.label}-${item.value}-${index}`} className="min-w-0">
                        <dt className="mb-1 block text-[10px] font-bold uppercase leading-tight text-slate-500">
                          {item.label}
                        </dt>
                        <dd className="flex min-h-9 items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-2.5 py-2 text-sm font-semibold leading-snug text-slate-950 shadow-[0_3px_10px_rgba(15,23,42,0.025)]">
                          <span className="min-w-0 break-words">{item.value}</span>
                          {item.sideValue && (
                            <span className="shrink-0 text-right">
                              {item.sideLabel && (
                                <span className="block text-[9px] font-bold uppercase leading-tight text-slate-500">
                                  {item.sideLabel}
                                </span>
                              )}
                              <span className="block whitespace-nowrap text-xs font-bold leading-tight text-slate-950">
                                {item.sideValue}
                              </span>
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
              {section.items.some(isPillItem) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {section.items.filter(isPillItem).map((item, index) => (
                    <div
                      key={`${item.label}-${item.value}-${index}`}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ${
                        item.sideValue ? "rounded-2xl py-2" : ""
                      }`}
                    >
                      <CheckCircle2 size={14} strokeWidth={2.35} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.sideValue && (
                        <span className="ml-1 border-l border-emerald-200 pl-2 text-left">
                          {item.sideLabel && (
                            <span className="block text-[9px] uppercase leading-tight text-emerald-700/80">
                              {item.sideLabel}
                            </span>
                          )}
                          <span className="block whitespace-nowrap text-xs text-emerald-950">
                            {item.sideValue}
                          </span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
