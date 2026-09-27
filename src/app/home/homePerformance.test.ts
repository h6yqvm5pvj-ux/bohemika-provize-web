// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { currentUser: null as null | { getIdToken: ReturnType<typeof vi.fn> } } }));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); sessionStorage.clear();
  vi.stubEnv("NODE_ENV", "production"); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  mocks.auth.currentUser = { getIdToken: vi.fn(async () => "synthetic-token") };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("home readiness telemetry", () => {
  it("batches bounded samples, rounds durations and completes each measurement only once", async () => {
    const { startHomeTiming } = await import("./homePerformance");
    for (let i = 0; i < 25; i++) { const finish = startHomeTiming("production"); finish("success"); finish("cancelled"); }
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/home/performance");
    const body = JSON.parse(init!.body as string);
    expect(body.samples).toHaveLength(20); expect(body.samples[0]).toMatchObject({ stage: "production", outcome: "success" });
    expect(Object.keys(body.samples[0]).sort()).toEqual(["device", "durationMs", "outcome", "stage"]);
    expect(JSON.parse(sessionStorage.getItem("home.performance.v1")!)).toHaveLength(25);
  });
  it("discards measurements interrupted by hiding the tab or changing account", async () => {
    const { startHomeTiming } = await import("./homePerformance");
    const hidden = startHomeTiming("payout");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); hidden("success");
    const previousAccount = startHomeTiming("production"); mocks.auth.currentUser = { getIdToken: vi.fn() }; previousAccount("success");
    await vi.advanceTimersByTimeAsync(2000); expect(fetch).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0);
  });
  it("drops a queued batch after sign-out, without requesting a token", async () => {
    const { startHomeTiming } = await import("./homePerformance"); const user = mocks.auth.currentUser!;
    startHomeTiming("leaderboard")("success"); mocks.auth.currentUser = null;
    await vi.advanceTimersByTimeAsync(2000); expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores storage and network failures without retrying", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { startHomeTiming } = await import("./homePerformance"); startHomeTiming("production")("error");
    await vi.advanceTimersByTimeAsync(10000); expect(fetch).toHaveBeenCalledOnce();
  });
});
