import { BrainCircuit, ChevronDown, ExternalLink, UserRound, UsersRound } from "lucide-react";
import {
  commissionLabelForItem, commissionMeaning, dateRangeLabel,
  nonLifeCommissionDetail, payoutStatusLabel, type CashflowDisplayGroup,
} from "../commissionPresentation";
import { formatMoney, frequencyText, productLabel, STORNO_EXEMPT_PRODUCT, STORNO_FUND_RATE } from "../helpers";
import { subscriptionPlanLabel } from "../subscriptionCashflow";
import styles from "../commissionCard.module.css";

function commissionCount(count: number): string {
  return `${count} ${count === 1 ? "provize" : count <= 4 ? "provize" : "provizí"}`;
}

export function CashflowCommissionCard({ group }: { group: CashflowDisplayGroup }) {
  const item = group.leadItem;
  const isTip = item.isTipPayout === true;
  const isSubscription = item.isSubscriptionPayment === true;
  const isTeam = !isTip && !isSubscription && (item.source === "manager" || item.isManagerOverride);
  const SourceIcon = isTeam ? UsersRound : UserRound;
  const clientName = item.clientName?.trim() || (isSubscription ? "Uživatel neuveden" : "Klient neuveden");
  const contractNumber = item.contractNumber?.trim() || null;
  const ownerEmail = item.ownerEmail?.trim().toLowerCase();
  const entryId = item.entryId?.trim();
  const href = !isTip && !isSubscription && ownerEmail && entryId
    ? `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}` : null;
  const statuses = new Set(group.items.map((part) => part.payoutStatus ?? "predicted"));
  const status = statuses.size === 1 ? (item.payoutStatus ?? "predicted") : "mixed";
  const statusLabel = status === "mixed" ? "Různé stavy"
    : isSubscription ? status === "paid" ? "Zaplaceno" : "Očekáváno"
    : payoutStatusLabel(status);
  const hasDifferentDates = new Set(group.items.map((part) => part.date.toLocaleDateString("cs-CZ"))).size > 1;
  const sourceLabel = isTip ? "TIP provize" : isSubscription ? "Předplatné" : isTeam ? "Týmová smlouva" : "Vlastní smlouva";
  const nonLife = nonLifeCommissionDetail(item);
  const meaning = nonLife
    ? { title: nonLife.commissionTypeLabel, text: nonLife.commissionText }
    : commissionMeaning(commissionLabelForItem(item), isTip, isSubscription);
  const predictions = group.items.flatMap((part) => part.predictionAdjustment ? [part.predictionAdjustment] : []);
  const predictionLabels = [...new Set(predictions.map((prediction) => prediction.label))];
  const baseAmount = group.items.reduce((sum, part) => sum + (part.predictionAdjustment?.baseAmount ?? part.amount), 0);
  const hasDeduction = group.stornoFundAmount !== 0;
  const netLabel = isSubscription ? "Částka" : hasDeduction ? "Po odpočtu" : "Bez odpočtu";
  const deductionLabel = group.stornoFundAmount === 0 ? "Bez odpočtu"
    : `${group.stornoFundAmount > 0 ? "−" : "+"} ${formatMoney(Math.abs(group.stornoFundAmount))}`;

  return (
    <details className={`${styles.card} ${!isTip && !isSubscription ? isTeam ? styles.teamCard : styles.ownCard : ""}`} data-cashflow-card={group.id}>
      <summary className={styles.summary}>
        <div className={styles.identity}>
          <div className={styles.headline}>
            <h4 className={styles.client}>{clientName}</h4>
            {!isTip && !isSubscription && <span className={`${styles.sourceBadge} ${isTeam ? styles.teamSource : styles.ownSource}`}>
              <SourceIcon size={13} aria-hidden="true" />{sourceLabel}
            </span>}
            {group.items.length > 1 && <span className={styles.count}>{commissionCount(group.items.length)}</span>}
            <span className={`${styles.status} ${styles[status]}`}>{statusLabel}</span>
          </div>
          <div className={styles.meta}>
            <span className={styles.product}>{productLabel(item.productKey)}</span>
            {contractNumber && <span>Smlouva {contractNumber}</span>}
            {isTip && <span>TIP provize</span>}
            {predictions.length > 0 && <span className={styles.predictionIndicator}><BrainCircuit size={13} aria-hidden="true" />S predikcí</span>}
          </div>
        </div>
        <div className={styles.summaryAmount}>
          <span className={styles.netLabel}>{netLabel}</span>
          <strong className={group.netAmount < 0 ? styles.negativeAmount : styles.netAmount}>{formatMoney(group.netAmount)}</strong>
          {hasDeduction && <span className={styles.beforeDeduction}>Před odpočtem {formatMoney(group.amount)}</span>}
        </div>
        <span className={styles.chevron}><ChevronDown size={17} aria-hidden="true" /></span>
      </summary>

      <div className={styles.detail}>
        <div className={styles.detailGrid}>
          <div className={styles.breakdown}>
            <div className={styles.tableHeading}>
              <h5>{isSubscription ? "Rozpis platby" : "Rozpad provizí"}</h5>
              <span>{dateRangeLabel(group.items)}{status !== "mixed" && ` · ${statusLabel}`}</span>
            </div>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>Provize pro {clientName}: částky před odpočtem a po odpočtu stornofondu</caption>
                <thead><tr>
                  <th scope="col">{isSubscription ? "Platba" : "Provize"}</th>
                  <th scope="col">Před odpočtem</th>
                  <th scope="col">Po odpočtu</th>
                </tr></thead>
                <tbody>{group.items.map((part) => {
                  const deduction = part.isSubscriptionPayment || part.productKey === STORNO_EXEMPT_PRODUCT
                    ? 0 : part.amount * STORNO_FUND_RATE;
                  const net = part.amount - deduction;
                  return <tr key={part.id}>
                    <th scope="row">
                      <span className={styles.partName}>{commissionLabelForItem(part) ?? (isSubscription ? "Předplatné" : "Provize")}</span>
                      {(hasDifferentDates || status === "mixed") && <span className={styles.partMeta}>
                        {hasDifferentDates && part.date.toLocaleDateString("cs-CZ")}
                        {hasDifferentDates && status === "mixed" && " · "}
                        {status === "mixed" && payoutStatusLabel(part.payoutStatus)}
                      </span>}
                    </th>
                    <td>{formatMoney(part.amount)}</td>
                    <td className={net < 0 ? styles.negativeAmount : undefined}>{formatMoney(net)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {group.items.length === 1 && <p className={styles.meaning}><strong>{meaning.title}.</strong> {meaning.text}</p>}
          </div>

          <dl className={styles.settlement}>
            <div><dt>{isSubscription ? "Platba" : "Před odpočtem"}</dt><dd>{formatMoney(group.amount)}</dd></div>
            <div><dt>Stornofond {Math.round(STORNO_FUND_RATE * 100)} %</dt><dd className={group.stornoFundAmount > 0 ? styles.deduction : undefined}>{deductionLabel}</dd></div>
            <div className={styles.settlementNet}>
              <dt>{netLabel}</dt>
              <dd className={group.netAmount < 0 ? styles.negativeAmount : styles.netAmount}>{formatMoney(group.netAmount)}</dd>
            </div>
          </dl>
        </div>

        <dl className={styles.facts}>
          <div><dt>Zdroj</dt><dd>{sourceLabel}</dd></div>
          {!isSubscription && !isTip && <div><dt>Frekvence platby</dt><dd>{frequencyText(item.frequency)}</dd></div>}
          {!isSubscription && item.inputAmount != null && Number.isFinite(item.inputAmount) && item.inputAmount > 0 && <div>
            <dt>{item.productKey === STORNO_EXEMPT_PRODUCT ? "Částka ve smlouvě" : "Zadané pojistné"}</dt><dd>{formatMoney(item.inputAmount)}</dd>
          </div>}
          {nonLife && <div><dt>Typ provize</dt><dd>{nonLife.commissionTypeLabel}</dd></div>}
          {nonLife && <div><dt>Výplata provize</dt><dd>{nonLife.payoutModeLabel}</dd></div>}
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
        {href && <div className={styles.actions}><a href={href} target="_blank" rel="noreferrer">
          Otevřít smlouvu <ExternalLink size={14} aria-hidden="true" />
        </a></div>}
      </div>
    </details>
  );
}
