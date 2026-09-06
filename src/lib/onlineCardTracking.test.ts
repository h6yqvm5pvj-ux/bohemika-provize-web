import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe("public online card visit tracking", () => {
  it("counts the travel page separately from the main card", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const { trackOnlineCardVisit } = await import("./onlineCardTracking");
    await trackOnlineCardVisit("advisor");
    await trackOnlineCardVisit("advisor", "travel_visit");
    await trackOnlineCardVisit("advisor", "travel_visit");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem("online-card:travel_visit:advisor")).toBe("1");
  });
  it("deduplicates concurrent mounts and remembers a visit only after acknowledgement", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const { trackOnlineCardVisit } = await import("./onlineCardTracking");
    const first = trackOnlineCardVisit("advisor");
    const second = trackOnlineCardVisit("advisor");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
    finish(new Response(null, { status: 204 }));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(window.sessionStorage.getItem("online-card:visit:advisor")).toBe("1");
    await trackOnlineCardVisit("advisor");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([503, 429, 404, 200])("does not remember a failed or unexpected HTTP %s response", async status => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const { trackOnlineCardVisit } = await import("./onlineCardTracking");
    await expect(trackOnlineCardVisit("advisor")).resolves.toBe(false);
    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
    await expect(trackOnlineCardVisit("advisor")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("recovers from a network failure without interrupting the public card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(null, { status: 204 })));
    const { trackOnlineCardVisit } = await import("./onlineCardTracking");
    await expect(trackOnlineCardVisit("advisor")).resolves.toBe(false);
    await expect(trackOnlineCardVisit("advisor")).resolves.toBe(true);
  });

  it("still deduplicates when session storage is blocked", async () => {
    vi.mocked(window.sessionStorage.getItem).mockImplementation(() => { throw new Error("blocked"); });
    vi.mocked(window.sessionStorage.setItem).mockImplementation(() => { throw new Error("blocked"); });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const { trackOnlineCardVisit } = await import("./onlineCardTracking");
    await expect(trackOnlineCardVisit("advisor")).resolves.toBe(true);
    await expect(trackOnlineCardVisit("advisor")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
