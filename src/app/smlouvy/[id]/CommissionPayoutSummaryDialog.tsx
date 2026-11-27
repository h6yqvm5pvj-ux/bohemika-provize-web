import { useEffect, useId, useRef, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Banknote, ChartNoAxesColumnIncreasing, ChevronDown, CircleMinus, Eye, ListChecks, X } from "lucide-react";
import { formatMoney } from "./contractDetailHelpers";
import { payoutCents, type summarizeCommissionPayouts } from "./commissionPayoutComparison";
import type { ContractCommissionPayout } from "./contractDetailTypes";
import styles from "./commissionPayoutSummary.module.css";

const money = (cents: number) => formatMoney(cents / 100);
const recordedMoney = (amount?: number | null) => typeof amount === "number" && Number.isFinite(amount) ? formatMoney(amount) : "—";
const signedMoney = (cents: number) => cents > 0 ? `+${money(cents)}` : money(cents);
const percent = new Intl.NumberFormat("cs-CZ", { style: "percent", maximumFractionDigits: 1 });

function StatementRow({ record, code, onOpenStatement }: {
  record: ContractCommissionPayout;
  code: string;
  onOpenStatement?: (id: string, codes: string[]) => void;
}) {
  const statementCode = record.statementCode || record.installmentSourceCode || record.code || code;
  const base = record.sourceBaseAmount ?? record.statementBaseAmount;
  const statementId = record.statementId;
  const hasStatement = Boolean(statementId || record.statementNumber || record.statementPeriod || record.statementDate);
  return (
    <div className={styles.statement}>
      <div className={styles.statementTitle}>
        <span className={styles.code}>{statementCode || "Bez kódu"}</span>
        <strong>{money(payoutCents(record))}</strong>
        {record.installmentCoverageNote && <span className={styles.sourceNote}>{record.installmentCoverageNote}</span>}
      </div>
      <dl>
        <div><dt>Základna ve výpisu{record.basePremiumPeriod === "annual" ? " (roční)" : ""}</dt><dd>{recordedMoney(base)}</dd></div>
        <div><dt>Základna při zápisu</dt><dd>{recordedMoney(record.systemBaseAmount)}</dd></div>
        <div><dt>Pozice ve výpisu</dt><dd>{record.career || "—"}</dd></div>
      </dl>
      {hasStatement && <div className={styles.statementSource}>
        {onOpenStatement && statementId ? (
          <button type="button" onClick={() => onOpenStatement(statementId, statementCode ? [statementCode] : [])}>
            <Eye size={15} aria-hidden="true" /> Výpis{record.statementNumber ? ` ${record.statementNumber}` : ""}
          </button>
        ) : <span>Výpis{record.statementNumber ? ` ${record.statementNumber}` : ""}</span>}
        {(record.statementPeriod || record.statementDate) && <span>{record.statementPeriod || record.statementDate}</span>}
      </div>}
    </div>
  );
}

export function CommissionPayoutSummaryDialog({ summary, onClose, onOpenStatement }: {
  summary: ReturnType<typeof summarizeCommissionPayouts>;
  onClose: () => void;
  onOpenStatement?: (id: string, codes: string[]) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const hasComparison = summary.rows.length > summary.uncomparedCount;
  const difference = summary.compared - summary.expected;
  const maximum = Math.max(summary.compared, summary.expected, 1);
  const ratio = summary.expected > 0 ? percent.format(summary.compared / summary.expected) : null;
  const showCancellation = summary.isCancelled && summary.rows.length > 0;
  const retainedShare = summary.paidBeforeStorno > 0 && summary.storno < 0 && summary.paid >= 0
    ? summary.paid / summary.paidBeforeStorno : null;

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className={styles.dialog}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
      }}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.headerIcon}><ChartNoAxesColumnIncreasing size={23} aria-hidden="true" /></span>
          <div>
            <h2 id={titleId}>Souhrn výplat provizí</h2>
            <p>{showCancellation ? "Původní provize a odúčtování z výpisů." : "Výplaty z výpisů a očekávané částky pro stejné složky provize."}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Zavřít souhrn"><X size={21} aria-hidden="true" /></button>
        </header>
        <div className={styles.content}>
          {showCancellation ? (
            <section className={`${styles.overview} ${styles.cancellationOverview}`} aria-label="Vyúčtování stornované smlouvy">
              <dl className={styles.cancellationLedger}>
                <div>
                  <dt><ListChecks size={15} aria-hidden="true" />Očekáváno</dt>
                  <dd>{hasComparison ? money(summary.expected) : "—"}</dd>
                </div>
                <div>
                  <dt><Banknote size={15} aria-hidden="true" />Vyplaceno</dt>
                  <dd>{summary.hasPayment ? money(summary.paidBeforeStorno) : "—"}</dd>
                </div>
                <div className={styles.cancellationDeduction}>
                  <dt><CircleMinus size={15} aria-hidden="true" />{summary.hasUndatedDeduction ? "Odúčtování z výpisů" : "Storno"}</dt>
                  <dd>{summary.storno ? money(summary.storno) : <small>Bez zapsané srážky</small>}</dd>
                </div>
              </dl>
              <div className={styles.cancellationBalance}>
                <span>{summary.hasUndatedDeduction ? "Po odúčtování" : "Po stornu"}</span>
                <strong>{money(summary.paid)}</strong>
                {retainedShare !== null && <div className={styles.cancellationShare}>
                  <div className={styles.cancellationTrack} aria-hidden="true">
                    <span style={{ width: `${retainedShare * 100}%` }} />
                  </div>
                  <small>{percent.format(retainedShare)} z výplaty</small>
                </div>}
              </div>
              {(summary.above > 0 || summary.below > 0) && <div className={styles.offsets} data-before-storno>
                <strong>Rozdíly před stornem</strong>
                {summary.above > 0 && <span data-delta="above"><ArrowUp size={15} aria-hidden="true" /> Nad očekávání <strong>{money(summary.above)}</strong></span>}
                {summary.below > 0 && <span data-delta="below"><ArrowDown size={15} aria-hidden="true" /> Pod očekáváním <strong>{money(summary.below)}</strong></span>}
              </div>}
            </section>
          ) : hasComparison && (
            <section className={styles.overview} aria-label="Porovnání plánu s výplatami">
              <div className={styles.chart}>
                <div className={styles.chartRow}>
                  <span>Očekáváno</span><strong>{money(summary.expected)}</strong>
                  <span className={styles.track} aria-hidden="true"><span style={{ "--bar": `${Math.max(0, summary.expected / maximum) * 100}%` } as CSSProperties} /></span>
                </div>
                <div className={styles.chartRow} data-actual>
                  <span>{summary.uncomparedCount > 0 ? "Spárované výplaty" : "Vyplaceno"}</span><strong>{money(summary.compared)}</strong>
                  <span className={styles.track} aria-hidden="true"><span style={{ "--bar": `${Math.max(0, summary.compared / maximum) * 100}%` } as CSSProperties} /></span>
                </div>
              </div>
              <div className={styles.result}>
                <span>Rozdíl celkem</span>
                <strong data-delta={difference > 0 ? "above" : difference < 0 ? "below" : undefined}>{signedMoney(difference)}</strong>
                {ratio && <small>{ratio} očekávané částky</small>}
              </div>
              <div className={styles.offsets}>
                <span><ArrowUp size={15} aria-hidden="true" /> Nad očekávání <strong>{money(summary.above)}</strong></span>
                <span><ArrowDown size={15} aria-hidden="true" /> Pod očekáváním <strong>{money(summary.below)}</strong></span>
              </div>
            </section>
          )}
          {summary.uncomparedCount > 0 && <p className={styles.notice}>{showCancellation
            ? "U části položek výpisu chybí spolehlivé srovnání s plánem."
            : <>Zapsané výplaty celkem <strong>{money(summary.paid)}</strong>. Pro část výplat v součtu <strong>{money(summary.uncompared)}</strong> chybí spolehlivé srovnání s plánem.</>}
          </p>}
          {summary.rows.length > 0 ? (
            <section className={styles.breakdown}>
              <h3>Rozpis výplat</h3>
              <div className={styles.rows} data-cancelled={showCancellation || undefined}>
                {summary.rows.map((row, index) => {
                  const delta = row.expected === null || row.hasUndatedDeduction ? null
                    : (showCancellation ? row.paidBeforeStorno : row.paid) - row.expected;
                  const codes = [...new Set(row.records.map(record => record.statementCode || record.installmentSourceCode || record.code).filter(Boolean))];
                  const plannedDeduction = row.expected != null && row.expected < 0;
                  const paid = showCancellation ? row.paidBeforeStorno : row.paid;
                  const showPaid = !showCancellation || row.hasPayment || plannedDeduction;
                  return (
                    <details key={index}>
                      <summary>
                        <span className={styles.identity}>
                          <strong>{row.title}</strong>
                          {codes.length > 0 && <span>{codes.join(" · ")}</span>}
                        </span>
                        <span className={styles.metric}><small>Očekáváno</small><strong>{row.expected === null ? "—" : money(row.expected)}</strong></span>
                        <span className={styles.metric}><small>{plannedDeduction ? "Odečteno" : "Vyplaceno"}</small>
                          <strong>{showPaid ? money(paid) : "—"}</strong>
                        </span>
                        {showCancellation ? <>
                          <span className={`${styles.metric} ${styles.rowDeduction}`}><small>{row.hasUndatedDeduction ? "Odúčtování" : "Storno"}</small><strong>{row.storno ? money(row.storno) : "—"}</strong></span>
                          <span className={`${styles.metric} ${styles.rowBalance}`}><small>{row.hasUndatedDeduction ? "Po odúčtování" : "Po stornu"}</small><strong>{money(row.paid)}</strong></span>
                        </> : <span className={styles.metric} data-delta={delta === null ? undefined : delta > 0 ? "above" : delta < 0 ? "below" : "even"}>
                          <small>Rozdíl</small><strong>{delta === null ? "—" : signedMoney(delta)}</strong>
                        </span>}
                        <ChevronDown size={17} aria-hidden="true" className={styles.chevron} />
                      </summary>
                      <div className={styles.rowDetail}>
                        {(row.position || row.note) && <p>{row.position && <>Pozice výpočtu <strong>{row.position}</strong></>}{row.note && <span>{row.note}</span>}</p>}
                        {showCancellation && delta !== null && delta !== 0 && (
                          <p>Rozdíl před stornem <strong data-delta={delta > 0 ? "above" : "below"}>{signedMoney(delta)}</strong></p>
                        )}
                        {row.records.map((record, receiptIndex) => <StatementRow key={receiptIndex} record={record} code={row.code} onOpenStatement={onOpenStatement} />)}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ) : <p className={styles.empty}>Na smlouvě zatím nejsou zapsané žádné výplaty provizí.</p>}
        </div>
      </div>
    </dialog>
  );
}
