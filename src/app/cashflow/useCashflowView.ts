"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createCashflowWorkerClient } from "./cashflowWorker.client";
import type { CashflowViewOptions } from "./buildCashflowView";
import type { CashflowDataset, CashflowOverview } from "./cashflowWorker.types";
import type { MonthGroup } from "./types";

type Client = ReturnType<typeof createCashflowWorkerClient>;
type Session = { client: Client; request: object | null };
type Selection = { dataset: CashflowDataset | null; identity: string | null; options: CashflowViewOptions };
type ViewState = { session: Session; request: object; overview: CashflowOverview | null; error: string | null };
type State = { selection: Selection; result: ViewState | null };

/** Each identity/data version owns its own worker and optional local fallback. */
export function useCashflowView({ dataset, options, identity, enabled }: {
  dataset: CashflowDataset | null;
  options: CashflowViewOptions;
  identity: string | null;
  enabled: boolean;
}) {
  // Disabled/logged-out state must not retain a previous dataset in React state.
  const activeDataset = enabled && identity ? dataset : null;
  const activeIdentity = enabled && dataset ? identity : null;
  const sessionRef = useRef<Session | null>(null);
  const committedSelection = useRef<Selection | null>(null);
  const [state, setState] = useState<State>(() => ({
    selection: { dataset: activeDataset, identity: activeIdentity, options }, result: null,
  }));
  const matches = state.selection.dataset === activeDataset && state.selection.identity === activeIdentity && state.selection.options === options;
  // React retries this render before committing children. Clearing derived state
  // here hides old data immediately, without scheduling an extra effect render.
  if (!matches) {
    setState({ selection: { dataset: activeDataset, identity: activeIdentity, options }, result: null });
  }
  const selection = state.selection;

  useLayoutEffect(() => {
    if (!activeDataset || !activeIdentity) return;
    const session: Session = {
      client: createCashflowWorkerClient({ dataset: activeDataset }), request: null,
    };
    sessionRef.current = session;
    return () => {
      session.request = null;
      if (sessionRef.current === session) sessionRef.current = null;
      session.client.dispose();
    };
  }, [activeDataset, activeIdentity]);

  // Invalidate async reads at commit, including the interval before passive
  // effects run. Worker startup and the calculation remain in the passive effect.
  useLayoutEffect(() => {
    committedSelection.current = selection;
    return () => {
      if (committedSelection.current === selection) committedSelection.current = null;
    };
  }, [selection]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!selection.dataset || !selection.identity || !session) return;
    let active = true;
    const request = {};
    session.request = request;
    const isCurrent = () => active && sessionRef.current === session &&
      session.request === request && committedSelection.current === selection;
    const publish = (result: ViewState) => {
      if (isCurrent()) setState(previous => previous.selection === selection ? { ...previous, result } : previous);
    };
    void session.client.view(selection.options).then(overview => {
      publish({ session, request, overview, error: null });
    }).catch(error => {
      if (error?.name === "AbortError") return;
      publish({ session, request, overview: null, error: "Přehled se nepodařilo spočítat. Obnovte prosím stránku." });
    });
    return () => {
      active = false;
      if (session.request === request) session.request = null;
    };
  }, [selection]);

  // This guard also hides the previous account/filter during the render before
  // effect cleanup. Completed asynchronous work never determines the active scope.
  const current = matches && activeDataset && activeIdentity ? state.result : null;
  const pending = Boolean(activeDataset && activeIdentity && !current);
  const overview = current?.overview ?? null;

  const loadMonth = useCallback(async (key: string): Promise<MonthGroup | null> => {
    const isCurrent = () => current && current.overview && committedSelection.current === selection &&
      sessionRef.current === current.session && current.session.request === current.request;
    if (!isCurrent() || !current) {
      throw new DOMException("Cashflow selection changed", "AbortError");
    }
    try {
      const month = await current.session.client.month(key);
      if (!isCurrent()) throw new DOMException("Cashflow selection changed", "AbortError");
      return month;
    } catch (error) {
      if (!isCurrent()) throw new DOMException("Cashflow selection changed", "AbortError");
      throw error;
    }
  }, [current, selection]);

  return { overview, pending, error: current?.error ?? null, loadMonth };
}
