"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import type { ContractDoc } from "./contractDetailTypes";

export type ContractPdfUploadAttachment = NonNullable<ContractDoc["contractPdfAttachment"]>;
export type ContractPdfUploadResponse = { ok?: boolean; attachment?: ContractPdfUploadAttachment | null };

type Props = {
  ownerEmail: string;
  entryId: string;
  className?: string;
  disabled?: boolean;
  requestUpload: (form: FormData, signal: AbortSignal) => Promise<ContractPdfUploadResponse>;
  onUploaded: (attachment: ContractPdfUploadAttachment) => void;
};

const MAX_PDF_BYTES = 12 * 1024 * 1024;
type Scope = { ownerEmail: string; entryId: string };
type UploadState = { scope: Scope; busy: boolean; error: string | null };

function fileError(file: File): string | null {
  if (!/\.pdf$/i.test(file.name) || !["", "application/pdf", "application/x-pdf"].includes(file.type.toLowerCase())) {
    return "Vyber soubor ve formátu PDF.";
  }
  if (file.size === 0) return "Vybrané PDF je prázdné.";
  if (file.size > MAX_PDF_BYTES) return "PDF může mít nejvýše 12 MB.";
  return null;
}

function uploadError(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : null;
  if (status === 401 || status === 403) return "K této smlouvě nemáš oprávnění nahrát PDF.";
  if (status === 409) return "Ke smlouvě už bylo PDF připojeno nebo se mezitím změnila. Obnov detail.";
  return "PDF se nepodařilo nahrát. Zkus to znovu.";
}

export function ContractPdfUploadButton({ ownerEmail, entryId, className, disabled = false, requestUpload, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ scope: Scope; controller: AbortController } | null>(null);
  const scope = useMemo(() => ({ ownerEmail, entryId }), [ownerEmail, entryId]);
  const [state, setState] = useState<UploadState | null>(null);
  const errorId = useId();
  const current = state?.scope === scope ? state : null;
  const busy = current?.busy === true;
  const unavailable = disabled || busy || !ownerEmail.trim() || !entryId.trim();

  useLayoutEffect(() => () => {
    if (pending.current?.scope === scope) {
      pending.current.controller.abort();
      pending.current = null;
    }
  }, [scope]);

  const upload = async (file: File) => {
    if (disabled || pending.current || !ownerEmail.trim() || !entryId.trim()) return;
    const validation = fileError(file);
    if (validation) {
      setState({ scope, busy: false, error: validation });
      return;
    }
    const controller = new AbortController();
    pending.current = { scope, controller };
    setState({ scope, busy: true, error: null });
    let saved = false;
    try {
      const form = new FormData();
      form.set("ownerEmail", ownerEmail);
      form.set("entryId", entryId);
      form.set("file", file);
      // This entry point attaches a missing original PDF; it never replaces one.
      form.set("onlyIfMissing", "1");
      const response = await requestUpload(form, controller.signal);
      if (controller.signal.aborted) return;
      const attachment = response?.attachment;
      if (response?.ok === false || attachment?.hasFile !== true || attachment.contentType !== "application/pdf") {
        throw new Error("Invalid attachment response.");
      }
      saved = true;
      setState({ scope, busy: false, error: null });
      onUploaded(attachment);
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ scope, busy: false, error: saved
        ? "PDF je uložené. Pro zobrazení přílohy obnov detail smlouvy."
        : uploadError(error) });
    } finally {
      if (pending.current?.controller === controller) pending.current = null;
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" tabIndex={-1}
        aria-label="Vybrat PDF smlouvy" disabled={unavailable}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }} />
      <button type="button" className={className} disabled={unavailable} aria-busy={busy}
        aria-describedby={current?.error ? errorId : undefined}
        onClick={() => { if (!unavailable && !pending.current) inputRef.current?.click(); }}>
        {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={14} strokeWidth={2} aria-hidden="true" />
          : <Upload size={14} strokeWidth={2} aria-hidden="true" />}
        <span>{busy ? "Nahrávám…" : "Nahrát PDF smlouvy"}</span>
      </button>
      {current?.error && <p id={errorId} role="alert" className="max-w-sm text-xs font-medium leading-relaxed text-rose-100">{current.error}</p>}
    </div>
  );
}
