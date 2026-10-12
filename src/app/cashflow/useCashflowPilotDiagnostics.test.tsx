// @vitest-environment happy-dom

import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASHFLOW_PAGE_MEASUREMENT_KEY, CASHFLOW_PILOT_MODE_KEY, useCashflowPageMeasurement,
  useCashflowPilotMode, type CashflowPilotMode, type CashflowPageMeasurement } from "./useCashflowPilotDiagnostics";

type Input = Parameters<typeof useCashflowPageMeasurement>[0];
const waiting = (): Input => ({ mode: "baseline", identity: null, profileReady: false,
  contractsReady: false, statementsReady: false, overviewReady: false, failed: false });
const ready = (identity = "synthetic-account-A"): Input => ({ mode: "compare", identity,
  profileReady: true, contractsReady: true, statementsReady: true, overviewReady: true, failed: false });
let root: Root;
let now: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let input: Input;
let record: ReturnType<typeof vi.fn<(value: CashflowPageMeasurement) => void>>;
function Harness(props: Input) { useCashflowPageMeasurement(props, record); return null; }
const render = async (props = input, strict = false) => {
  input = props;
  await act(async () => root.render(strict ? <StrictMode><Harness {...props} /></StrictMode> : <Harness {...props} />));
};
const frame = async () => {
  const pending = [...frames.values()]; frames.clear(); now += 16;
  await act(async () => pending.forEach(callback => callback(now)));
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED", "1");
  now = 0; nextFrame = 0; frames = new Map(); input = waiting(); record = vi.fn();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  sessionStorage.clear();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("cashflow pilot activation in one browser tab", () => {
  let mode: CashflowPilotMode;
  function Mode() { const value = useCashflowPilotMode(); useLayoutEffect(() => { mode = value; }); return null; }
  const renderMode = () => act(async () => root.render(<Mode />));
  it.each([null, "1", "enabled", "private@example.test"])("keeps the original path without an explicit valid mode: %s", async value => {
    if (value) sessionStorage.setItem(CASHFLOW_PILOT_MODE_KEY, value);
    await renderMode(); expect(mode).toBeNull();
  });
  it.each(["baseline", "compare"])("accepts the explicit %s mode only with the public build flag", async value => {
    sessionStorage.setItem(CASHFLOW_PILOT_MODE_KEY, value);
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED", "0");
    await renderMode(); expect(mode).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED", "1");
    await renderMode(); expect(mode).toBe(value);
  });
  it("switches mode and returns to the original path on explicit local disable", async () => {
    await renderMode(); expect(mode).toBeNull();
    sessionStorage.setItem(CASHFLOW_PILOT_MODE_KEY, "compare");
    await act(async () => window.dispatchEvent(new Event("cashflow:pilot-mode")));
    expect(mode).toBe("compare");
    sessionStorage.removeItem(CASHFLOW_PILOT_MODE_KEY);
    await act(async () => window.dispatchEvent(new Event("cashflow:pilot-mode")));
    expect(mode).toBeNull();
  });
  it("keeps the original path if browser storage is unavailable", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("Storage blocked"); } });
    await renderMode(); expect(mode).toBeNull();
  });
});

describe("whole cashflow initial-load milestones", () => {
  it("includes auth/profile waiting, inputs, statements and the completed view, then two frames", async () => {
    await render();
    now = 40; await render({ ...input, identity: "synthetic-account-A" });
    now = 90; await render({ ...input, profileReady: true });
    now = 120; await render({ ...input, contractsReady: true });
    now = 180; await render({ ...input, statementsReady: true });
    expect(frames.size).toBe(0); expect(record).not.toHaveBeenCalled();
    now = 200; await render({ ...input, overviewReady: true });
    await frame(); expect(record).not.toHaveBeenCalled();
    await frame();
    expect(record).toHaveBeenCalledExactlyOnceWith({ mode: "baseline", status: "ready", profileReadyMs: 90,
      contractsReadyMs: 120, statementsReadyMs: 180, overviewReadyMs: 200, frameReadyMs: 232 });
    now = 300; await render({ ...input, overviewReady: false });
    await render({ ...input, overviewReady: true }); await frame(); await frame();
    expect(record).toHaveBeenCalledTimes(1);
  });
  it("cancels old frames at account change and measures the new account independently", async () => {
    await render(ready()); await frame();
    now = 100; await render({ ...waiting(), mode: "compare", identity: "synthetic-account-B" });
    await frame(); expect(record).not.toHaveBeenCalled();
    now = 200; await render(ready("synthetic-account-B")); await frame(); await frame();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ mode: "compare", frameReadyMs: 132 });
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/synthetic|account|identity/);
  });
  it("cancels a ready sample while a changed selection is pending", async () => {
    await render(ready()); await frame();
    await render({ ...input, overviewReady: false }); await frame();
    expect(record).not.toHaveBeenCalled();
    await render({ ...input, overviewReady: true }); await frame(); await frame();
    expect(record).toHaveBeenCalledTimes(1);
  });
  it("starts a fresh sample when switching between baseline and comparison", async () => {
    await render({ ...ready(), mode: "baseline" }); await frame(); await frame();
    now = 100; await render(ready()); await frame(); await frame();
    expect(record.mock.calls.map(([value]) => [value.mode, value.frameReadyMs])).toEqual([["baseline", 32], ["compare", 32]]);
  });
  it("records a failure without inventing missing readiness times", async () => {
    await render({ ...waiting(), identity: "synthetic", failed: true }); await frame(); await frame();
    expect(record).toHaveBeenCalledExactlyOnceWith({ mode: "baseline", status: "error", frameReadyMs: 32 });
  });
  it("discards samples if the tab was hidden before completion", async () => {
    await render(ready()); await frame();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await frame(); expect(record).not.toHaveBeenCalled();
  });
  it("never records disabled or logged-out sessions", async () => {
    await render({ ...ready(), mode: null }); await frame(); await frame();
    await render({ ...ready(), identity: null }); await frame(); await frame();
    expect(record).not.toHaveBeenCalled();
  });
  it("cleans up pending work on unmount and reports once under StrictMode", async () => {
    await render(ready(), true); await frame(); await frame(); expect(record).toHaveBeenCalledTimes(1);
    await act(async () => root.render(null)); expect(frames.size).toBe(0);
  });
  it("isolates a failing recorder from the UI", async () => {
    record.mockImplementation(() => { throw new Error("Storage blocked"); });
    await render(ready()); await frame(); await frame(); expect(record).toHaveBeenCalledTimes(1);
  });
  it("writes only whitelisted milestones and mode to session storage", async () => {
    function Stored() { useCashflowPageMeasurement(ready()); return null; }
    await act(async () => root.render(<Stored />)); await frame(); await frame();
    const stored = JSON.parse(sessionStorage.getItem(CASHFLOW_PAGE_MEASUREMENT_KEY)!);
    expect(Object.keys(stored).sort()).toEqual(["contractsReadyMs", "frameReadyMs", "mode", "overviewReadyMs", "profileReadyMs", "statementsReadyMs", "status"]);
    expect(JSON.stringify(stored)).not.toMatch(/synthetic|account|identity|email|token|amount|contractNumber/);
  });
});
