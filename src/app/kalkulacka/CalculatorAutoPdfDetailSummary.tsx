"use client";

import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CarFront,
  CheckCircle2,
  CircleCheck,
  FileText,
  Fingerprint,
  Gauge,
  IdCard,
  LifeBuoy,
  ScanText,
  ShieldCheck,
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
};

export type AutoPdfDetailSummarySection = "vehicle" | "liability" | "hull" | "addons";

type ItemTone = "vehicle" | "identity" | "protection" | "money" | "service" | "enabled";

const TONE_CLASSES: Record<
  ItemTone,
  {
    icon: string;
  }
> = {
  vehicle: {
    icon: "text-sky-600",
  },
  identity: {
    icon: "text-indigo-600",
  },
  protection: {
    icon: "text-emerald-600",
  },
  money: {
    icon: "text-teal-600",
  },
  service: {
    icon: "text-amber-600",
  },
  enabled: {
    icon: "text-lime-600",
  },
};

const normalizeLabel = (label: string) =>
  label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const getItemVisual = (item: AutoPdfDetailSummaryItem): { icon: LucideIcon; tone: ItemTone } => {
  const normalized = normalizeLabel(item.label);
  const section = item.section ?? inferSection(item.label);

  if (normalized.includes("znacka") || normalized.includes("model")) {
    return { icon: CarFront, tone: "vehicle" };
  }
  if (normalized === "rz") return { icon: ScanText, tone: "identity" };
  if (normalized === "vin") return { icon: Fingerprint, tone: "identity" };
  if (normalized === "orv") return { icon: IdCard, tone: "identity" };
  if (normalized === "tp") return { icon: FileText, tone: "identity" };
  if (normalized.includes("najezd")) return { icon: Gauge, tone: "vehicle" };
  if (normalized.includes("limit odpovednosti")) {
    return { icon: ShieldCheck, tone: "protection" };
  }
  if (
    normalized.includes("pojistna castka") ||
    normalized.includes("limit skel") ||
    normalized.includes("spoluucast")
  ) {
    return { icon: Banknote, tone: "money" };
  }
  if (normalized.includes("asistence")) return { icon: LifeBuoy, tone: "service" };
  if (
    section === "hull" &&
    (normalized.includes("havarie") ||
      normalized === "zivel" ||
      normalized === "odcizeni" ||
      normalized === "vandalismus")
  ) {
    return { icon: ShieldCheck, tone: "protection" };
  }
  if (normalized.includes("servis") || normalized.includes("skla")) {
    return { icon: Wrench, tone: "service" };
  }
  return { icon: CircleCheck, tone: "enabled" };
};

const SECTION_CONFIG: Array<{
  key: AutoPdfDetailSummarySection;
  title: string;
  icon: LucideIcon;
}> = [
  { key: "vehicle", title: "Vozidlo", icon: CarFront },
  { key: "liability", title: "Povinné ručení", icon: ShieldCheck },
  { key: "hull", title: "Havarijní pojištění", icon: Banknote },
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
  return "addons";
};

export function CalculatorAutoPdfDetailSummary({
  items,
}: CalculatorAutoPdfDetailSummaryProps) {
  if (items.length === 0) return null;

  const groupedItems = SECTION_CONFIG.map((section) => ({
    ...section,
    items: items.filter((item) => (item.section ?? inferSection(item.label)) === section.key),
  })).filter((section) => section.items.length > 0);

  return (
    <section className="rounded-[1.15rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-slate-950">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]">
            <CarFront size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="truncate">PDF → detail smlouvy</span>
        </h2>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" />
          {items.length} polí
        </span>
      </div>
      <div className="space-y-4 pt-3">
        {groupedItems.map((section) => {
          const SectionIcon = section.icon;
          return (
            <div key={section.key}>
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase leading-none text-slate-500">
                <SectionIcon size={13} strokeWidth={2.25} aria-hidden="true" />
                <span>{section.title}</span>
              </div>
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {section.items.map((item, index) => {
                  const visual = getItemVisual(item);
                  const tone = TONE_CLASSES[visual.tone];
                  const Icon = visual.icon;

                  return (
                    <div
                      key={`${item.label}-${item.value}-${index}`}
                      className="flex min-w-0 items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0"
                    >
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center ${tone.icon}`}
                      >
                        <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <dt className="text-[10px] font-bold uppercase leading-tight text-slate-500">
                          {item.label}
                        </dt>
                        <dd className="mt-1 break-words text-sm font-semibold leading-snug text-slate-950">
                          {item.value}
                        </dd>
                      </div>
                      {item.sideValue && (
                        <div className="ml-2 shrink-0 text-right">
                          {item.sideLabel && (
                            <div className="text-[9px] font-bold uppercase leading-tight text-slate-500">
                              {item.sideLabel}
                            </div>
                          )}
                          <div className="mt-0.5 whitespace-nowrap text-xs font-bold leading-tight text-slate-950">
                            {item.sideValue}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
