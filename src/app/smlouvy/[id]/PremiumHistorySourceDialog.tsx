import { useEffect, useId, useRef } from "react";
import { ArrowUpRight, FileText, X } from "lucide-react";
import styles from "./autoPremiumHistory.module.css";

type PremiumHistorySource = {
  statementId: string | null;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  productCode: string;
  commissionCodes: string[];
  rowId: string | null;
};

export function PremiumHistorySourceDialog({ source, sourceLabel, contractNumber, onOpenStatement, onClose }: {
  source: PremiumHistorySource;
  sourceLabel: string;
  contractNumber?: string | null;
  onOpenStatement?: (id: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const details = [
    ["Smlouva", contractNumber],
    ["Období výpisu", source.statementPeriod],
    ["Číslo výpisu", source.statementNumber],
    ["Datum výpisu", source.statementDate],
    ["Kód produktu", source.productCode],
    ["Provizní kódy", source.commissionCodes.join(", ")],
    ["Řádek výpisu", source.rowId],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <dialog
      ref={dialogRef}
      className={styles.sourceDialog}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
    >
      <div className={styles.dialogHeading}>
        <span className={styles.documentIcon}><FileText size={23} strokeWidth={1.6} aria-hidden="true" /></span>
        <div>
          <h3 id={titleId}>Zdroj změny pojistného</h3>
          <p>{sourceLabel}</p>
        </div>
        <button type="button" className={styles.closeButton} aria-label="Zavřít zdroj" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <dl className={styles.sourceDetails}>
        {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {!source.statementId && <p className={styles.sourceNote}>Původní výpis není k tomuto záznamu připojen.</p>}
      <div className={styles.dialogFooter}>
        <button type="button" className={styles.sourceButton} onClick={onClose}>Zavřít</button>
        {source.statementId && onOpenStatement && (
          <button type="button" className={styles.openStatement} onClick={() => {
            onClose();
            onOpenStatement(source.statementId!);
          }}>
            Zobrazit výpis <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </dialog>
  );
}
