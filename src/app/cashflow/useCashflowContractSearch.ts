"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeContractNumberSearch } from "./helpers";

type SearchState = { identity: string | null; input: string; query: string };
const emptySearch = (identity: string | null): SearchState => ({ identity, input: "", query: "" });

export function useCashflowContractSearch(identity: string | null) {
  const [state, setState] = useState<SearchState>(() => emptySearch(identity));
  const matches = state.identity === identity;
  // Hide the previous account's input before children commit, including during
  // logout or an impersonation change while a timer is pending.
  if (!matches) setState(emptySearch(identity));

  useEffect(() => {
    if (!identity || state.identity !== identity) return;
    const query = normalizeContractNumberSearch(state.input);
    if (query === state.query) return;

    const timer = window.setTimeout(() => {
      // A new input or identity invalidates this update even before cleanup.
      setState(previous => previous === state ? { ...previous, query } : previous);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [identity, state]);

  const setInput = useCallback((input: string) => {
    if (!identity) return;
    setState(previous => {
      const current = previous.identity === identity ? previous : emptySearch(identity);
      if (input === current.input) return current;
      // Clearing the field restores the unfiltered overview immediately.
      return { ...current, input, query: normalizeContractNumberSearch(input) ? current.query : "" };
    });
  }, [identity]);

  return {
    input: matches ? state.input : "",
    query: matches ? state.query : "",
    pending: matches && normalizeContractNumberSearch(state.input) !== state.query,
    setInput,
  };
}
