"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContractReview } from "./contractReview";

/** Keeps the validated form snapshot pending until the user reviews it. */
export function useContractReview() {
  const [review, setReview] = useState<ContractReview | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const requestReview = useCallback((snapshot: ContractReview): Promise<boolean> => {
    if (pending.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      pending.current = resolve;
      setReview(snapshot);
    });
  }, []);

  const resolveReview = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setReview(null);
    resolve?.(confirmed);
  }, []);

  useEffect(() => () => {
    pending.current?.(false);
    pending.current = null;
  }, []);

  return { review, requestReview, resolveReview };
}
