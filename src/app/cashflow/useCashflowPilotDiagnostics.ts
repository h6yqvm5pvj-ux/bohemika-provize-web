"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type CashflowPilotMode = "baseline" | "compare" | null;
export const CASHFLOW_PILOT_MODE_KEY = "cashflow_server_pilot_mode";
export const CASHFLOW_PAGE_MEASUREMENT_KEY = "cashflow_page_last_result";

function readMode(): CashflowPilotMode {
  if (process.env.NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED !== "1") return null;
  try {
    const value = sessionStorage.getItem(CASHFLOW_PILOT_MODE_KEY);
    return value === "baseline" || value === "compare" ? value : null;
  } catch { return null; }
}
const serverMode = (): CashflowPilotMode => null;
function subscribeMode(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("cashflow:pilot-mode", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("cashflow:pilot-mode", listener);
  };
}

/** A public build flag alone must not switch every user's calculation path. */
export function useCashflowPilotMode(): CashflowPilotMode {
  return useSyncExternalStore(subscribeMode, readMode, serverMode);
}

type Milestone = "profileReadyMs" | "contractsReadyMs" | "statementsReadyMs" | "overviewReadyMs";
export type CashflowPageMeasurement = {
  mode: Exclude<CashflowPilotMode, null>;
  status: "ready" | "error";
  frameReadyMs: number;
} & Partial<Record<Milestone, number>>;

type MeasurementInput = {
  mode: CashflowPilotMode;
  identity: string | null;
  profileReady: boolean;
  contractsReady: boolean;
  statementsReady: boolean;
  overviewReady: boolean;
  failed: boolean;
};
type Run = {
  identity: string | null;
  mode: CashflowPilotMode;
  start: number;
  milestones: Partial<Record<Milestone, number>>;
  done: boolean;
  hidden: boolean;
};

function recordPageMeasurement(value: CashflowPageMeasurement) {
  try { sessionStorage.setItem(CASHFLOW_PAGE_MEASUREMENT_KEY, JSON.stringify(value)); }
  catch { /* Optional local diagnostics cannot affect the page. */ }
}

/**
 * One initial-load sample per account/mode. Times share a monotonic origin at
 * this component's mount; they are completion milestones, not additive phases.
 * Two animation frames allow the committed overview to be painted. This is not
 * a navigation, LCP or INP measurement. Hidden-tab samples are discarded.
 */
export function useCashflowPageMeasurement(input: MeasurementInput, record = recordPageMeasurement) {
  const run = useRef<Run | null>(null);
  useLayoutEffect(() => {
    const now = performance.now();
    const previous = run.current;
    // Resolve the initial unknown identity without losing auth/profile waiting.
    const changedAccount = previous?.identity !== null && previous?.identity !== input.identity;
    if (!previous || changedAccount || previous.mode !== input.mode) {
      run.current = { identity: input.identity, mode: input.mode, start: now, milestones: {}, done: false,
        hidden: document.visibilityState === "hidden" };
    }
    const active = run.current!;
    active.identity = input.identity;
    const hide = () => { if (document.visibilityState === "hidden") active.hidden = true; };
    document.addEventListener("visibilitychange", hide);
    const elapsed = () => Math.max(0, performance.now() - active.start);
    if (input.identity && input.mode && !active.done && !active.hidden) {
      const ready: Record<Milestone, boolean> = {
        profileReadyMs: input.profileReady, contractsReadyMs: input.contractsReady,
        statementsReadyMs: input.statementsReady, overviewReadyMs: input.overviewReady,
      };
      for (const key of Object.keys(ready) as Milestone[]) {
        if (!ready[key]) delete active.milestones[key];
        if (ready[key] && active.milestones[key] === undefined) active.milestones[key] = elapsed();
      }
    }
    let firstFrame = 0;
    let secondFrame = 0;
    const settled = input.failed || (input.profileReady && input.contractsReady && input.statementsReady && input.overviewReady);
    if (input.identity && input.mode && settled && !active.done && !active.hidden) {
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (run.current !== active || active.hidden || active.done) return;
          active.done = true;
          try { record({ mode: input.mode!, status: input.failed ? "error" : "ready",
            ...active.milestones, frameReadyMs: elapsed() }); }
          catch { /* A diagnostic callback must not replace the displayed data. */ }
        });
      });
    }
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [input.identity, input.mode, input.profileReady, input.contractsReady, input.statementsReady,
    input.overviewReady, input.failed, record]);
}
