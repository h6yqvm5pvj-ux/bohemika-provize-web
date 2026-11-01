"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KooperativaStatusIdentity } from "@/app/lib/kooperativaContractStatus";

type Scope = { contextKey: string; enabled: boolean };
type StatusState = {
  scope: Scope;
  identity: KooperativaStatusIdentity | null;
  loading: boolean;
  error: string | null;
};

export function useKooperativaContractStatus<Source extends { fileName: string }>({
  contextKey, enabled, contractNumber, sourcePdf, downloadPdf,
}: {
  contextKey: string;
  enabled: boolean;
  contractNumber: string;
  sourcePdf: Source | null;
  downloadPdf: (source: Source, signal?: AbortSignal) => Promise<Blob>;
}) {
  // A new scope instance also prevents reopening stale results when returning
  // to an earlier account or contract with the same textual context key.
  const scope = useMemo(() => ({ contextKey, enabled }), [contextKey, enabled]);
  const [state, setState] = useState<StatusState | null>(null);
  const pending = useRef<{ scope: Scope; controller: AbortController } | null>(null);

  useEffect(() => () => {
    if (pending.current?.scope === scope) {
      pending.current.controller.abort();
      pending.current = null;
    }
    setState(previous => previous?.scope === scope ? null : previous);
  }, [scope]);

  const close = useCallback(() => {
    pending.current?.controller.abort();
    pending.current = null;
    setState(null);
  }, []);

  const open = useCallback(() => {
    if (!enabled) return;
    pending.current?.controller.abort();
    const controller = new AbortController();
    pending.current = { scope, controller };
    if (!sourcePdf) {
      setState({ scope, identity: null, loading: false,
        error: "Ke smlouvě není uložené PDF. Datum narození ani IČO proto nelze automaticky načíst." });
      return;
    }
    setState({ scope, identity: null, loading: true, error: null });
    void (async () => {
      try {
        const [pdfBlob, { parseKooperativaAutoPdf }, { resolveKooperativaStatusIdentity }] = await Promise.all([
          downloadPdf(sourcePdf, controller.signal),
          import("@/app/lib/parseKooperativaAutoPdf"),
          import("@/app/lib/kooperativaContractStatus"),
        ]);
        if (controller.signal.aborted) return;
        const parsed = await parseKooperativaAutoPdf(
          new File([pdfBlob], sourcePdf.fileName, { type: "application/pdf" }),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const normalizeNumber = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();
        if (parsed.contractNumber && normalizeNumber(parsed.contractNumber) !== normalizeNumber(contractNumber)) {
          setState({ scope, identity: null, loading: false,
            error: "Číslo smlouvy v PDF neodpovídá otevřené smlouvě. Ověř uložený dokument." });
          return;
        }
        const identity = resolveKooperativaStatusIdentity(parsed);
        setState({ scope, identity, loading: false,
          error: identity ? null : "V oddílu B Pojistník se nepodařilo jednoznačně načíst datum narození ani IČO. Údaj ověř v PDF a zadej na portálu ručně." });
      } catch {
        if (controller.signal.aborted) return;
        // Parser/network errors can contain document contents or internal URLs.
        setState({ scope, identity: null, loading: false,
          error: "PDF smlouvy se nepodařilo načíst. Potřebný údaj zadej na portálu Kooperativy ručně." });
      } finally {
        if (pending.current?.controller === controller) pending.current = null;
      }
    })();
  }, [contractNumber, downloadPdf, enabled, scope, sourcePdf]);

  // Hide an old result during the render that changes account/contract/access,
  // before effect cleanup gets a chance to abort the previous request.
  const current = enabled && state?.scope === scope ? state : null;
  return { open, close, isOpen: Boolean(current), identity: current?.identity ?? null,
    loading: current?.loading ?? false, error: current?.error ?? null };
}
