"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  FileText,
  House,
  HousePlus,
  LifeBuoy,
  Pencil,
  Shield,
  Sofa,
} from "lucide-react";

export type DomexPdfDetailSummarySection =
  | "property"
  | "outbuilding"
  | "household"
  | "liability"
  | "assistance"
  | "note";

export type DomexPdfDetailSummaryItem = {
  label: string;
  value: string;
  sideLabel?: string;
  sideValue?: string;
  section: DomexPdfDetailSummarySection;
};

type Props = {
  items: DomexPdfDetailSummaryItem[];
  editor?: ReactNode;
};

const SECTION_CONFIG: Array<{
  key: DomexPdfDetailSummarySection;
  title: string;
  icon: LucideIcon;
}> = [
  { key: "property", title: "Pojištění stavby", icon: House },
  { key: "outbuilding", title: "Vedlejší stavby", icon: HousePlus },
  { key: "household", title: "Pojištění domácnosti", icon: Sofa },
  { key: "liability", title: "Pojištění odpovědnosti", icon: Shield },
  { key: "assistance", title: "Asistence", icon: LifeBuoy },
  { key: "note", title: "Poznámka", icon: FileText },
];

const isPillItem = (item: DomexPdfDetailSummaryItem) =>
  item.value.trim().toLowerCase() === "ano";

export function CalculatorDomexPdfDetailSummary({ items, editor }: Props) {
  const [editing, setEditing] = useState(false);
  const hasEditor = Boolean(editor);
  if (items.length === 0) return null;

  const groupedItems = SECTION_CONFIG.map((section) => ({
    ...section,
    items: items.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  return (
    <section className="rounded-[1.15rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-slate-950">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]">
            <House size={16} strokeWidth={2.25} aria-hidden="true" />
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
                        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"
                      >
                        <CheckCircle2 size={14} strokeWidth={2.35} aria-hidden="true" />
                        <span>{item.label}</span>
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
