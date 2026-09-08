"use client";

import { useState, type ReactNode } from "react";
import {
  Car,
  HandCoins,
  HeartPulse,
  House,
  ListChecks,
  Plane,
  ReceiptText,
  UsersRound,
} from "lucide-react";

import { StatementSection } from "./StatementSection";
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

const SECTION_ICONS = {
  life: HeartPulse,
  auto: Car,
  property: House,
  business: ReceiptText,
  travel: Plane,
  foreigners: UsersRound,
  investment: HandCoins,
  other: ReceiptText,
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
  const tone = sectionKind === "life" || sectionKind === "auto" || sectionKind === "property" || sectionKind === "travel" ? sectionKind : "neutral";
  return (
    <StatementSection
      title={title}
      showTitle={showTitle}
      icon={SECTION_ICONS[sectionKind]}
      tone={tone}
      count={displayedContracts.length}
      amount={totalCommission}
      description={showDescription ? description : undefined}
      badge={[a101FilterActive ? "Pouze A101" : null, uncertaintyCount > 0 ? uncertaintyCountLabel(uncertaintyCount) : null].filter(Boolean).join(" · ") || undefined}
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
          {enableA101Filter && (
            <div className="mb-2 flex flex-col gap-2 rounded-lg border border-violet-100 bg-white/75 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-bold text-slate-600">
                A101: {a101Contracts.length} / {contracts.length} smluv
              </div>
              <button
                type="button"
                onClick={() => setShowOnlyA101((value) => !value)}
                disabled={a101Contracts.length === 0}
                aria-pressed={a101FilterActive}
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
      {expanded && displayedContracts.map((contract) => renderContract(contract))}
    </StatementSection>
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
    <StatementSection
      title="Životní pojištění"
      icon={HeartPulse}
      tone="life"
      count={contracts.length}
      amount={totalPayout}
      badge={uncertaintyCount > 0 ? uncertaintyCountLabel(uncertaintyCount) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
      {expanded && contracts.map((contract) => renderContract(contract))}
    </StatementSection>
  );
}
