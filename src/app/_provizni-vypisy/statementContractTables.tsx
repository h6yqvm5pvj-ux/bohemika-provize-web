import { ReceiptText } from "lucide-react";
import styles from "./statementContractDetail.module.css";

import {
  classifyGeneralCommissionCode,
  formatMoney,
  formatWholeMoney,
  resolveStatementProduct,
} from "./statementParsing";
import type {
  CommissionRow,
  GeneralCommissionKind,
  OtherPayment,
} from "./statementTypes";

export function LifeSplitCommissionTable({
  rows,
  b36Payments,
  b36HalfLabel,
  pairedB36PaymentIndexes,
}: {
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
  b36HalfLabel: string;
  pairedB36PaymentIndexes: Set<number>;
}) {
  return (
    <div className={styles.lineItems} data-kind="life">
      <h5 className={styles.lineItemsHeading}><ReceiptText aria-hidden="true" />Položky z provizního výpisu</h5>
      <p className={styles.tableHint}>Další sloupce zobrazíš posunutím do strany →</p>
      <div className={styles.tableScroll} role="region" aria-label="Položky z provizního výpisu" tabIndex={0}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Kód</th>
            <th scope="col">Význam</th>
            <th scope="col">Základna</th>
            <th scope="col">Procento</th>
            <th scope="col">Provize</th>
            <th scope="col">Rez. fond</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.id}-${row.type}-${row.commission}`}>
              <td>{row.type}</td>
              <td>{row.lifeSplitLabel}</td>
              <td>{formatMoney(row.base)}</td>
              <td>{row.percent || "—"}</td>
              <td>
                {formatMoney(row.commission)}
              </td>
              <td>
                {formatMoney(row.reserveFund)}
              </td>
            </tr>
          ))}
          {b36Payments.map((payment, index) => {
            const isOffsetPair = pairedB36PaymentIndexes.has(index);
            return (
              <tr key={`${payment.contractNumber}-b36-${index}`} data-payment="true">
                <td>B36</td>
                <td>
                  {b36HalfLabel} z ostatních plateb
                  {payment.isStorno ? " / storno" : ""}
                  {isOffsetPair ? " / vyplaceno a odečteno ve stejném výpisu" : ""}
                </td>
                <td>—</td>
                <td>—</td>
                <td>
                  {formatMoney(payment.amount)}
                </td>
                <td>—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function OtherProductCommissionTable({
  rows,
  b36Payments,
  pairedB36PaymentIndexes,
  generalCommissionKindClass,
}: {
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
  pairedB36PaymentIndexes: Set<number>;
  generalCommissionKindClass: (kind: GeneralCommissionKind) => string;
}) {
  return (
    <div className={styles.lineItems}>
      <h5 className={styles.lineItemsHeading}><ReceiptText aria-hidden="true" />Položky z provizního výpisu</h5>
      <p className={styles.tableHint}>Další sloupce zobrazíš posunutím do strany →</p>
      <div className={styles.tableScroll} role="region" aria-label="Položky z provizního výpisu" tabIndex={0}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Produkt</th>
            <th scope="col">Kód</th>
            <th scope="col">Význam</th>
            <th scope="col">Základna</th>
            <th scope="col">Procento</th>
            <th scope="col">Provize</th>
            <th scope="col">Rez. fond</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const classification = classifyGeneralCommissionCode(row.product, row.type);
            const rowProductMeta = resolveStatementProduct(row.product);
            return (
              <tr key={`${row.id}-${row.type}-${row.commission}`}>
                <td>
                  <div className={styles.cellTitle}>{rowProductMeta.label}</div>
                  <div className={styles.secondary}>{rowProductMeta.rawCode}</div>
                </td>
                <td>{row.type || "—"}</td>
                <td>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${generalCommissionKindClass(
                      classification.kind
                    )}`}
                  >
                    {classification.label}
                  </span>
                </td>
                <td>
                  <div>{formatMoney(row.base)}</div>
                  {rowProductMeta.usesAnnualPremiumBase && row.base > 0 && (
                    <div className={styles.secondary}>
                      měs. {formatWholeMoney(row.base / 12)} Kč
                    </div>
                  )}
                </td>
                <td>{row.percent || "—"}</td>
                <td>
                  {formatMoney(row.commission)}
                </td>
                <td>
                  {formatMoney(row.reserveFund)}
                </td>
              </tr>
            );
          })}
          {b36Payments.map((payment, index) => {
            const isOffsetPair = pairedB36PaymentIndexes.has(index);
            return (
              <tr key={`${payment.contractNumber}-b36-${index}`} data-payment="true">
                <td>
                  <div className={styles.cellTitle}>Ostatní platby</div>
                  <div className={styles.secondary}>bez produktového kódu</div>
                </td>
                <td>B36</td>
                <td>
                  <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                    50% z B36 z ostatních plateb
                  </span>
                  {isOffsetPair && (
                    <div className="mt-1 text-xs font-medium text-emerald-800">
                      Vyplaceno a odečteno ve stejném výpisu
                    </div>
                  )}
                </td>
                <td>—</td>
                <td>—</td>
                <td>
                  {formatMoney(payment.amount)}
                </td>
                <td>—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
