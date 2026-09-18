"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImageIcon, Loader2, X } from "lucide-react";
import { useSecureDocumentBlob } from "@/app/lib/secureDocuments";

const EXAMPLES = [
  {
    id: "life-record-health-assessment-example",
    title: "1. Výsledek ocenění zdravotního stavu",
    alt: "Příklad ocenění zdravotního stavu: riziková přirážka 25 % a výluky u jednotlivých připojištění.",
    width: 1200,
    height: 1082,
  },
  {
    id: "life-record-discrepancies-example",
    title: "2. Zápis nesrovnalostí do záznamu z jednání",
    alt: "Příklad vyplněného výčtu nesrovnalostí s uvedením rizikové přirážky a výluk z ocenění zdravotního stavu.",
    width: 2566,
    height: 974,
  },
] as const;

function ExampleImage({ example }: { example: (typeof EXAMPLES)[number] }) {
  const document = useSecureDocumentBlob(example.id);

  return (
    <figure className="overflow-hidden rounded-2xl border border-violet-200 bg-white">
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{example.title}</h3>
        {document.url && (
          <a href={document.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 underline underline-offset-4">
            <ExternalLink size={14} aria-hidden="true" /> Otevřít v plné velikosti
          </a>
        )}
      </figcaption>
      {document.error ? (
        <p role="alert" className="p-6 text-sm text-red-700">Obrázek se nepodařilo načíst. Zavři okno a zkus ho otevřít znovu.</p>
      ) : document.url ? (
        <Image src={document.url} alt={example.alt} width={example.width} height={example.height} unoptimized className="h-auto w-full" />
      ) : (
        <p role="status" className="flex items-center gap-2 p-6 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Načítám obrázek…</p>
      )}
    </figure>
  );
}

function ExamplesDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      id="life-discrepancy-examples"
      aria-labelledby="life-discrepancy-examples-title"
      aria-describedby="life-discrepancy-examples-description"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[1400px] overflow-y-auto rounded-[28px] border border-violet-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/65 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-violet-100 bg-white px-4 py-4 sm:px-6">
        <div>
          <h2 id="life-discrepancy-examples-title" className="text-lg font-semibold text-slate-950">Příklad rizikových přirážek a výluk</h2>
          <p id="life-discrepancy-examples-description" className="mt-1 text-sm text-slate-600">Výsledek ocenění zdravotního stavu a jeho zápis do záznamu z jednání.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Zavřít příklady" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-200 text-violet-900 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500">
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="space-y-5 bg-slate-50 p-4 sm:p-6">
        {EXAMPLES.map(example => <ExampleImage key={example.id} example={example} />)}
      </div>
      <footer className="flex justify-end border-t border-violet-100 px-4 py-4 sm:px-6">
        <button type="button" onClick={onClose} className="rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100">Zavřít</button>
      </footer>
    </dialog>
  );
}

export function LifeDiscrepancyExamples() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "life-discrepancy-examples" : undefined}
        className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-500"
      >
        <ImageIcon size={17} aria-hidden="true" /> Obrázek příkladu
      </button>
      {open && <ExamplesDialog onClose={() => setOpen(false)} />}
    </>
  );
}
