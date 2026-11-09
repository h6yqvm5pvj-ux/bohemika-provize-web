"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, FileText, LoaderCircle, QrCode, Share2, WalletCards, X } from "lucide-react";
import {
  buildContractPaymentQrPayload,
  normalizeContractPaymentDetails,
} from "@/app/lib/contractPaymentDetails";
import type { ContractPdfDetails } from "./contractPaymentDetailsLoader";
import { contractPaymentDetailsErrorMessage } from "./contractPaymentDetailsErrors";
import styles from "./contractPaymentDetails.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  loadPaymentDetails: (signal: AbortSignal) => Promise<ContractPdfDetails>;
  contractNumber: string;
  productName: string;
  advisorName: string;
};

type PaymentState = {
  source: Props["loadPaymentDetails"];
} & (
  | { error: true; message: string }
  | { error: false; details: ContractPdfDetails; qrDataUrl: string | null; qrFailed: boolean }
);

const amountFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency", currency: "CZK", minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const frequencyLabels = { monthly: "Měsíčně", quarterly: "Čtvrtletně", semiannual: "Pololetně", annual: "Ročně" } as const;
const formatDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${Number(day)}. ${Number(month)}. ${year}`;
};

function OpenPaymentDetailsDialog({ onClose, loadPaymentDetails, contractNumber, productName, advisorName }: Omit<Props, "open">) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<PaymentState | null>(null);
  const [retry, setRetry] = useState(0);
  const [shareStatus, setShareStatus] = useState("");
  // Hide the previous document's values immediately when its loader changes.
  const current = state?.source === loadPaymentDetails ? state : null;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrent = () => !controller.signal.aborted;
    void (async () => {
      let details: ContractPdfDetails;
      try {
        const loaded = await loadPaymentDetails(controller.signal);
        const normalized = normalizeContractPaymentDetails(loaded);
        if (!normalized) throw new Error("Invalid payment details");
        details = {
          ...normalized,
          ...(loaded.frequency ? { frequency: loaded.frequency } : {}),
          ...(loaded.insuredItems?.length ? { insuredItems: loaded.insuredItems } : {}),
          ...(loaded.paymentNote ? { paymentNote: loaded.paymentNote } : {}),
        };
      } catch (error) {
        if (isCurrent()) setState({ source: loadPaymentDetails, error: true, message: contractPaymentDetailsErrorMessage(error) });
        return;
      }
      if (!isCurrent()) return;
      setState({ source: loadPaymentDetails, error: false, details, qrDataUrl: null, qrFailed: false });
      try {
        const payload = buildContractPaymentQrPayload(details);
        if (!payload) throw new Error("Invalid QR payment");
        const qr = await import("qrcode");
        if (!isCurrent()) return;
        const qrDataUrl = await qr.default.toDataURL(payload, {
          width: 288,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qrDataUrl)) throw new Error("Invalid QR image");
        if (isCurrent()) setState({ source: loadPaymentDetails, error: false, details, qrDataUrl, qrFailed: false });
      } catch {
        if (isCurrent()) setState({ source: loadPaymentDetails, error: false, details, qrDataUrl: null, qrFailed: true });
      }
    })();
    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [loadPaymentDetails, retry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };
  const retryLoad = () => {
    abortRef.current?.abort();
    closeRef.current?.focus({ preventScroll: true });
    setState(null);
    setRetry(value => value + 1);
  };
  const sharePaymentDetails = async () => {
    if (!current || current.error) return;
    const details = current.details;
    const lines = [
      `Zdravím, zasílám platební údaje ke smlouvě č. ${contractNumber}${productName ? ` (${productName})` : ""}.`,
      "",
      `Částka k úhradě: ${amountFormatter.format(details.amount)}`,
      `Číslo účtu: ${details.accountNumber}`,
      `Variabilní symbol: ${details.variableSymbol}`,
      ...(details.dueDate ? [`Datum splatnosti: ${formatDate(details.dueDate)}`] : []),
      ...(details.frequency ? [`Frekvence platby: ${frequencyLabels[details.frequency]}`] : []),
      ...(details.paymentNote ? [details.paymentNote] : []),
      "",
      "S pozdravem",
      ...(advisorName ? [advisorName] : []),
    ];
    const text = lines.join("\n");
    try {
      if (typeof navigator.share === "function") {
        const qrFile = current.qrDataUrl ? qrDataUrlToFile(current.qrDataUrl, contractNumber) : null;
        const files = qrFile ? [qrFile] : [];
        const supportsQrFile = files.length > 0 && typeof navigator.canShare === "function" && navigator.canShare({ files });
        await navigator.share({ title: "Platební údaje", text, ...(supportsQrFile ? { files } : {}) });
        setShareStatus(supportsQrFile
          ? "Platební údaje včetně QR kódu byly předány ke sdílení."
          : "Platební údaje byly předány ke sdílení. QR obrázek tento prohlížeč neumí přiložit.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareStatus("Platební údaje byly zkopírovány. Můžeš je vložit do zprávy.");
      } else {
        setShareStatus("Sdílení ani kopírování není v tomto prohlížeči dostupné.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("Platební údaje se nepodařilo sdílet.");
    }
  };

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} aria-modal="true"
      className={styles.dialog}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
      <header className={styles.header}>
        <span className={styles.headerIcon}><WalletCards size={23} strokeWidth={1.6} aria-hidden="true" /></span>
        <div className={styles.heading}>
          <h2 id={titleId}>Platební údaje</h2>
          <p id={descriptionId}>Platební údaje a pojištěná rizika uvedená ve smlouvě.</p>
        </div>
        <button ref={closeRef} type="button" aria-label="Zavřít platební údaje" onClick={close}
          className={styles.close}><X size={17} aria-hidden="true" /></button>
      </header>
      <div className={styles.content} aria-busy={!current}>
        {!current ? <p role="status" className={styles.status}><LoaderCircle size={20} className={styles.spinner} aria-hidden="true" />Načítám platební údaje z PDF…</p>
          : current.error ? <div role="alert" className={styles.error}>
            <p>{current.message}</p>
            <button type="button" onClick={retryLoad} className={styles.retry}>Zkusit znovu</button>
          </div>
            : <div className={styles.layout}>
              <div className={styles.detailColumn}>
                <dl className={styles.details}>
                  <div className={styles.amount}><dt>Částka k úhradě</dt><dd>{amountFormatter.format(current.details.amount)}</dd></div>
                  {current.details.frequency && <div className={styles.detail}><dt>Frekvence platby</dt><dd>{frequencyLabels[current.details.frequency]}</dd></div>}
                  <div className={styles.detail}><dt>Číslo účtu</dt><dd>{current.details.accountNumber}</dd></div>
                  <div className={styles.detail}><dt>Variabilní symbol</dt><dd>{current.details.variableSymbol}</dd></div>
                  {current.details.dueDate && <div className={styles.dueDate}><dt><CalendarDays size={14} aria-hidden="true" />Datum splatnosti</dt><dd>{formatDate(current.details.dueDate)}</dd></div>}
                </dl>
                {current.details.insuredItems?.length ? <section className={styles.insuredItems} aria-label="Co je pojištěno">
                  <h3>Co je pojištěno</h3>
                  <ul>{current.details.insuredItems.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </section> : null}
                {current.details.paymentNote && <p className={styles.paymentNote}>{current.details.paymentNote}</p>}
              </div>
              <section className={styles.qrPanel} aria-label="QR platba">
                <h3><QrCode size={14} aria-hidden="true" />QR platba</h3>
                <div className={styles.qrFrame}>
                  {current.qrDataUrl ? <Image src={current.qrDataUrl} alt="QR platba podle smlouvy" width={288} height={288} unoptimized className={styles.qrImage} />
                    : current.qrFailed ? <p role="alert" className={styles.qrError}>QR kód se nepodařilo vytvořit. Použij platební údaje uvedené ve smlouvě.</p>
                      : <p role="status" className={styles.qrStatus}><LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />Připravuji QR kód…</p>}
                </div>
                <p className={styles.qrHint}>Naskenuj v bankovní aplikaci<br />a načti údaje k platbě.</p>
              </section>
            </div>}
      </div>
      <footer className={styles.footer}>
        <span className={styles.footerNote}><FileText size={14} aria-hidden="true" />Platební údaje ze smlouvy</span>
        <span className={styles.footerActions}>
          {current && !current.error && <button type="button" disabled={!current.qrDataUrl && !current.qrFailed} onClick={() => void sharePaymentDetails()} className={styles.share}><Share2 size={15} aria-hidden="true" />Sdílet</button>}
          <button type="button" onClick={close} className={styles.done}>Zavřít</button>
        </span>
        <span className={styles.shareStatus} role="status" aria-live="polite">{shareStatus}</span>
      </footer>
    </dialog>
  );
}

function qrDataUrlToFile(dataUrl: string, contractNumber: string): File | null {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[1]) return null;
  try {
    const binary = atob(match[1]);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new File([bytes], `qr-platba-${contractNumber.replace(/[^\d]/g, "") || "smlouva"}.png`, { type: "image/png" });
  } catch {
    return null;
  }
}

export function ContractPaymentDetailsDialog({ open, ...props }: Props) {
  return open ? <OpenPaymentDetailsDialog {...props} /> : null;
}
