import Image from "next/image";
import { ArrowRight, BrainCircuit, ChevronDown, ExternalLink, UserRound, UsersRound } from "lucide-react";
import { getProductMetadata } from "@/app/lib/productCatalog";
import { contractPortalLinks } from "@/app/lib/contractPortalLinks";
import {
  commissionLabelForItem, commissionMeaning, dateRangeLabel,
  cashflowItemDisplayStatus, nonLifeCommissionDetail, payoutStatusLabel, type CashflowDisplayGroup,
} from "../commissionPresentation";
import { formatCashflowAmount } from "../cashflowLabels";
import { formatMoney, frequencyText, productLabel, STORNO_FUND_RATE } from "../helpers";
import { subscriptionPlanLabel } from "../subscriptionCashflow";
import styles from "../commissionCard.module.css";

function commissionCount(count: number): string {
  return `${count} ${count === 1 ? "provize" : count <= 4 ? "provize" : "provizí"}`;
}

const payoutMonth = (date: Date) => date.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

export function CashflowCommissionCard({ group }: { group: CashflowDisplayGroup }) {
  const item = group.leadItem;
  const isTip = item.isTipPayout === true;
  const isSubscription = item.isSubscriptionPayment === true;
  const isExtra = item.isExtraPayout === true;
  const isContract = !isTip && !isSubscription && !isExtra;
  const isTeam = isContract && (item.source === "manager" || item.isManagerOverride);
  const SourceIcon = isTeam ? UsersRound : UserRound;
  const clientName = isExtra ? item.commissionLabel?.trim() || "Mimořádná odměna"
    : item.clientName?.trim() || (isSubscription ? "Uživatel neuveden" : "Klient neuveden");
  const contractNumber = isExtra ? null : item.contractNumber?.trim() || null;
  const product = isExtra || item.productKey === "unknown" || item.productKey === "subscription"
    ? null : getProductMetadata(item.productKey);
  const fullProductLabel = productLabel(item.productKey);
  const compactProductLabel = product && fullProductLabel.toLocaleLowerCase("cs-CZ").startsWith(`${product.institutionLabel.toLocaleLowerCase("cs-CZ")} `)
    ? fullProductLabel.slice(product.institutionLabel.length).trim() : fullProductLabel;
  const ownerEmail = item.ownerEmail?.trim().toLowerCase();
  const entryId = item.entryId?.trim();
  const href = isContract && ownerEmail && entryId
    ? `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}` : null;
  const portalLinks = isContract ? group.items.map(contractPortalLinks) : [];
  const maxxHref = portalLinks.find(links => links.maxxContractDetailUrl)?.maxxContractDetailUrl;
  const extranetHref = portalLinks.find(links => links.extranetContractDetailUrl)?.extranetContractDetailUrl;
  const statuses = new Set(group.items.map(cashflowItemDisplayStatus));
  const status = statuses.size === 1 ? cashflowItemDisplayStatus(item) : "mixed";
  const cancelled = status === "cancelled";
  const statusLabel = status === "mixed" ? "Různé stavy"
    : isSubscription ? status === "paid" ? "Zaplaceno" : "Očekáváno"
    : payoutStatusLabel(status, group.items);
  const itemStatusLabels = group.items.map(part => payoutStatusLabel(cashflowItemDisplayStatus(part), [part]));
  const hasDifferentStatusLabels = new Set(itemStatusLabels).size > 1;
  const hasDifferentDates = new Set(group.items.map((part) => part.date.toLocaleDateString("cs-CZ"))).size > 1;
  const sourceLabel = isExtra ? "Mimořádná odměna" : isTip ? "TIP provize" : isSubscription ? "Předplatné" : isTeam ? "Týmová smlouva" : "Vlastní smlouva";
  const periodLabel = isExtra ? item.date.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }) : dateRangeLabel(group.items);
  const nonLife = isExtra ? null : nonLifeCommissionDetail(item);
  const meaning = item.isOfficeContribution ? {
    title: "Příspěvek na kancelář",
    text: item.payoutStatus === "paid"
      ? "Příspěvek z části Ostatní platby je již zahrnutý v celkové výplatě provizního výpisu."
      : "Odhad 10.000 Kč měsíčně podle nastavení. Výplata závisí na splnění podmínek příspěvku.",
  } : isExtra ? {
    title: "Mimořádná odměna",
    text: "Vyplacená odměna mimo provizní výpis. Celá částka se započítává do příjmů tohoto měsíce.",
  } : cancelled ? {
    title: "Storno provize",
    text: "Storno nebo související oprava dřívější provize. Záporná částka snižuje příjem v tomto měsíci.",
  } : nonLife
    ? { title: nonLife.commissionTypeLabel, text: nonLife.commissionText }
    : commissionMeaning(commissionLabelForItem(item), isTip, isSubscription);
  const predictions = isExtra ? [] : group.items.flatMap((part) => part.predictionAdjustment ? [part.predictionAdjustment] : []);
  const predictionLabels = [...new Set(predictions.map((prediction) => prediction.label))];
  const baseAmount = group.items.reduce((sum, part) => sum + (part.predictionAdjustment?.baseAmount ?? part.amount), 0);
  const hasUnknownAmount = group.items.some(part => part.amountUnknown);
  const hasDeduction = group.stornoFundAmount !== 0;
  const netLabel = isExtra ? status === "paid" ? "Vyplaceno" : "Předpoklad" : isSubscription ? "Částka" : hasDeduction || hasUnknownAmount ? "Po odpočtu" : "Bez odpočtu";
  const deductionLabel = group.stornoFundAmount === 0 && !hasUnknownAmount ? "Bez odpočtu"
    : `${group.stornoFundAmount === 0 ? "" : group.stornoFundAmount > 0 ? "− " : "+ "}${formatCashflowAmount(Math.abs(group.stornoFundAmount), hasUnknownAmount)}`;

  return (
    <details className={`${styles.card} ${isContract ? isTeam ? styles.teamCard : styles.ownCard : ""}`} data-cashflow-card={group.id} data-cancelled={cancelled || undefined}>
      <summary className={styles.summary}>
        <span className={styles.product}>
          {product && <Image src={product.institutionLogo} alt={product.institutionLabel} width={40} height={24} className={styles.insurerLogo} />}
          <span>{isExtra ? periodLabel : compactProductLabel}</span>
        </span>
        <h4 className={styles.client}>{clientName}</h4>
        <span className={styles.contractNumber}>
          {contractNumber && <><span className={styles.srOnly}>Smlouva </span>{contractNumber}</>}
        </span>
        <div className={styles.source}>
          {isContract && <span className={`${styles.sourceBadge} ${isTeam ? styles.teamSource : styles.ownSource}`}>
            <SourceIcon size={13} aria-hidden="true" />{sourceLabel}
          </span>}
        </div>
        <div className={styles.badges}>
          <span className={`${styles.status} ${styles[status]}`}>{statusLabel}</span>
          {!isExtra && group.items.length > 1 && <span className={styles.count}>{commissionCount(group.items.length)}</span>}
          {isTip && <span className={styles.meta}>TIP provize</span>}
          {predictions.length > 0 && <span className={styles.predictionIndicator}><BrainCircuit size={13} aria-hidden="true" />S predikcí</span>}
        </div>
        <div className={styles.summaryAmount}>
          {hasDeduction && <>
            <span className={styles.beforeDeduction}><span className={styles.srOnly}>Před odpočtem stornofondu </span>{formatCashflowAmount(group.amount, hasUnknownAmount)}</span>
            <ArrowRight size={16} className={styles.amountArrow} aria-hidden="true" />
          </>}
          <strong className={group.netAmount < 0 ? styles.negativeAmount : styles.netAmount}><span className={styles.srOnly}>{netLabel}</span>{formatCashflowAmount(group.netAmount, hasUnknownAmount)}</strong>
        </div>
        <span className={styles.chevron}><ChevronDown size={17} aria-hidden="true" /></span>
      </summary>

      <div className={styles.detail}>
        <div className={styles.detailHeader}>
          <div className={styles.detailTitle}>
            <h5>{isExtra ? "Rozpis odměny" : isSubscription ? "Rozpis platby" : "Rozpad provizí"}</h5>
            <span>{periodLabel}</span>
          </div>
          {(href || maxxHref || extranetHref) && <nav className={styles.contractActions} aria-label="Odkazy ke smlouvě">
            {href && <a className={styles.contractLink} href={href} target="_blank" rel="noopener noreferrer" aria-label="Otevřít smlouvu" title="Otevřít smlouvu v Bohemka.App">
              Smlouva <ExternalLink size={13} aria-hidden="true" />
            </a>}
            {maxxHref && <a className={styles.portalLink} href={maxxHref} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label="Otevřít smlouvu v MAXX">
              MAXX <ExternalLink size={13} aria-hidden="true" />
            </a>}
            {extranetHref && <a className={styles.portalLink} href={extranetHref} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label="Otevřít smlouvu v Extranetu">
              Extranet <ExternalLink size={13} aria-hidden="true" />
            </a>}
          </nav>}
        </div>
        <div className={styles.detailGrid}>
          <div className={styles.breakdown}>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>{isExtra ? `${clientName}: částka` : `Provize pro ${clientName}: částky před odpočtem a po odpočtu stornofondu`}</caption>
                <thead><tr>
                  <th scope="col">{isExtra ? "Výplata" : isSubscription ? "Platba" : "Provize"}</th>
                  {!isExtra && <th scope="col">Před odpočtem</th>}
                  <th scope="col">{isExtra ? "Částka" : "Po odpočtu"}</th>
                </tr></thead>
                <tbody>{group.items.map((part, index) => {
                  const deduction = part.isExtraPayout || part.isSubscriptionPayment
                    ? 0 : part.amount * STORNO_FUND_RATE;
                  const net = part.amount - deduction;
                  return <tr key={part.id}>
                    <th scope="row">
                      <span className={styles.partName}>{isExtra ? part.commissionLabel?.trim() || "Mimořádná odměna" : commissionLabelForItem(part) ?? (isSubscription ? "Předplatné" : "Provize")}</span>
                      {part.commissionCodeCorrectionNote && <span className={styles.meta}>{part.commissionCodeCorrectionNote}</span>}
                      {part.installmentCoverageNote && <span className={styles.meta}>{part.installmentCoverageNote}</span>}
                      {part.payoutPlanStatus === "matched" && <span className={styles.partMeta}>
                        Nahrazuje {part.matchedPlannedCode}{part.commissionPeriodStart && ` · období od ${part.commissionPeriodStart.split("-").reverse().join(".")}`}
                      </span>}
                      {part.premiumChangeOriginalAmount != null && part.premiumChangeEffectiveDate && <span className={styles.partMeta}>
                        Podle dodatku od {part.premiumChangeEffectiveDate.split("-").reverse().join(". ")}: {formatMoney(part.premiumChangeOriginalAmount)} → {formatMoney(part.predictionAdjustment?.baseAmount ?? part.amount)}
                      </span>}
                      {part.payoutStatus !== "paid" && part.autoCommissionForecastMinimum != null && part.autoCommissionForecastMaximum != null && <span className={styles.partMeta}>
                        {part.autoCommissionConfirmedPolicyYear || part.autoCommissionFromSavedPremium
                          ? `Očekáváno ${formatMoney(part.autoCommissionForecastMinimum)}`
                          : `Odhad ${formatMoney(part.autoCommissionForecastMinimum)}–${formatMoney(part.autoCommissionForecastMaximum)}`}
                      </span>}
                      {part.originalDate && Number.isFinite(part.originalDate.getTime()) && (part.payoutStatus === "shifted" || part.payoutStatus === "paid") && <span className={styles.partMeta}>
                        Původní odhad {payoutMonth(part.originalDate)} · {part.payoutStatus === "paid" ? "Měsíc výplaty" : "Nový odhad"} {payoutMonth(part.date)}
                        {part.payoutStatus === "paid" && part.commissionStatementNumber && ` · výpis č. ${part.commissionStatementNumber}`}
                      </span>}
                      {!isExtra && (hasDifferentDates || hasDifferentStatusLabels) && <span className={styles.partMeta}>
                        {hasDifferentDates && part.date.toLocaleDateString("cs-CZ")}
                        {hasDifferentDates && hasDifferentStatusLabels && " · "}
                        {hasDifferentStatusLabels && itemStatusLabels[index]}
                      </span>}
                    </th>
                    {!isExtra && <td>{formatCashflowAmount(part.amount, part.amountUnknown)}</td>}
                    <td className={net < 0 ? styles.negativeAmount : undefined}>{formatCashflowAmount(net, part.amountUnknown)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {hasUnknownAmount && <p className={styles.meaning}>Částka čeká na doplnění provizní základny nebo výplatu z výpisu.</p>}
            {group.items.length === 1 && <p className={styles.meaning}><strong>{meaning.title}.</strong> {meaning.text}</p>}
          </div>

          <dl className={`${styles.settlement} ${isExtra ? styles.extraSettlement : ""}`}>
            {!isExtra && <div><dt>{isSubscription ? "Platba" : "Před odpočtem"}</dt><dd>{formatCashflowAmount(group.amount, hasUnknownAmount)}</dd></div>}
            {!isExtra && <div><dt>Stornofond {Math.round(STORNO_FUND_RATE * 100)} %</dt><dd className={group.stornoFundAmount > 0 ? styles.deduction : undefined}>{deductionLabel}</dd></div>}
            <div className={styles.settlementNet}>
              <dt>{netLabel}</dt>
              <dd className={group.netAmount < 0 ? styles.negativeAmount : styles.netAmount}>{formatCashflowAmount(group.netAmount, hasUnknownAmount)}</dd>
            </div>
          </dl>
        </div>

        <dl className={styles.facts}>
          <div><dt>Zdroj</dt><dd>{sourceLabel}</dd></div>
          {isContract && <div><dt>Frekvence platby</dt><dd>{frequencyText(item.frequency)}</dd></div>}
          {!isSubscription && !isExtra && item.inputAmount != null && Number.isFinite(item.inputAmount) && item.inputAmount > 0 && <div>
            <dt>Zadané pojistné</dt><dd>{formatMoney(item.inputAmount)}</dd>
          </div>}
          {nonLife && <div><dt>Typ provize</dt><dd>{cancelled ? "Storno / srážka" : nonLife.commissionTypeLabel}</dd></div>}
          {nonLife && <div><dt>Výplata provize</dt><dd>{cancelled ? "Oprava podle výpisu" : nonLife.payoutModeLabel}</dd></div>}
          {nonLife?.firstAnniversaryLabel && <div><dt>1. výročí smlouvy</dt><dd>{nonLife.firstAnniversaryLabel}</dd></div>}
          {isSubscription && <div><dt>Tarif</dt><dd>{subscriptionPlanLabel(item.subscriptionPlan)}</dd></div>}
          {isSubscription && item.subscriptionPeriodFrom && item.subscriptionPeriodUntil && <div>
            <dt>Období</dt><dd>{item.subscriptionPeriodFrom} – {item.subscriptionPeriodUntil}</dd>
          </div>}
        </dl>

        {predictions.length > 0 && <div className={styles.prediction}>
          <BrainCircuit size={17} aria-hidden="true" />
          <p><strong>Inteligentní predikce</strong><span>{predictionLabels.join(" · ")}</span></p>
          <span className={styles.predictionAmounts}>{formatMoney(baseAmount)} → <strong>{formatMoney(group.amount)}</strong></span>
        </div>}
      </div>
    </details>
  );
}
