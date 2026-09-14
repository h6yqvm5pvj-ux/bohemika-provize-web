import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
import { loadSharedClientContracts } from "./loadSharedClientContracts";

const user = { uid: "adviser" } as User;
const ready = { ok: true, contracts: [], summaries: [{ shareId: "opaque", productKey: "neon", adviserName: "Jana Bílá" }], matchingAvailable: true, indexing: false };
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("loading other advisers' client contracts", () => {
  it("loads a completed index once and preserves the selected scope without impersonation", async () => {
    mocks.fetch.mockResolvedValue(ready);
    const controller = new AbortController(), update = vi.fn();
    await loadSharedClientContracts(user, "client", "scope=team&advisers=team%40example.test", controller.signal, update);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(user, "/api/client-cards/client/shared-contracts?scope=team&advisers=team%40example.test", {
      signal: controller.signal, headers: { [ADMIN_IMPERSONATION_HEADER]: "" },
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(ready);
  });

  it("publishes partial results while migration progresses and stops polling when ready", async () => {
    const partial = { ...ready, indexing: true, summaries: [] }, update = vi.fn();
    mocks.fetch.mockResolvedValueOnce(partial).mockResolvedValueOnce(ready);
    const pending = loadSharedClientContracts(user, "client", "", new AbortController().signal, update);
    await vi.advanceTimersByTimeAsync(0);
    expect(update.mock.calls).toEqual([[partial]]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(750);
    await pending;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(update.mock.calls).toEqual([[partial], [ready]]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels the next migration request when the card is closed", async () => {
    mocks.fetch.mockResolvedValue({ ...ready, indexing: true });
    const controller = new AbortController(), update = vi.fn();
    const pending = loadSharedClientContracts(user, "client", "", controller.signal, update);
    const rejected = expect(pending).rejects.toThrow("closed");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("closed"));
    await rejected;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not publish a response received after logout, even if the transport ignores abort", async () => {
    const controller = new AbortController(), update = vi.fn();
    mocks.fetch.mockImplementation(async () => { controller.abort(); return ready; });
    await expect(loadSharedClientContracts(user, "client", "", controller.signal, update)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([{ ...ready, ok: false }, { ...ready, summaries: null }, { ...ready, indexing: undefined }])("rejects an invalid response without publishing it: %j", async response => {
    mocks.fetch.mockResolvedValue(response);
    const update = vi.fn();
    await expect(loadSharedClientContracts(user, "client", "", new AbortController().signal, update)).rejects.toThrow("Neplatný");
    expect(update).not.toHaveBeenCalled();
  });

  it("propagates access revocation instead of retaining a successful partial result", async () => {
    mocks.fetch.mockResolvedValueOnce({ ...ready, indexing: true }).mockRejectedValueOnce(new Error("Karta již není dostupná"));
    const update = vi.fn();
    const pending = loadSharedClientContracts(user, "client", "", new AbortController().signal, update);
    const rejected = expect(pending).rejects.toThrow("není dostupná");
    await vi.advanceTimersByTimeAsync(750);
    await rejected;
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
