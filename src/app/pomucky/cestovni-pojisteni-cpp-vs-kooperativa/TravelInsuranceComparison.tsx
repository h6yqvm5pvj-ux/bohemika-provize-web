"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  Anchor,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  X,
  Activity,
  Bike,
  Briefcase,
  CarFront,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Files,
  FileText,
  Info,
  Loader2,
  Luggage,
  PawPrint,
  Plane,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Trophy,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { HelpDialog } from "@/components/HelpDialog";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedBlobOrThrow } from "@/app/lib/authenticatedApi";
import { secureDocumentPath } from "@/app/lib/secureDocuments";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromInsurerName,
} from "@/app/lib/institutionLogoDisplay";

import {
  AXA_VARIANTS, CPP_VARIANTS, KOOP_VARIANTS, COMPARISON_SECTIONS, DOCUMENT_GROUPS,
  buildRows, formatMoney,
  type AxaVariantKey, type CppVariantKey, type KoopVariantKey, type ComparisonRow,
  type ComparisonSection, type InsurerTone, type LiabilityExclusions, type ProductValue,
  type TermsDocument, type Variant, type VerdictTone,
} from "./comparisonData";
import { AUDIT_DATE, COMPARISON_SOURCES, CPP_RENTAL_CAR_CONFIRMATION, sourceReferences, normalizeSearch } from "./comparisonSources";
import styles from "./comparison.module.css";
import { MarineGuide } from "./MarineGuide";
import { MARINE_SECTION } from "./marineData";
import { TravelHeroScene } from "./TravelHeroScene";

function VariantPicker<T extends string>({
  label,
  value,
  variants,
  onChange,
  tone,
}: {
  label: string;
  value: T;
  variants: Record<T, Variant>;
  onChange: (value: T) => void;
  tone: InsurerTone;
}) {
  const variantEntries = Object.entries(variants) as [T, Variant][];
  return (
    <fieldset className={styles.picker} data-tone={tone}>
      <legend className="sr-only">{label}</legend>
      <div style={{ gridTemplateColumns: `repeat(${variantEntries.length}, minmax(0, 1fr))` }}>
        {variantEntries.map(([key, variant]) => (
          <button key={key} type="button" onClick={() => onChange(key)} aria-pressed={value === key} title={variant.helper}>
            {variant.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ProductHeader({ insurer, product, logoPath, tone, variant, children }: {
  insurer: string; product: string; logoPath: string; tone: InsurerTone; variant: Variant; children: ReactNode;
}) {
  const logoKey = institutionLogoKeyFromInsurerName(insurer);
  return (
    <section className={styles.productHeader} data-tone={tone} aria-label={`${insurer} · ${variant.label}`}>
      <div className={styles.productBrand}>
        <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${institutionLogoFrameClass(logoKey, "compact")}`}>
          <Image src={logoPath} alt={insurer} fill sizes="64px" className={institutionLogoImageClass(logoKey)} />
        </span>
        <div><h2>{insurer}</h2><p>{product}</p></div>
        <span className={styles.productNumber}>{tone === "cpp" ? "01" : tone === "koop" ? "02" : "03"}</span>
      </div>
      {children}
      <div className={styles.featuredLimit}><span>Léčebné výlohy</span><strong>{formatMoney(variant.treatment)}</strong></div>
      <div className={styles.productMeta}><span>{tone === "axa" ? "Odpovědnost · zdraví" : "Odpovědnost · celkem"}</span><b>{variant.liability ? formatMoney(variant.liability) : "Není zahrnuta"}</b></div>
      <p className={styles.productFootnote}>{tone === "cpp" ? "Odpovědnost, úraz a zavazadla se sjednávají zvlášť." : tone === "koop" ? "Odpovědnost, úraz a zavazadla vyžadují balíček ÚZO." : "Rozsah základního pojištění určuje vybraná varianta."}</p>
    </section>
  );
}

function VerdictCard({ verdict }: { verdict: ComparisonRow["verdict"] }) {
  const styles = {
    cpp: "border-blue-200 bg-blue-50 text-blue-950",
    koop: "border-emerald-200 bg-emerald-50 text-emerald-950",
    axa: "border-indigo-200 bg-indigo-50 text-indigo-950",
    balanced: "border-violet-200 bg-violet-50 text-violet-950",
    attention: "border-amber-200 bg-amber-50 text-amber-950",
  } satisfies Record<VerdictTone, string>;
  const iconStyles = {
    cpp: "text-blue-700",
    koop: "text-emerald-700",
    axa: "text-indigo-700",
    balanced: "text-violet-600",
    attention: "text-amber-600",
  } satisfies Record<VerdictTone, string>;
  const VerdictIcon = verdict.tone === "attention" ? CircleAlert : verdict.tone === "balanced" ? Info : Sparkles;

  return (
    <div className={`mt-4 rounded-xl border p-3 ${styles[verdict.tone]}`}>
      <div className="flex items-center gap-2">
        <VerdictIcon className={`h-3.5 w-3.5 shrink-0 ${iconStyles[verdict.tone]}`} />
        <p className="text-[10px] font-black uppercase tracking-[0.11em]">{verdict.label}</p>
      </div>
      <p className="mt-1.5 text-xs font-semibold leading-5 opacity-80">{verdict.detail}</p>
    </div>
  );
}

function DifferenceSummary({
  differences,
  sharedPoints,
}: {
  differences: NonNullable<ComparisonRow["differences"]>;
  sharedPoints?: ComparisonRow["sharedPoints"];
}) {
  return (
    <div className="mt-4 space-y-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Rozdíly, které rozhodují</p>
      {differences.map((difference) => (
        <div key={difference.label} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.09em] text-slate-700">
            {difference.label}
          </p>
          <div className="divide-y divide-slate-100">
            <div className={`p-2.5 ${difference.advantage === "cpp" ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "bg-blue-50/35"}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-700">
                ČPP{difference.advantage === "cpp" ? " · výhoda" : ""}
              </p>
              <p className="mt-1 text-[11px] font-bold leading-4 text-slate-700">{difference.cpp}</p>
            </div>
            <div className={`p-2.5 ${difference.advantage === "koop" ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-emerald-50/35"}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">
                Kooperativa{difference.advantage === "koop" ? " · výhoda" : ""}
              </p>
              <p className="mt-1 text-[11px] font-bold leading-4 text-slate-700">{difference.koop}</p>
            </div>
            <div className={`p-2.5 ${difference.advantage === "axa" ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200" : "bg-indigo-50/35"}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-indigo-700">
                AXA{difference.advantage === "axa" ? " · výhoda" : ""}
              </p>
              <p className="mt-1 text-[11px] font-bold leading-4 text-slate-700">{difference.axa}</p>
            </div>
          </div>
        </div>
      ))}
      {sharedPoints && sharedPoints.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">Společné – uvedeno jen jednou</p>
          <ul className="mt-2 space-y-1.5">
            {sharedPoints.map((point) => (
              <li key={point} className="flex gap-2 text-[11px] font-semibold leading-4 text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LiabilityExclusionsDialog({
  exclusions,
  tone,
  isOpen,
  onClose,
}: {
  exclusions: LiabilityExclusions;
  tone: InsurerTone;
  isOpen: boolean;
  onClose: () => void;
}) {
  const toneClasses =
    tone === "cpp"
      ? {
          source: "border-blue-200 bg-blue-50 text-blue-800",
          number: "bg-blue-700 text-white",
          accent: "border-blue-200 bg-blue-50/55",
        }
      : tone === "koop"
        ? {
          source: "border-emerald-200 bg-emerald-50 text-emerald-800",
          number: "bg-emerald-700 text-white",
          accent: "border-emerald-200 bg-emerald-50/55",
          }
        : {
            source: "border-indigo-200 bg-indigo-50 text-indigo-800",
            number: "bg-indigo-800 text-white",
            accent: "border-indigo-200 bg-indigo-50/55",
          };

  return (
    <HelpDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Výluky odpovědnosti – ${exclusions.insurer}`}
      description={exclusions.scope}
    >
      <div className={`rounded-2xl border p-4 ${toneClasses.accent}`}>
        <p className={`inline-flex items-start gap-2 text-xs font-black leading-5 ${toneClasses.source}`}>
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Zdroj: {exclusions.source}</span>
        </p>
      </div>

      {exclusions.interpretationNote && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-950">
          <p className="font-black uppercase tracking-[0.1em] text-amber-800">Důležitá návaznost</p>
          <p className="mt-1.5">{exclusions.interpretationNote}</p>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {exclusions.groups.map((group, groupIndex) => (
          <section key={group.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${toneClasses.number}`}>
                {groupIndex + 1}
              </span>
              <h3 className="text-sm font-black text-slate-950">{group.title}</h3>
            </div>
            <ul className="divide-y divide-slate-100 px-4">
              {group.items.map((item) => (
                <li key={item} className="flex gap-3 py-3 text-xs font-medium leading-5 text-slate-700 sm:text-sm sm:leading-6">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-800">Platí také obecné podmínky</p>
            <p className="mt-1.5 text-xs font-semibold leading-5 text-rose-950">{exclusions.generalConditionsNote}</p>
          </div>
        </div>
      </div>
    </HelpDialog>
  );
}

function termsDocumentIcon(documentId: string): typeof FileText {
  if (documentId.includes("auto") || documentId.includes("rental-car")) return CarFront;
  if (documentId.includes("flight") || documentId.includes("letp")) return Plane;
  if (documentId.includes("pets") || documentId.includes("zvp")) return PawPrint;
  if (documentId.includes("sports") || documentId.includes("lp-1-23")) return Bike;
  if (documentId.includes("gp-2022") || documentId.includes("golf")) return Trophy;
  if (documentId.includes("zp-1-23")) return Snowflake;
  if (documentId.includes("liability") || documentId.includes("odc")) return ShieldCheck;
  if (documentId.includes("accident") || documentId.includes("urc")) return Activity;
  if (documentId.includes("baggage") || documentId.includes("zav")) return Luggage;
  if (documentId.includes("manual-work")) return Briefcase;
  if (documentId.includes("drink")) return CircleAlert;
  if (documentId.includes("cancellation") || documentId.includes("stp")) return Clock3;
  if (documentId.includes("ipid") || documentId.includes("overview")) return Info;
  return FileText;
}

function DocumentsDialog({
  group,
  isOpen,
  downloadingDocumentId,
  downloadError,
  onDownload,
  onClose,
}: {
  group: (typeof DOCUMENT_GROUPS)[number];
  isOpen: boolean;
  downloadingDocumentId: string | null;
  downloadError: string | null;
  onDownload: (document: TermsDocument) => void;
  onClose: () => void;
}) {
  const toneClasses = {
    cpp: {
      summary: "border-blue-200 bg-blue-50 text-blue-950",
      count: "bg-blue-700 text-white",
      item: "border-blue-100 hover:border-blue-300 hover:bg-blue-50/60",
      icon: "bg-blue-50 text-blue-700",
      download: "text-blue-700",
    },
    koop: {
      summary: "border-emerald-200 bg-emerald-50 text-emerald-950",
      count: "bg-emerald-700 text-white",
      item: "border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/60",
      icon: "bg-emerald-50 text-emerald-700",
      download: "text-emerald-700",
    },
    axa: {
      summary: "border-indigo-200 bg-indigo-50 text-indigo-950",
      count: "bg-indigo-800 text-white",
      item: "border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/60",
      icon: "bg-indigo-50 text-indigo-700",
      download: "text-indigo-700",
    },
  }[group.tone];

  return (
    <HelpDialog
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Pojistné podmínky"
      eyebrowIcon={<Files className="h-3.5 w-3.5" aria-hidden="true" />}
      title={`Dokumenty ${group.insurer}`}
      description="Kliknutím na dokument se přihlášenému uživateli stáhne příslušné PDF. Názvy jsou uvedené v plném znění."
    >
      <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${toneClasses.summary}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            <Files className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black">{group.insurer}</p>
            <p className="mt-0.5 text-xs font-semibold leading-5 opacity-80">{group.description}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${toneClasses.count}`}>
          {group.documents.length} PDF
        </span>
      </div>

      {downloadError && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700">
          {downloadError}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {group.documents.map((document) => {
          const DocumentIcon = termsDocumentIcon(document.id);
          const isDownloading = downloadingDocumentId === document.id;
          return (
            <button
              key={document.id}
              type="button"
              disabled={downloadingDocumentId !== null}
              onClick={() => onDownload(document)}
              className={`group flex min-h-20 items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left shadow-sm transition hover:shadow-md disabled:cursor-wait disabled:opacity-60 ${toneClasses.item}`}
            >
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses.icon}`}>
                <DocumentIcon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black leading-5 text-slate-950">{document.label}</span>
                <span className="mt-0.5 block text-xs font-semibold leading-4 text-slate-500">
                  {isDownloading ? "Stahuji PDF…" : document.code}
                </span>
              </span>
              {isDownloading ? (
                <Loader2 className={`h-4 w-4 shrink-0 animate-spin ${toneClasses.download}`} />
              ) : (
                <Download className={`h-4 w-4 shrink-0 ${toneClasses.download}`} />
              )}
            </button>
          );
        })}
      </div>
    </HelpDialog>
  );
}

function ProductCell({ value, otherValues, tone, variant }: { value: ProductValue; otherValues: ProductValue[]; tone: InsurerTone; variant: string }) {
  const comparableMetrics = otherValues.flatMap((otherValue) => otherValue.metric == null ? [] : [otherValue.metric]);
  const isHigher = value.metric != null && comparableMetrics.length > 0 && comparableMetrics.every((metric) => value.metric! > metric);
  const isSame = value.metric != null && comparableMetrics.length > 0 && comparableMetrics.every((metric) => value.metric === metric);
  const accent = tone === "cpp" ? "blue" : tone === "koop" ? "emerald" : "indigo";
  const [isExclusionsOpen, setIsExclusionsOpen] = useState(false);

  return (
    <div className={styles.productCell} data-tone={tone}>
      <article>
        <p className={styles.cellBrand}>
          <span>{tone === "cpp" ? "ČPP" : tone === "koop" ? "Kooperativa" : "AXA"}</span><span>{variant}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {value.badge && (
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${accent === "blue" ? "bg-blue-100 text-blue-800" : accent === "emerald" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"}`}>
              {value.badge}
            </span>
          )}
          {isHigher && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-violet-700">
              <Sparkles className="h-3 w-3" /> Vyšší limit
            </span>
          )}
          {isSame && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600">
              Shodný limit
            </span>
          )}
        </div>
        <h3 className={styles.cellHeadline}>{value.headline}</h3>
        <p className={styles.cellDetail}>{value.detail}</p>
        {value.caution && <p className={styles.caution}><CircleAlert size={16} aria-hidden="true" /><span>{value.caution}</span></p>}
        {value.keyFact && (
          <div
            className={`mt-4 rounded-2xl border px-3.5 py-3 ${
              tone === "cpp"
                ? "border-blue-200 bg-blue-50"
                : tone === "koop"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-indigo-200 bg-indigo-50"
            }`}
          >
            <p
              className={`text-[9px] font-black uppercase tracking-[0.12em] ${
                tone === "cpp"
                  ? "text-blue-700"
                  : tone === "koop"
                    ? "text-emerald-700"
                    : "text-indigo-700"
              }`}
            >
              {value.keyFact.label}
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span
                className={`text-3xl font-black leading-none tracking-tight ${
                  tone === "cpp"
                    ? "text-blue-900"
                    : tone === "koop"
                      ? "text-emerald-900"
                      : "text-indigo-900"
                }`}
              >
                {value.keyFact.value}
              </span>
              <span className="pb-0.5 text-[10px] font-bold text-slate-500">celkové ohodnocení</span>
            </div>
          </div>
        )}
        {value.points && (
          <ul className="mt-3 space-y-2">
            {value.points.map((point) => (
              <li key={point} className="flex gap-2 text-xs font-medium leading-5 text-slate-600">
                <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone === "cpp" ? "text-blue-600" : tone === "koop" ? "text-emerald-600" : "text-indigo-600"}`} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
        {value.exclusions && (
          <button
            type="button"
            onClick={() => setIsExclusionsOpen(true)}
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 ${
              tone === "cpp"
                ? "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100 focus-visible:ring-blue-300"
                : tone === "koop"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 focus-visible:ring-emerald-300"
                  : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300 hover:bg-indigo-100 focus-visible:ring-indigo-300"
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            Zobrazit výluky
          </button>
        )}
        {value.sections && (
          <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 transition hover:text-slate-950 [&::-webkit-details-marker]:hidden">
              Podmínky a výluky
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-slate-200 p-3">
              {value.sections.map((section) => {
                const sectionClasses =
                  section.emphasis === "exclusion"
                    ? "border-rose-200 bg-rose-50/80"
                    : section.emphasis === "benefit"
                      ? "border-emerald-200 bg-emerald-50/75"
                      : "border-slate-200 bg-white";
                const labelClasses =
                  section.emphasis === "exclusion"
                    ? "text-rose-800"
                    : section.emphasis === "benefit"
                      ? "text-emerald-800"
                      : "text-slate-700";

                return (
                  <section key={section.label} className={`rounded-xl border p-3 ${sectionClasses}`}>
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.12em] ${labelClasses}`}>
                      {section.label}
                    </h3>
                    {section.text && (
                      <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-700">
                        {section.text}
                      </p>
                    )}
                    {section.items && (
                      <ul className="mt-2 space-y-1.5">
                        {section.items.map((item) => (
                          <li key={item} className="flex gap-2 text-xs font-medium leading-5 text-slate-600">
                            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${section.emphasis === "exclusion" ? "bg-rose-500" : section.emphasis === "benefit" ? "bg-emerald-500" : "bg-slate-400"}`} />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </details>
        )}
        {value.source && <details className={styles.cellSources}>
          <summary><FileText size={14} aria-hidden="true" /> Zdroj a ustanovení <ChevronDown size={14} aria-hidden="true" /></summary>
          <p>{value.source}</p>
          {sourceReferences(tone, value.source).map(source => <div key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={13} aria-hidden="true" /></a>
            {source.note && <p className={styles.sourceNote}>{source.note}</p>}
          </div>)}
        </details>}
      </article>
      {value.exclusions && (
        <LiabilityExclusionsDialog
          exclusions={value.exclusions}
          tone={tone}
          isOpen={isExclusionsOpen}
          onClose={() => setIsExclusionsOpen(false)}
        />
      )}
    </div>
  );
}

export function TravelInsuranceComparison() {
  const [cppVariantKey, setCppVariantKey] = useState<CppVariantKey>("maxi");
  const [koopVariantKey, setKoopVariantKey] = useState<KoopVariantKey>("plus");
  const [axaVariantKey, setAxaVariantKey] = useState<AxaVariantKey>("excelent");
  const [openSections, setOpenSections] = useState<Set<ComparisonSection>>(
    () => new Set()
  );
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [documentDownloadError, setDocumentDownloadError] = useState<string | null>(null);
  const [documentsDialogTone, setDocumentsDialogTone] = useState<InsurerTone | null>(null);
  const cpp = CPP_VARIANTS[cppVariantKey];
  const koop = KOOP_VARIANTS[koopVariantKey];
  const axa = AXA_VARIANTS[axaVariantKey];
  const rows = useMemo(() => buildRows(cpp, koop, axa), [cpp, koop, axa]);
  const [query, setQuery] = useState("");
  const [collapsedFilteredSections, setCollapsedFilteredSections] = useState<Set<ComparisonSection>>(() => new Set());
  const updateQuery = (value: string) => { setQuery(value); setCollapsedFilteredSections(new Set()); };
  const [category, setCategory] = useState<ComparisonSection | "all">("all");
  const updateCategory = (value: ComparisonSection | "all") => { setCategory(value); setCollapsedFilteredSections(new Set()); };
  const filteredRows = useMemo(() => {
    const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
    return rows.filter(row => (category === "all" || row.section === category)
      && terms.every(term => normalizeSearch(JSON.stringify(row)).includes(term)));
  }, [rows, query, category]);
  const sectionGroups = COMPARISON_SECTIONS.map(section => ({
    ...section, rows: filteredRows.filter(row => row.section === section.label),
  })).filter(section => section.rows.length > 0);
  const filterActive = query.trim().length > 0 || category !== "all";
  const allExpanded = sectionGroups.every(section => filterActive ? !collapsedFilteredSections.has(section.label) : openSections.has(section.label));
  const toggleAll = () => {
    if (filterActive) setCollapsedFilteredSections(allExpanded ? new Set(sectionGroups.map(section => section.label)) : new Set());
    else setOpenSections(allExpanded ? new Set() : new Set(sectionGroups.map(section => section.label)));
  };
  const selectedVariants = { cpp, koop, axa };
  const comparableRows = new Set(["treatment", "teeth", "baggage", "accident", "accident-death", "accident-hospitalization"]);
  const activeDocumentGroup =
    DOCUMENT_GROUPS.find((group) => group.tone === documentsDialogTone) ?? null;

  const toggleSection = (section: ComparisonSection) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const openDocumentsDialog = (tone: InsurerTone) => {
    setDocumentDownloadError(null);
    setDocumentsDialogTone(tone);
  };

  const handleDocumentDownload = async ({
    id,
    fileName,
  }: {
    id: string;
    fileName: string;
  }) => {
    if (downloadingDocumentId) return;

    setDownloadingDocumentId(id);
    setDocumentDownloadError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Pro stažení dokumentu je nutné přihlášení.");
      }

      const blob = await fetchAuthedBlobOrThrow(
        currentUser,
        secureDocumentPath(id, { download: true })
      );
      if (blob.size === 0) {
        throw new Error("Stažený dokument je prázdný.");
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_500);
    } catch (error) {
      setDocumentDownloadError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Dokument se nepodařilo stáhnout."
      );
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}><Plane size={15} aria-hidden="true" /> PRŮVODCE CESTOVNÍM POJIŠTĚNÍM</span>
          <a href="#podklady" className={styles.auditStamp}><FileText size={14} aria-hidden="true" /> Kontrola podkladů {AUDIT_DATE}<ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
        <div className={styles.heroContent}>
          <div>
            <h1>Cestovní pojištění.<br /><span>Rozdíly, na kterých záleží.</span></h1>
            <p>ČPP, Kooperativa a AXA vedle sebe. Vyberte varianty a porovnejte limity, podmínky i výluky pro konkrétní situaci na cestě.</p>
            <div className={styles.heroActions}>
              <a className={styles.heroAction} href="#srovnani">Prozkoumat srovnání <ArrowDown size={16} aria-hidden="true" /></a>
              <a className={styles.marineShortcut} href="#srovnani" onClick={() => { updateQuery(""); updateCategory(MARINE_SECTION); }}><Anchor size={16} aria-hidden="true" />Klient jede na loď</a>
            </div>
          </div>
          <div className={styles.heroAside}>
            <div className={styles.heroArt}>
              <TravelHeroScene />
            </div>
            <div className={styles.heroStats} aria-label="Rozsah srovnání">
              <div><strong>03</strong><span>pojišťovny</span></div>
              <div><strong>{rows.length}</strong><span>situací na cestách</span></div>
              <div><strong>29</strong><span>uložených dokumentů</span></div>
            </div>
          </div>
        </div>
        <div className={styles.heroBottom}><span>Jednorázové cestovní pojištění</span><span>Konkrétní ustanovení u každého krytí</span><span>Rozpory ve zdrojích jsou označené</span></div>
      </header>

      <section aria-label="Výběr variant pojištění" className={styles.selection}>
        <div className={styles.sectionIntro}><div><span className={styles.step}>01</span><h2>Vyberte varianty</h2></div><p>Limity se přepočítají v celém srovnání.</p></div>
        <div className={styles.productGrid}>
          <ProductHeader insurer="ČPP" product="Cestovní pojištění" logoPath="/icons/cpp.png" tone="cpp" variant={cpp}>
            <VariantPicker label="Varianta ČPP" value={cppVariantKey} variants={CPP_VARIANTS} onChange={setCppVariantKey} tone="cpp" />
          </ProductHeader>
          <ProductHeader insurer="Kooperativa" product="KOLUMBUS" logoPath="/icons/koop.png" tone="koop" variant={koop}>
            <VariantPicker label="Varianta Kooperativy" value={koopVariantKey} variants={KOOP_VARIANTS} onChange={setKoopVariantKey} tone="koop" />
          </ProductHeader>
          <ProductHeader insurer="AXA" product="Cestovní pojištění" logoPath="/icons/axalogo.png" tone="axa" variant={axa}>
            <VariantPicker label="Varianta AXA" value={axaVariantKey} variants={AXA_VARIANTS} onChange={setAxaVariantKey} tone="axa" />
          </ProductHeader>
        </div>
        <p className={styles.readingNote}><Info size={16} aria-hidden="true" /><span>Volitelné připojištění vyžaduje samostatné sjednání. Vyšší číselný limit sám o sobě neurčuje vhodnější pojištění; rozhodují také podmínky a výluky.</span></p>
      </section>

      <section id="srovnani" className={styles.comparison} aria-label="Srovnání situací">
        <div className={styles.sectionIntro}><div><span className={styles.step}>02</span><h2>Co potřebujete porovnat?</h2></div><a href="#podklady">Podklady a kontrola <ArrowUpRight size={14} aria-hidden="true" /></a></div>
        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={19} aria-hidden="true" /><span className="sr-only">Hledat v situacích a podmínkách</span><input type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Hledat situaci, krytí nebo podmínku…" />{query && <button type="button" onClick={() => updateQuery("")} aria-label="Vymazat hledání"><X size={16} /></button>}</label>
          <div className={styles.resultTools}><span role="status" aria-live="polite">{filteredRows.length} z {rows.length} situací</span><button type="button" disabled={!sectionGroups.length} onClick={toggleAll}><SlidersHorizontal size={15} aria-hidden="true" />{allExpanded ? "Sbalit vše" : "Rozbalit vše"}</button></div>
        </div>
        <nav className={styles.categories} aria-label="Oblasti pojištění">
          <button type="button" aria-pressed={category === "all"} onClick={() => updateCategory("all")}>Všechny oblasti <span>{rows.length}</span></button>
          {COMPARISON_SECTIONS.map(section => <button key={section.id} type="button" aria-pressed={category === section.label} onClick={() => updateCategory(section.label)}>{section.label}</button>)}
        </nav>
        <div className={styles.selectedStrip} aria-label="Právě porovnávané varianty">{DOCUMENT_GROUPS.map(group => <span key={group.tone} data-tone={group.tone}><i />{group.insurer}<b>{selectedVariants[group.tone].label}</b></span>)}</div>
        {!filteredRows.length && <div className={styles.empty}><Search size={28} aria-hidden="true" /><h3>Žádná odpovídající situace</h3><p>Zkuste jiné slovo nebo zobrazte všechny oblasti.</p><button type="button" onClick={() => { updateQuery(""); updateCategory("all"); }}>Zrušit filtry</button></div>}
        <div className={styles.sectionList}>
          {sectionGroups.map(section => {
            const isOpen = filterActive ? !collapsedFilteredSections.has(section.label) : openSections.has(section.label);
            const SectionIcon = section.icon;
            return <section key={section.id} className={styles.topic} id={section.id}>
              <button type="button" className={styles.topicToggle} aria-expanded={isOpen} aria-controls={`${section.id}-content`} onClick={() => {
                if (filterActive) setCollapsedFilteredSections(current => {
                  const next = new Set(current);
                  if (next.has(section.label)) next.delete(section.label); else next.add(section.label);
                  return next;
                });
                else toggleSection(section.label);
              }}>
                <span className={styles.topicIcon}><SectionIcon size={19} aria-hidden="true" /></span><span>{section.label}</span><span className={styles.topicCount}>{section.rows.length}</span><ChevronDown size={18} className={isOpen ? styles.rotated : ""} aria-hidden="true" />
              </button>
              <div id={`${section.id}-content`} hidden={!isOpen}>
                {isOpen && section.label === MARINE_SECTION && !query.trim() && <MarineGuide rows={rows} />}
                {isOpen && section.rows.map(row => {
                  const Icon = row.icon;
                  return <article key={row.id} className={styles.situation} id={row.id} aria-labelledby={`${row.id}-title`}>
                    <div className={styles.situationIntro}>
                      <div><div className={styles.situationTitle}><Icon size={18} aria-hidden="true" /><h2 id={`${row.id}-title`}>{row.title}</h2></div><p>{row.description}</p></div>
                      <VerdictCard verdict={row.verdict} />
                    </div>
                    <div className={styles.cellGrid}>{DOCUMENT_GROUPS.map(group => <ProductCell key={group.tone} tone={group.tone} variant={selectedVariants[group.tone].label} value={row[group.tone]} otherValues={comparableRows.has(row.id) ? DOCUMENT_GROUPS.filter(other => other.tone !== group.tone).map(other => row[other.tone]) : []} />)}</div>
                    {row.differences && <details className={styles.differences}><summary>Podrobné rozdíly a společná pravidla <ChevronDown size={16} aria-hidden="true" /></summary><DifferenceSummary differences={row.differences} sharedPoints={row.sharedPoints} /></details>}
                  </article>;
                })}
              </div>
            </section>;
          })}
        </div>
      </section>

      <section id="podklady" className={styles.documents}>
        <div className={styles.sectionIntro}><div><span className={styles.step}>03</span><h2>Podmínky, které stojí za srovnáním</h2></div><span>Kontrolováno {AUDIT_DATE}</span></div>
        <p className={styles.documentsLead}>Srovnání vychází z uložených PDF a kontroly veřejných dokumentů pojišťoven. Odkazy u situací vedou na konkrétní oficiální podmínky; uložené dokumenty lze stáhnout po přihlášení.</p>
        <div className={styles.sourceGrid}>{DOCUMENT_GROUPS.map(group => <article key={group.tone} data-tone={group.tone}>
          <div className={styles.sourceTitle}><h3>{group.insurer}</h3><span>{group.documents.length} PDF</span></div>
          <p>{group.tone === "cpp" ? "VPPCP 1/18 a samostatné doplňkové podmínky. U Covid PLUS je rozpor mezi veřejnou a uloženou verzí." : group.tone === "koop" ? "KOLUMBUS M-750/23, soubor 11/2025. Uložené úplné podmínky se přesně shodují s veřejným PDF." : "VPPCP z 15. 6. 2026. Text úplných podmínek se shoduje s veřejným PDF; navíc je uloženo IPID a devět přehledů."}</p>
          <button type="button" onClick={() => openDocumentsDialog(group.tone)}><Files size={16} aria-hidden="true" /> Uložené dokumenty <ArrowUpRight size={15} aria-hidden="true" /></button>
          <a href={group.tone === "cpp" ? "https://www.cpp.cz/cestovni-pojisteni/zaklad-na-cesty" : COMPARISON_SOURCES.find(source => source.insurer === group.tone)!.url} target="_blank" rel="noreferrer">Oficiální {group.tone === "cpp" ? "seznam dokumentů" : "pojistné podmínky"}<ArrowUpRight size={14} aria-hidden="true" /></a>
        </article>)}</div>
        <p className={styles.confirmationNote}><ShieldCheck size={18} aria-hidden="true" /><span><strong>ČPP a pronajaté movité věci:</strong> {CPP_RENTAL_CAR_CONFIRMATION.detail} Krytí zahrnuje i další zapůjčené movité věci, například sportovní vybavení. Sublimit je 10 % limitu odpovědnosti, nejvýše 500 000 Kč.</span></p>
        <details className={styles.auditNotes}>
          <summary><CircleAlert size={17} aria-hidden="true" /> Rozpory a podmínky vyžadující ověření <ChevronDown size={16} aria-hidden="true" /></summary>
          <ul>
            <li><strong>ČPP Covid PLUS:</strong> uložená verze 1/23 uvádí MAXI 25 000 Kč pro pobyt a 25 000 Kč pro dopravu. Veřejný odkaz označený 1/23 vrací starší 1/21 s limity 20 000 + 20 000 Kč. Potvrďte verzi konkrétní smlouvy.</li>
            <li><strong>ČPP Zvíře PLUS:</strong> veřejná a uložená verze 1/18 se liší v krytí závodů zvířat. Uložená verze je podmiňuje ujednáním ve smlouvě. Uvedené druhy zvířat, věk, limity a spoluúčast se shodují.</li>
            <li><strong>ČPP Auto PLUS:</strong> veřejná verze má účinnost 1. 9. 2018, uložená 1. 5. 2018; zkontrolované služby a limity se shodují.</li>
            <li><strong>ČPP Guard PLUS:</strong> veřejná verze má účinnost 1. 11. 2020, uložená 1. 6. 2020; rozsah a limity se shodují.</li>
            <li><strong>AXA po odjezdu a odpovědnost při sportu:</strong> odklad počátku ve stejný den nepotvrzuje přijetí návrhu na již nastoupené cestě. U rizikových sportů se liší formulace obecné výluky a zvláštního rozšíření odpovědnosti; vyžádejte potvrzení.</li>
          </ul>
        </details>
        {documentDownloadError && <p role="alert" className={styles.caution}>{documentDownloadError}</p>}
        <p className={styles.finalNote}>Rozsah plnění určuje konkrétní smlouva a její podmínky. Před sjednáním zkontrolujte destinaci, délku pobytu, sporty, zdravotní stav a sjednaná připojištění. Srovnání nehodnotí cenu pojištění.</p>
      </section>
      {activeDocumentGroup && <DocumentsDialog group={activeDocumentGroup} isOpen downloadingDocumentId={downloadingDocumentId} downloadError={documentDownloadError} onDownload={document => void handleDocumentDownload(document)} onClose={() => setDocumentsDialogTone(null)} />}
    </div>
  );
}

export default function TravelInsuranceComparisonPage() {
  return <AppLayout active="tools"><TravelInsuranceComparison /></AppLayout>;
}
