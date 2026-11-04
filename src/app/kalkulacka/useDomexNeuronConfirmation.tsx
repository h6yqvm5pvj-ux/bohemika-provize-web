"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type PendingConfirmation = {
  id: number;
  resolve: (answer: boolean | null) => void;
  cleanup: () => void;
};

function DomexNeuronConfirmationDialog({ onAnswer }: { onAnswer: (answer: boolean | null) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-violet-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
      onCancel={event => { event.preventDefault(); onAnswer(null); }}
      onClose={() => { if (!dialogRef.current?.open) onAnswer(null); }}
    >
      <h2 id={titleId} className="text-lg font-semibold">Jedná se o DOMEX Neuron?</h2>
      <p id={descriptionId} className="mt-2 text-sm text-slate-600">
        PDF obsahuje produkt DOMEX. Jeho variantu se nepodařilo spolehlivě rozpoznat.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={() => onAnswer(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-700">Zrušit import</button>
        <button type="button" onClick={() => onAnswer(false)} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-700">NE</button>
        <button type="button" onClick={() => onAnswer(true)} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-violet-700">ANO</button>
      </div>
    </dialog>
  );
}

export function useDomexNeuronConfirmation() {
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const sequenceRef = useRef(0);
  const mountedRef = useRef(false);
  const [requestId, setRequestId] = useState<number | null>(null);

  const answer = useCallback((result: boolean | null, id?: number) => {
    const pending = pendingRef.current;
    if (!pending || (id != null && pending.id !== id)) return;
    pendingRef.current = null;
    pending.cleanup();
    pending.resolve(result);
    if (mountedRef.current) setRequestId(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      answer(null);
    };
  }, [answer]);

  const confirmDomexNeuron = useCallback((signal: AbortSignal): Promise<boolean | null> => {
    if (!mountedRef.current || signal.aborted) return Promise.resolve(null);
    answer(null);
    const id = ++sequenceRef.current;
    return new Promise(resolve => {
      const onAbort = () => answer(null, id);
      pendingRef.current = {
        id,
        resolve,
        cleanup: () => signal.removeEventListener("abort", onAbort),
      };
      signal.addEventListener("abort", onAbort, { once: true });
      setRequestId(id);
    });
  }, [answer]);

  return {
    confirmDomexNeuron,
    domexNeuronConfirmation: requestId == null ? null : (
      <DomexNeuronConfirmationDialog key={requestId} onAnswer={result => answer(result, requestId)} />
    ),
  };
}
