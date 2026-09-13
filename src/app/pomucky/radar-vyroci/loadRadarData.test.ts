import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRadarData } from "./loadRadarData";

const user = { getIdToken: vi.fn(async () => "test-token") } as unknown as User;
const contract = (id: string) => ({ id, adviserEmail: "advisor@example.test" });
const page = (id: string, nextCursor: string | null = null) => Response.json({
  ok: true, position: "manazer4", contracts: [contract(id)], hasMore: Boolean(nextCursor), nextCursor,
});
const reviews = () => Response.json({ ok: true, reviews: [{ ownerEmail: "advisor@example.test", entryId: "first", note: "Kontaktovat" }] });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("parallel anniversary radar loading", () => {
  it("starts both requests immediately and publishes only after all portfolio pages finish", async () => {
    const firstPage = Promise.withResolvers<Response>();
    const lastPage = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/contracts/anniversary-review") return Promise.resolve(reviews());
      return url.includes("cursor=") ? lastPage.promise : firstPage.promise;
    });
    const settled = vi.fn();
    const pending = loadRadarData(user, new AbortController().signal).then(data => { settled(data); return data; });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/contracts/anniversary-portfolio", "/api/contracts/anniversary-review",
    ]);
    expect(settled).not.toHaveBeenCalled();
    firstPage.resolve(page("first", "page2"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(settled).not.toHaveBeenCalled();
    lastPage.resolve(page("last"));
    expect(await pending).toMatchObject({
      position: "manazer4", contracts: [contract("first"), contract("last")],
      reviews: [{ entryId: "first", note: "Kontaktovat" }],
    });
  });

  it("waits for reviews when the portfolio finishes first", async () => {
    const reviewRequest = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(input => String(input).endsWith("anniversary-review")
      ? reviewRequest.promise : Promise.resolve(page("first")));
    const settled = vi.fn();
    const pending = loadRadarData(user, new AbortController().signal).then(data => { settled(data); return data; });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(settled).not.toHaveBeenCalled();
    reviewRequest.resolve(reviews());
    expect((await pending).reviews).toHaveLength(1);
  });

  it("cancels the other branch on a later portfolio error and leaves the page able to retry", async () => {
    const reviewRequest = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(input => {
      if (String(input).endsWith("anniversary-review")) return reviewRequest.promise;
      return Promise.resolve(String(input).includes("cursor=")
        ? Response.json({ error: "Portfolio unavailable" }, { status: 503 })
        : page("first", "page2"));
    });
    const controller = new AbortController();
    await expect(loadRadarData(user, controller.signal)).rejects.toThrow("Portfolio unavailable");
    expect(controller.signal.aborted).toBe(false);
    for (const [, init] of fetchMock.mock.calls) expect(init!.signal!.aborted).toBe(true);
    reviewRequest.resolve(reviews());
    fetchMock.mockImplementation(input => Promise.resolve(String(input).endsWith("anniversary-review") ? reviews() : page("recovered")));
    expect((await loadRadarData(user, controller.signal)).contracts).toEqual([contract("recovered")]);
  });

  it.each([null, { ok: false }, { ok: true, reviews: null }])("rejects invalid review data and stops portfolio pagination: %j", async body => {
    const firstPage = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(input => String(input).endsWith("anniversary-review")
      ? Promise.resolve(Response.json(body)) : firstPage.promise);
    await expect(loadRadarData(user, new AbortController().signal)).rejects.toThrow("stav výročí");
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
    firstPage.resolve(page("late", "page2"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts both reads when the page or account changes", async () => {
    fetchMock.mockImplementation((_input, init) => new Promise((_, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const controller = new AbortController();
    const pending = loadRadarData(user, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.abort();
    await rejected;
    for (const [, init] of fetchMock.mock.calls) expect(init!.signal!.aborted).toBe(true);
  });

  it("does not start a load that was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadRadarData(user, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
