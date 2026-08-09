"use client";

import { useState, type ReactNode } from "react";
import {
  Car,
  ChevronDown,
  HandCoins,
  HeartPulse,
  House,
  ListChecks,
  Plane,
  ReceiptText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { formatMoney } from "./statementParsing";
import type {
  LifeSplitContractPreview,
  OtherProductContractPreview,
} from "./statementTypes";

export type StatementProductSectionKind =
  | "life"
  | "auto"
  | "property"
  | "business"
  | "travel"
  | "foreigners"
  | "investment"
  | "other";

type SectionMeta = {
  icon: LucideIcon;
  iconClass: string;
  containerClass: string;
  accentClass: string;
  dividerClass: string;
};

const VIOLET_SECTION_META: SectionMeta = {
  icon: ReceiptText,
  iconClass: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  containerClass:
    "border-white/70 bg-white/75 shadow-[0_16px_36px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/70 backdrop-blur-xl",
  accentClass: "bg-violet-500/60",
  dividerClass: "border-violet-100",
};

const SECTION_META: Record<StatementProductSectionKind, SectionMeta> = {
  life: { ...VIOLET_SECTION_META, icon: HeartPulse },
  auto: { ...VIOLET_SECTION_META, icon: Car },
  property: { ...VIOLET_SECTION_META, icon: House },
  business: { ...VIOLET_SECTION_META, icon: ReceiptText },
  travel: { ...VIOLET_SECTION_META, icon: Plane },
  foreigners: { ...VIOLET_SECTION_META, icon: UsersRound },
  investment: { ...VIOLET_SECTION_META, icon: HandCoins },
  other: {
    ...VIOLET_SECTION_META,
    icon: ReceiptText,
    iconClass: "bg-white text-slate-600 ring-1 ring-violet-100",
    accentClass: "bg-slate-400/70",
  },
};

export function OtherProductsSectionPanel({
  title = "Ostatní smlouvy",
  description = "Primárně seskupeno podle čísla smlouvy. Produkt je doplňující kontrola z výpisu.",
  showTitle = true,
  showDescription = false,
  sectionKind = "other",
  enableA101Filter = false,
  contracts = [],
  contractHasA101Commission,
  contractTotal,
  contractUncertaintyCount,
  uncertaintyCountLabel,
  renderContract,
}: {
  title?: string;
  description?: string;
  showTitle?: boolean;
  showDescription?: boolean;
  sectionKind?: StatementProductSectionKind;
  enableA101Filter?: boolean;
  contracts?: OtherProductContractPreview[];
  contractHasA101Commission: (contract: OtherProductContractPreview) => boolean;
  contractTotal: (contract: OtherProductContractPreview) => number;
  contractUncertaintyCount: (contract: OtherProductContractPreview) => number;
  uncertaintyCountLabel: (count: number) => string;
  renderContract: (contract: OtherProductContractPreview) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOnlyA101, setShowOnlyA101] = useState(false);
  const a101Contracts = contracts.filter(contractHasA101Commission);
  const a101FilterActive = enableA101Filter && showOnlyA101 && a101Contracts.length > 0;
  const displayedContracts = a101FilterActive ? a101Contracts : contracts;
  if (contracts.length === 0) return null;

  const totalCommission = displayedContracts.reduce(
    (sum, contract) => sum + contractTotal(contract),
    0
  );
  const uncertaintyCount = displayedContracts.reduce(
    (sum, contract) => sum + contractUncertaintyCount(contract),
    0
  );
  const sectionMeta = SECTION_META[sectionKind];
  const HeaderIcon = sectionMeta.icon;

  return (
    <div className={`relative overflow-hidden rounded-lg border ${sectionMeta.containerClass}`}>
      <span
        className={`pointer-events-none absolute inset-x-0 top-0 h-px ${sectionMeta.accentClass}`}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex w-full px-4 py-3 text-left transition hover:bg-violet-50/35 ${
          showTitle
            ? "flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            : "justify-end"
        }`}
        aria-expanded={expanded}
      >
        {showTitle && (
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${sectionMeta.iconClass}`}
            >
              <HeaderIcon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-black tracking-tight text-slate-950">{title}</h3>
              {showDescription && (
                <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-slate-500">
                  {description}
                </p>
              )}
            </div>
          </div>
        )}
        <span className="inline-flex flex-wrap items-center justify-end gap-3 text-sm font-bold text-slate-900">
          <span>{displayedContracts.length} smluv · {formatMoney(totalCommission)} Kč</span>
          {a101FilterActive && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 ring-1 ring-emerald-100">
              Pouze A101
            </span>
          )}
          {uncertaintyCount > 0 && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-800 ring-1 ring-violet-100">
              {uncertaintyCountLabel(uncertaintyCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className={`border-t ${sectionMeta.dividerClass} bg-white/45 py-2 pl-4 pr-3 sm:pl-5`}>
          {enableA101Filter && (
            <div className="mb-2 flex flex-col gap-2 rounded-lg border border-violet-100 bg-white/75 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-bold text-slate-600">
                A101: {a101Contracts.length} / {contracts.length} smluv
              </div>
              <button
                type="button"
                onClick={() => setShowOnlyA101((value) => !value)}
                disabled={a101Contracts.length === 0}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  a101FilterActive
                    ? "bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.24)]"
                    : "bg-violet-50 text-violet-800 ring-1 ring-violet-100 hover:bg-violet-100"
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                Pouze A101
              </button>
            </div>
          )}
          {displayedContracts.map((contract) => renderContract(contract))}
        </div>
      )}
    </div>
  );
}

export function LifeSplitProductsSectionPanel({
  contracts,
  contractTotal,
  contractUncertaintyCount,
  uncertaintyCountLabel,
  renderContract,
}: {
  contracts: LifeSplitContractPreview[];
  contractTotal: (contract: LifeSplitContractPreview) => number;
  contractUncertaintyCount: (contract: LifeSplitContractPreview) => number;
  uncertaintyCountLabel: (count: number) => string;
  renderContract: (contract: LifeSplitContractPreview) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (contracts.length === 0) return null;

  const totalPayout = contracts.reduce((sum, contract) => sum + contractTotal(contract), 0);
  const uncertaintyCount = contracts.reduce(
    (sum, contract) => sum + contractUncertaintyCount(contract),
    0
  );

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/70 bg-white/75 shadow-[0_16px_36px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/70 backdrop-blur-xl">
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-violet-500/60"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 px-4 py-3 text-left transition hover:bg-violet-50/35 sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <HeartPulse className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h3 className="text-base font-black tracking-tight text-slate-950">
            Životní pojištění
          </h3>
        </div>
        <span className="inline-flex flex-wrap items-center gap-3 text-sm font-bold text-slate-900">
          <span>{contracts.length} smluv · {formatMoney(totalPayout)} Kč</span>
          {uncertaintyCount > 0 && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-800 ring-1 ring-violet-100">
              {uncertaintyCountLabel(uncertaintyCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-violet-100 bg-white/45 py-2 pl-4 pr-3 sm:pl-5">
          {contracts.map((contract) => renderContract(contract))}
        </div>
      )}
    </div>
  );
}
