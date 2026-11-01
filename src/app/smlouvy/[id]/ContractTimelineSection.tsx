"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, FileText, PencilLine } from "lucide-react";
import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { isAutoProduct, isFrequencyAutoPayoutProduct } from "@/app/lib/productCatalog";
import { isAnnualSeparatedPeriodProduct, isPerPaymentSeparatedPeriodProduct, isSeparatedPeriodCommissionProduct } from "@/app/lib/separatedPeriodCommissions";
import { computeLegacyFrequencyOverrideTotal } from "@/app/lib/managerOverrideTotals";
import type { CommissionMode, CommissionResultItemDTO, Position } from "@/app/types/domain";
import { ContractCommissionSection, type MeziprovisionCard } from "./ContractCommissionSection";
import { ContractCommissionHistory } from "./ContractCommissionHistory";
import { ContractSectionHeading } from "./ContractDetailUi";
import { computeTotalWithMultipliers, formatDate, formatMoney, frequencyText, nameFromEmail, normalizeEmail,
  paymentBasedTotals, paymentsPerYear, positionLabel, productLabel, stripTotalRows } from "./contractDetailHelpers";
import { contractTimelineEntryAnchor } from "./contractTimelineDetails";
import type { ContractDoc } from "./contractDetailTypes";
import styles from "./contractTimeline.module.css";

type Props = {
  entries: ContractDoc[];
  ownerEmail: string | null;
  viewerEmail: string | null;
  selectedEntryId?: string | null;
  loading?: boolean;
  error?: string | null;
  onOpenStatement?: (statementId: string) => void;
  statementPreviewLoadingId?: string | null;
  onOpenPdf?: (entryId: string) => void;
  onEditEntry?: (entryId: string) => void;
  editingDisabled?: boolean;
  onRefreshPdf?: (entryId: string) => void;
  pdfRefreshDisabled?: boolean;
  onOpenNeonImmediateBreakdown: (entry: ContractDoc, item: CommissionResultItemDTO,
    position: Position | null | undefined, mode: CommissionMode | null | undefined) => void;
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const modeLabel = (mode: unknown) => mode === "accelerated" ? "Zrychlený" : mode === "standard" ? "Běžný" : "—";
const commissionMode = (mode: unknown): CommissionMode | null => mode === "standard" || mode === "accelerated" ? mode : null;

function displayItems(entry: ContractDoc, source: CommissionResultItemDTO[] | null | undefined) {
  let items = stripTotalRows(source ?? []);
  if (isPerPaymentSeparatedPeriodProduct(entry.productKey)) {
    const fromPayments = items.filter(item => item.title.toLowerCase().includes("(z platby)"));
    if (fromPayments.length) items = fromPayments;
  }
  if (isAutoProduct(entry.productKey) || isPerPaymentSeparatedPeriodProduct(entry.productKey)) {
    items = items.filter(item => !/provize za rok|celkem za rok/i.test(item.title));
  }
  return items;
}

function TimelineEntry({ entry, label, ...props }: Props & { entry: ContractDoc; label: string }) {
  const initialOpen = props.selectedEntryId === entry.id && entry.entryType === "endorsement";
  const [expanded, setExpanded] = useState(initialOpen);
  const selection = JSON.stringify([props.selectedEntryId, entry.id, entry.entryType]);
  const [previousSelection, setPreviousSelection] = useState(selection);
  const [showAdvisorDetails, setShowAdvisorDetails] = useState(false);
  const [showManagerDetails, setShowManagerDetails] = useState(true);
  if (previousSelection !== selection) {
    setPreviousSelection(selection);
    if (initialOpen) setExpanded(true);
  }
  const owner = normalizeEmail(entry.userEmail ?? props.ownerEmail);
  const viewer = normalizeEmail(props.viewerEmail);
  const own = Boolean(owner && viewer && owner === viewer);
  const endorsement = entry.entryType === "endorsement";
  const previous = finite(entry.previousInputAmount);
  const premium = finite(endorsement
    ? entry.newInputAmount ?? entry.effectiveInputAmount ?? entry.inputAmount
    : entry.inputAmount ?? entry.effectiveInputAmount);
  const delta = endorsement ? finite(entry.premiumDelta) ?? (premium !== null && previous !== null ? premium - previous : null) : null;
  const adviserItems = displayItems(entry, entry.items);
  const manager = (entry.managerOverrides ?? []).find(row => viewer && normalizeEmail(row.email) === viewer);
  const managerItems = manager ? displayItems(entry, manager.items) : [];
  const paymentBased = isSeparatedPeriodCommissionProduct(entry.productKey) || isFrequencyAutoPayoutProduct(entry.productKey);
  const multiplier = paymentBased && !isAnnualSeparatedPeriodProduct(entry.productKey) ? paymentsPerYear(entry.frequencyRaw) : 1;
  const managerCards: MeziprovisionCard[] = manager && managerItems.length ? [{
    key: `${entry.id}-viewer`, email: viewer, userName: nameFromEmail(viewer), position: manager.position,
    mode: commissionMode(manager.commissionMode), items: managerItems,
    totals: paymentBased ? paymentBasedTotals(managerItems, multiplier) : null,
    totalDisplay: computeLegacyFrequencyOverrideTotal({ productKey: entry.productKey ?? null,
      frequencyRaw: entry.frequencyRaw ?? null, items: managerItems, fallbackTotal: manager.total }),
  }] : [];
  const payouts = (entry.commissionPayouts ?? []).filter(row => {
    const writer = normalizeEmail(row.writtenBy);
    return writer ? writer === viewer : own;
  });
  const hasFile = entry.contractPdfAttachment?.hasFile && entry.contractPdfAttachment.contentType === "application/pdf";

  return (
    <details id={contractTimelineEntryAnchor(entry.id)} className={styles.entry} open={expanded || undefined}
      onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className={styles.summary}>
        <span className={styles.summaryLabel}>
          <span className={endorsement ? styles.endorsement : styles.original}>{label}</span>
          <span className={styles.effective}>Účinnost od {formatDate(entry.policyStartDate)}</span>
        </span>
        <span className={styles.summaryAmount}>
          {premium !== null && <span>{formatMoney(premium)}</span>}
          {delta !== null && <span className={delta < 0 ? styles.decrease : styles.increase}>
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatMoney(Math.abs(delta))}
          </span>}
          <ChevronDown size={17} aria-hidden="true" />
        </span>
      </summary>
      <div className={styles.body}>
        <dl className={styles.metadata}>
          <div><dt>Produkt</dt><dd>{productLabel(entry.productKey)}</dd></div>
          <div><dt>Číslo smlouvy</dt><dd>{entry.contractNumber || "—"}</dd></div>
          <div><dt>Sjednáno</dt><dd>{formatDate(entry.contractSignedDate ?? entry.createdAt)}</dd></div>
          <div><dt>Účinnost od</dt><dd>{formatDate(entry.policyStartDate)}</dd></div>
          {entry.policyEndDate && <div><dt>Konec pojištění</dt><dd>{formatDate(entry.policyEndDate)}</dd></div>}
          <div><dt>Frekvence placení</dt><dd>{frequencyText(entry.frequencyRaw)}</dd></div>
          <div><dt>Pozice při sjednání</dt><dd>{positionLabel(entry.position ?? null)}</dd></div>
          <div><dt>Provizní režim</dt><dd>{modeLabel(entry.commissionMode)}</dd></div>
          {endorsement && <div><dt>Původní pojistné</dt><dd>{previous !== null ? formatMoney(previous) : "—"}</dd></div>}
          <div><dt>{endorsement ? "Nové pojistné" : "Pojistné při sjednání"}</dt><dd>{premium !== null ? formatMoney(premium) : "—"}</dd></div>
          {delta !== null && <div><dt>Změna pojistného</dt><dd>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatMoney(Math.abs(delta))}</dd></div>}
          {entry.durationYears != null && <div><dt>Doba trvání</dt><dd>{entry.durationYears} let</dd></div>}
        </dl>
        {hasFile && props.onOpenPdf && <button type="button" className={styles.pdf} onClick={() => props.onOpenPdf?.(entry.id)}>
          <FileText size={15} aria-hidden="true" /> Zobrazit PDF {endorsement ? "dodatku" : "smlouvy"}
        </button>}
        {(props.onEditEntry || (hasFile && props.onRefreshPdf)) && <div className="flex flex-wrap gap-2">
          {props.onEditEntry && <button type="button" className={`${styles.pdf} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={props.editingDisabled} onClick={() => props.onEditEntry?.(entry.id)}>
            <PencilLine size={15} aria-hidden="true" /> Upravit {endorsement ? "dodatek" : "smlouvu"}
          </button>}
          {hasFile && props.onRefreshPdf && <button type="button" className={`${styles.pdf} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={props.pdfRefreshDisabled} onClick={() => props.onRefreshPdf?.(entry.id)}>
            <FileText size={15} aria-hidden="true" /> Doplnit údaje z PDF
          </button>}
        </div>}
        {expanded && <>
        <ContractCommissionSection
          product={entry.productKey} isOwnContract={own}
          isPaymentBasedProduct={paymentBased}
          hideAnnualAutoTotals={true} showAnyMeziprovision={managerCards.length > 0}
          meziprovisionCards={managerCards} expandedMeziprovisionKeys={showManagerDetails ? managerCards.map(card => card.key) : []}
          onToggleMeziprovisionCard={() => setShowManagerDetails(value => !value)}
          adviserItems={adviserItems} commissionPayouts={payouts} viewerEmail={viewer} contractOwnerEmail={owner}
          contractDurationYears={entry.durationYears} paymentFrequency={entry.frequencyRaw} policyStartDate={entry.policyStartDate}
          commissionEntry={entry} commissionTimeline={props.entries}
          onOpenStatement={props.onOpenStatement} statementPreviewLoadingId={props.statementPreviewLoadingId}
          adviserBreakdownPosition={entry.position ?? null} adviserBreakdownMode={commissionMode(entry.commissionMode)}
          paymentBasedAdviserTotals={paymentBased ? paymentBasedTotals(adviserItems, multiplier) : null}
          adviserTotalDisplay={paymentBased ? computeTotalWithMultipliers(adviserItems) * multiplier
            : finite(entry.total) ?? computeTotalWithMultipliers(adviserItems)}
          contractAuthorName={nameFromEmail(owner)} showAdvisorDetails={showAdvisorDetails}
          onToggleAdvisorDetails={() => setShowAdvisorDetails(value => !value)}
          onOpenNeonImmediateBreakdown={(item, position, mode) => props.onOpenNeonImmediateBreakdown(entry, item, position, mode)}
        />
        <ContractCommissionHistory product={entry.productKey} policyStartDate={entry.policyStartDate}
          payouts={payouts} viewerEmail={viewer} contractOwnerEmail={owner}
          onOpenStatement={props.onOpenStatement} statementPreviewLoadingId={props.statementPreviewLoadingId} />
        </>}
        {isInheritedContract(entry) && <p className={styles.explanation}>Převzatá smlouva · provize podle nároku na správu.</p>}
      </div>
    </details>
  );
}

export function ContractTimelineSection(props: Props) {
  useEffect(() => {
    const revealEntry = (hash = window.location.hash.slice(1)) => {
      for (const entry of props.entries) {
        if (hash !== contractTimelineEntryAnchor(entry.id) && hash !== encodeURIComponent(contractTimelineEntryAnchor(entry.id))) continue;
        const target = document.getElementById(contractTimelineEntryAnchor(entry.id));
        if (target instanceof HTMLDetailsElement) target.open = true;
      }
    };
    revealEntry();
    const onHashChange = () => revealEntry();
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      const href = anchor?.getAttribute("href");
      if (href?.startsWith("#contract-entry-")) revealEntry(href.slice(1));
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onAnchorClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onAnchorClick);
    };
  }, [props.entries]);

  let endorsementIndex = 0;
  return (
    <section className={styles.section}>
      <ContractSectionHeading icon={<CalendarDays size={17} aria-hidden="true" />}>Smlouva a dodatky</ContractSectionHeading>
      <p className={styles.explanation}>Původní smlouvu i jednotlivé změny rozbalíš přímo tady, včetně jejich provizí a výplat.</p>
      {props.loading && <p className={styles.explanation}>Načítám historii změn…</p>}
      {props.error && <p className={styles.explanation} role="alert">{props.error}</p>}
      {!props.loading && !props.error && props.entries.map(entry => {
        const label = entry.entryType === "endorsement" ? `Dodatek ${++endorsementIndex}` : "Původní smlouva";
        return <TimelineEntry key={entry.id} {...props} entry={entry} label={label} />;
      })}
    </section>
  );
}
