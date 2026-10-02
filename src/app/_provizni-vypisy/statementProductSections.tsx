"use client";

import { useState, type ReactNode } from "react";
import {
  Car,
  HandCoins,
  HeartPulse,
  House,
  Plane,
  ReceiptText,
  UsersRound,
} from "lucide-react";

import { StatementSection } from "./StatementSection";
import { StatementContractList } from "./StatementContractList";
import { resolveStatementProduct } from "./statementParsing";
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
  contractIsUnpaired,
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
  contractIsUnpaired: (contract: OtherProductContractPreview) => boolean;
  uncertaintyCountLabel: (count: number) => string;
  renderContract: (contract: OtherProductContractPreview) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (contracts.length === 0) return null;

  const items = contracts.map(contract => ({
    key: contract.key,
    searchText: [contract.client, contract.contractNumber, ...contract.rows.map(row => `${row.product} ${resolveStatementProduct(row.product).label}`)].join(" "),
    amount: contractTotal(contract),
    issueCount: contractUncertaintyCount(contract),
    unpaired: contractIsUnpaired(contract),
    hasA101: contractHasA101Commission(contract),
    render: () => renderContract(contract),
  }));
  const totalCommission = items.reduce((sum, item) => sum + item.amount, 0);
  const uncertaintyCount = items.reduce((sum, item) => sum + item.issueCount, 0);
  const tone = sectionKind === "life" || sectionKind === "auto" || sectionKind === "property" || sectionKind === "travel" ? sectionKind : "neutral";
  return (
    <StatementSection
      title={title}
      showTitle={showTitle}
      icon={SECTION_ICONS[sectionKind]}
      tone={tone}
      count={contracts.length}
      amount={totalCommission}
      description={showDescription ? description : undefined}
      badge={uncertaintyCount > 0 ? uncertaintyCountLabel(uncertaintyCount) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
      <StatementContractList enableA101Filter={enableA101Filter} items={items} />
    </StatementSection>
  );
}

export function LifeSplitProductsSectionPanel({
  contracts,
  contractTotal,
  contractUncertaintyCount,
  contractIsUnpaired,
  uncertaintyCountLabel,
  renderContract,
}: {
  contracts: LifeSplitContractPreview[];
  contractTotal: (contract: LifeSplitContractPreview) => number;
  contractUncertaintyCount: (contract: LifeSplitContractPreview) => number;
  contractIsUnpaired: (contract: LifeSplitContractPreview) => boolean;
  uncertaintyCountLabel: (count: number) => string;
  renderContract: (contract: LifeSplitContractPreview) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (contracts.length === 0) return null;

  const items = contracts.map(contract => ({
    key: `${contract.contractNumber}-${contract.productCode}`,
    searchText: `${contract.client} ${contract.contractNumber} ${contract.productLabel} ${contract.productCode}`,
    amount: contractTotal(contract),
    issueCount: contractUncertaintyCount(contract),
    unpaired: contractIsUnpaired(contract),
    render: () => renderContract(contract),
  }));
  const totalPayout = items.reduce((sum, item) => sum + item.amount, 0);
  const uncertaintyCount = items.reduce((sum, item) => sum + item.issueCount, 0);

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
      <StatementContractList items={items} />
    </StatementSection>
  );
}
