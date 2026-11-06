"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Car,
  HandCoins,
  HeartPulse,
  House,
  Link2Off,
  Plane,
  ReceiptText,
  UsersRound,
} from "lucide-react";

import { StatementSection } from "./StatementSection";
import { StatementContractList } from "./StatementContractList";
import { useStatementBrowserItems } from "./StatementContractBrowser";
import { resolveStatementProduct } from "./statementParsing";
import type {
  LifeSplitContractPreview,
  OtherProductContractPreview,
  StatementProductCategory,
} from "./statementTypes";
import styles from "./statementWorkspace.module.css";

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

type UnpairedContractListItem = ComponentProps<typeof StatementContractList>["items"][number] & {
  category: StatementProductCategory | "other";
};

const UNPAIRED_PRODUCT_SECTIONS = [
  { kind: "life", title: "Životní pojištění" },
  { kind: "auto", title: "Auta" },
  { kind: "property", title: "Majetek a odpovědnost" },
  { kind: "foreigners", title: "Cizinci" },
  { kind: "travel", title: "Cestovní pojištění" },
  { kind: "investment", title: "Investice" },
  { kind: "other", title: "Ostatní produkty" },
] as const;

function UnpairedProductSection({ title, kind, items, showFilters }: {
  title: string;
  kind: typeof UNPAIRED_PRODUCT_SECTIONS[number]["kind"];
  items: UnpairedContractListItem[];
  showFilters: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  return (
    <StatementSection
      title={title}
      icon={SECTION_ICONS[kind]}
      tone={kind === "life" || kind === "auto" || kind === "property" || kind === "travel" ? kind : "neutral"}
      count={items.length}
      amount={items.reduce((sum, item) => sum + item.amount, 0)}
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
      <StatementContractList items={items} showFilters={showFilters} enableA101Filter />
    </StatementSection>
  );
}

export function UnpairedContractsSectionPanel({ items: allItems }: { items: UnpairedContractListItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const { items, inBrowser } = useStatementBrowserItems(allItems);
  if (items.length === 0) return null;

  return (
    <StatementSection
      title="Smlouvy mimo Bohemka.App"
      icon={Link2Off}
      tone="unpaired"
      count={items.length}
      amount={items.reduce((sum, item) => sum + item.amount, 0)}
      description="Zkontroluj číslo smlouvy a zda je uložená v systému."
      badge="Nelze porovnat"
      badgeTone="info"
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
      <p className={styles.sectionHint}>Tyto smlouvy jsme v systému jednoznačně nenašli. Otevři řádek smlouvy a zkontroluj její údaje.</p>
      {UNPAIRED_PRODUCT_SECTIONS.map(({ kind, title }) => (
        <UnpairedProductSection
          key={kind}
          title={title}
          kind={kind}
          items={items.filter(item => {
            const category = item.category === "business" ? "property" : item.category;
            return category === kind || (kind === "other" && !UNPAIRED_PRODUCT_SECTIONS.some(section => section.kind === category));
          })}
          showFilters={!inBrowser}
        />
      ))}
    </StatementSection>
  );
}

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

  const { items, inBrowser } = useStatementBrowserItems(contracts.map(contract => ({
    key: `other:${contract.key}`,
    searchText: [contract.client, contract.contractNumber, ...contract.rows.map(row => `${row.product} ${resolveStatementProduct(row.product).label}`)].join(" "),
    amount: contractTotal(contract),
    issueCount: contractUncertaintyCount(contract),
    unpaired: contractIsUnpaired(contract),
    hasA101: contractHasA101Commission(contract),
    render: () => renderContract(contract),
  })));
  if (items.length === 0) return null;
  const totalCommission = items.reduce((sum, item) => sum + item.amount, 0);
  const uncertaintyCount = items.reduce((sum, item) => sum + item.issueCount, 0);
  const tone = sectionKind === "life" || sectionKind === "auto" || sectionKind === "property" || sectionKind === "travel" ? sectionKind : "neutral";
  return (
    <StatementSection
      title={title}
      showTitle={showTitle}
      icon={SECTION_ICONS[sectionKind]}
      tone={tone}
      count={items.length}
      amount={totalCommission}
      description={showDescription ? description : undefined}
      badge={uncertaintyCount > 0 ? uncertaintyCountLabel(uncertaintyCount) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
      <StatementContractList enableA101Filter={enableA101Filter} items={items} showFilters={!inBrowser} />
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

  const { items, inBrowser } = useStatementBrowserItems(contracts.map(contract => ({
    key: `life:${contract.contractNumber}-${contract.productCode}`,
    searchText: `${contract.client} ${contract.contractNumber} ${contract.productLabel} ${contract.productCode}`,
    amount: contractTotal(contract),
    issueCount: contractUncertaintyCount(contract),
    unpaired: contractIsUnpaired(contract),
    render: () => renderContract(contract),
  })));
  if (items.length === 0) return null;
  const totalPayout = items.reduce((sum, item) => sum + item.amount, 0);
  const uncertaintyCount = items.reduce((sum, item) => sum + item.issueCount, 0);

  return (
    <StatementSection
      title="Životní pojištění"
      icon={HeartPulse}
      tone="life"
      count={items.length}
      amount={totalPayout}
      badge={uncertaintyCount > 0 ? uncertaintyCountLabel(uncertaintyCount) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(value => !value)}
    >
      <StatementContractList items={items} showFilters={!inBrowser} />
    </StatementSection>
  );
}
