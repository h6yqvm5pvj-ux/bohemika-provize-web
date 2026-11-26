"use client";

import { useEffect, useId, useRef } from "react";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, CircleAlert, Copy, LoaderCircle, X } from "lucide-react";
import styles from "./kooperativaContractStatus.module.css";

type Identity = { label: "Datum narození" | "IČO"; value: string } | null;

type Props = {
  brand: string;
  title: string;
  description: string;
  openLabel: string;
  logoSrc: string;
  url: string;
  contractNumber: string;
  identity: Identity;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenStorno?: () => void;
  onCopy: (value: string, label: string) => void | Promise<void>;
};

export function ContractPortalActions({ url, openLabel, onOpenStorno }: Pick<Props, "url" | "openLabel" | "onOpenStorno">) {
  return (
    <div className={styles.footerActions}>
      {onOpenStorno && (
        <button type="button" className={styles.storno} aria-haspopup="dialog" onClick={onOpenStorno}>
          <CalendarDays size={17} aria-hidden="true" /> Storno smlouvy
        </button>
      )}
      <a className={styles.openPortal} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {openLabel} <ArrowUpRight size={19} strokeWidth={1.9} aria-hidden="true" />
      </a>
    </div>
  );
}

export function ContractPortalIdentityDialog({ brand, title, description, openLabel, logoSrc, url, contractNumber, identity, loading, error, onClose, onCopy, onOpenStorno }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const number = contractNumber.trim();
  const readyIdentity = !loading && !error ? identity : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const copyButton = (value: string, label: string) => (
    <button type="button" className={styles.copy} aria-label={`Kopírovat ${label.toLocaleLowerCase("cs-CZ")}`}
      onClick={() => { void onCopy(value, label); }}>
      <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>Kopírovat</span>
    </button>
  );

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]
          .filter(control => control.tabIndex >= 0 && !control.closest("[hidden]"));
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}><Image src={logoSrc} alt="" width={34} height={34} /></span>
          <span>{brand}</span>
        </div>
        <button ref={closeRef} type="button" className={styles.close} aria-label={`Zavřít: ${title}`} onClick={onClose}>
          <X size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
      </header>

      <div className={styles.body}>
        <dl className={styles.fields}>
          <div className={styles.field}>
            <div className={styles.fieldText}><dt>Číslo smlouvy</dt><dd>{number || "Není uvedeno"}</dd></div>
            {number && copyButton(number, "Číslo smlouvy")}
          </div>
          <div className={styles.field} aria-busy={loading}>
            <div className={styles.fieldText}>
              <dt>{readyIdentity?.label ?? "Datum narození / IČO"}</dt>
              <dd aria-live="polite">
                {loading ? <span className={styles.loading}><LoaderCircle size={16} aria-hidden="true" />Načítám z PDF…</span>
                  : readyIdentity?.value ?? "Nepodařilo se načíst"}
              </dd>
            </div>
            {readyIdentity && copyButton(readyIdentity.value, readyIdentity.label)}
          </div>
        </dl>
        {error && <p className={styles.error} role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></p>}
        {!loading && !readyIdentity && <p className={styles.note}>Chybějící údaj můžeš zadat přímo na portálu.</p>}
      </div>

      <footer className={styles.footer}>
        <p>Ověření proběhne na portálu {brand}.</p>
        <ContractPortalActions url={url} openLabel={openLabel} onOpenStorno={onOpenStorno} />
      </footer>
    </dialog>
  );
}
