"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CarFront, CircleCheck, ScanLine, TriangleAlert } from "lucide-react";
import { contractDetailHandoffPath } from "@/app/lib/contractDetailHandoff";
import { productLabel } from "@/app/lib/productCatalog";
import type { VehicleOverlapResult } from "@/app/lib/vehicleOverlap";
import type { VehicleOverlapPreview } from "./useVehicleOverlapPreview";
import styles from "./calculatorForm.module.css";

const displayDate = (value: string) => value.split("-").reverse().join(".");
const matchLabels = { plate: "Shoda SPZ", vin: "Shoda VIN", "plate-and-vin": "Shoda SPZ i VIN" };

function VehicleOverlapProgress({ startedAt, finishedAt }: { startedAt?: number | null; finishedAt?: number }) {
  const [time, setTime] = useState(() => Date.now());
  const hideAt = finishedAt === undefined ? undefined : finishedAt + 400;

  useEffect(() => {
    if (hideAt !== undefined) {
      const timer = window.setTimeout(() => setTime(hideAt), Math.max(0, hideAt - Date.now()));
      return () => window.clearTimeout(timer);
    }
    if (startedAt == null) return;
    const timer = window.setInterval(() => setTime(Date.now()), 125);
    return () => window.clearInterval(timer);
  }, [hideAt, startedAt]);

  if (hideAt !== undefined && time >= hideAt) return null;
  const elapsed = startedAt == null ? 0 : Math.max(0, time - startedAt);
  const value = finishedAt === undefined ? Math.floor(95 * (1 - Math.exp(-elapsed / 2_600))) : 100;
  return (
    <div className="mt-2 flex items-center gap-3">
      <div role="progressbar" aria-label="Průběh kontroly SPZ a VIN" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={value} aria-valuetext={finishedAt === undefined ? `Odhad průběhu ${value} %` : "100 %"}
        className="h-2 flex-1 overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${value}%` }} />
      </div>
      <span aria-hidden="true" className="min-w-12 text-right text-xs font-semibold tabular-nums text-emerald-800">
        {finishedAt === undefined ? "≈ " : ""}{value} %
      </span>
    </div>
  );
}

export function VehicleOverlapPreviewSummary({ preview }: { preview: VehicleOverlapPreview | null }) {
  if (!preview) return null;
  const matches = preview.status === "checked" ? preview.result.matches : [];
  const failed = preview.status === "failed";
  const Icon = failed ? TriangleAlert : preview.status === "pending" ? ScanLine : matches.length ? CarFront : CircleCheck;
  const message = preview.status === "pending" ? "Kontroluji shodu SPZ a VIN s aktivními smlouvami…"
    : failed ? "Kontrola SPZ a VIN se nepodařila. Při uložení ji aplikace zkusí znovu."
      : matches.length > 1 ? "Shody s aktivními smlouvami"
        : matches.length === 1 ? "Shoda s aktivní smlouvou" : "U aktivních smluv nebyla nalezena shoda SPZ ani VIN.";
  return (
    <div className={styles.vehicleCheck} data-failed={failed}>
      <span className={styles.sectionIcon}>
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className={styles.vehicleCheckBody}>
        <div role="status">
          <p className={styles.vehicleCheckTitle}>{message}</p>
          {matches.length > 0 && (
            <ul role="list" className={styles.vehicleCheckMatches}>
              {matches.slice(0, 3).map(match => (
                <li key={`${match.ownerEmail}:${match.entryId}`}>
                  <p className={styles.vehicleCheckPolicy}>
                    <strong>{productLabel(match.productKey)}</strong>
                    {match.contractNumber && <span>{` č. ${match.contractNumber}`}</span>}
                  </p>
                  <span className={styles.vehicleCheckBadge} data-mismatch={match.vinMismatch}>
                    {matchLabels[match.matchedBy]}{match.vinMismatch ? " · VIN se liší" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 3 && <p className={styles.vehicleCheckMore}>Další shody uvidíš po uložení.</p>}
        </div>
        {!failed && <VehicleOverlapProgress
          startedAt={preview.status === "pending" ? preview.startedAt : undefined}
          finishedAt={preview.status === "checked" ? preview.finishedAt : undefined} />}
      </div>
    </div>
  );
}

export function VehicleOverlapCheckError({ onClose }: { onClose: () => void }) {
  return (
    <div role="status" className="mx-auto my-2 flex max-w-4xl flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>Uložení proběhlo. Kontrolu shody SPZ a VIN se nepodařilo dokončit.</p>
      <button type="button" className="px-2 font-semibold underline" onClick={onClose}>Skrýt</button>
    </div>
  );
}

export function VehicleOverlapDialog({ result, uid, impersonatedEmail, onClose }: {
  result: VehicleOverlapResult;
  uid: string;
  impersonatedEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-[min(90dvh,44rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-amber-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
    >
      <header className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4">
        <TriangleAlert className="h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <h2 id={heading} className="text-lg font-bold">Shoda SPZ nebo VIN u aktivních smluv</h2>
      </header>
      <div className="space-y-4 px-5 py-4 text-sm">
        <ul className="space-y-2">
          {result.matches.map(match => (
            <li key={`${match.ownerEmail}:${match.entryId}`} className="rounded-xl border border-slate-200 px-4 py-3">
              <p>V systému evidujeme aktivní smlouvu <strong>{productLabel(match.productKey)}{match.contractNumber ? ` č. ${match.contractNumber}` : ""}</strong>{match.plate ? <> se SPZ <strong>{match.plate}</strong></> : null}.</p>
              <p className="mt-1 font-medium text-slate-700">
                {match.matchedBy === "plate-and-vin" ? "Shoduje se SPZ i VIN." : match.matchedBy === "vin" ? "Shoduje se VIN." : "Shoduje se SPZ."}
              </p>
              {(match.policyStart || match.policyEnd) && <p className="mt-1 text-slate-600">
                Pojištění{match.policyStart ? ` od ${displayDate(match.policyStart)}` : ""}{match.policyEnd ? ` do ${displayDate(match.policyEnd)}` : ""}
              </p>}
              {match.vinMismatch && <p className="mt-1 font-medium text-amber-900">VIN se liší. Ověř, zda jde o stejné vozidlo.</p>}
              <button type="button" className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                onClick={() => {
                  router.push(contractDetailHandoffPath(uid, impersonatedEmail, { ownerEmail: match.ownerEmail, entryId: match.entryId }));
                  onClose();
                }}>
                Otevřít detail smlouvy <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {result.truncated && <p>Existují další odpovídající smlouvy.</p>}
        {result.matches.some(match => !match.vinMismatch) && (
          <p>Pokud nová smlouva nahrazuje původní pojištění, doporučuji původní smlouvu vypovědět. Po potvrzení ukončení ji v systému označ jako stornovanou.</p>
        )}
      </div>
      <footer className="flex justify-end border-t border-slate-100 px-5 py-3">
        <button type="button" autoFocus onClick={onClose} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
          Rozumím
        </button>
      </footer>
    </dialog>
  );
}
