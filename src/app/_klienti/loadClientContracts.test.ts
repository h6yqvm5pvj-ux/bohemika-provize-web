import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
import { loadClientContracts } from "./loadClientContracts";
const user = { uid: "uid" } as User;
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
describe("direct indexed client contract loading", () => {
  it("loads the directory in one request, defaulting to own clients", async () => {
    const contract = { id: "one", adviserEmail: "own@example.test" };
    mocks.fetch.mockResolvedValue({ ok: true, contracts: [contract, contract] });
    expect(await loadClientContracts(user, signal())).toEqual([contract]);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][1]).toBe("/api/client-cards/contracts?scope=my");
    expect(mocks.fetch.mock.calls[0][2].headers[ADMIN_IMPERSONATION_HEADER]).toBe("");
  });
  it("requests only a card's assigned contracts and preserves adviser filters", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, contracts: [] });
    await loadClientContracts(user, signal(), undefined, undefined, { slug: "martin-brezina", selection: { scope: "team", advisers: ["one@example.test", "two@example.test"] } });
    const params = new URL(mocks.fetch.mock.calls[0][1], "http://test").searchParams;
    expect(params.get("scope")).toBe("team"); expect(params.get("clientSlug")).toBe("martin-brezina"); expect(params.get("advisers")).toBe("one@example.test,two@example.test");
  });
  it("finishes a resumable first migration before publishing contracts", async () => {
    const progress = vi.fn(), advisers = vi.fn();
    mocks.fetch.mockResolvedValueOnce({ ok: true, indexing: true, indexedContracts: 150, teamAdvisers: [] })
      .mockResolvedValueOnce({ ok: true, indexing: true, indexedContracts: 300 })
      .mockResolvedValueOnce({ ok: true, contracts: [] });
    expect(await loadClientContracts(user, signal(), progress, advisers)).toEqual([]);
    expect(progress.mock.calls).toEqual([[150], [300]]); expect(advisers).toHaveBeenCalledWith([]);
  });
  it("detects a stalled migration instead of polling indefinitely", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, indexing: true, indexedContracts: 150 });
    await expect(loadClientContracts(user, signal())).rejects.toThrow("dokončit"); expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });
  it.each([{ ok: false }, { ok: true }, { ok: true, indexing: true, indexedContracts: -1 }])("rejects invalid responses: %j", async payload => {
    mocks.fetch.mockResolvedValue(payload); await expect(loadClientContracts(user, signal())).rejects.toThrow();
  });
  it("cancels without publishing data after logout or navigation", async () => {
    const controller = new AbortController(), progress = vi.fn(), advisers = vi.fn();
    mocks.fetch.mockImplementation(async () => { controller.abort(); return { ok: true, indexing: true, indexedContracts: 150, teamAdvisers: [] }; });
    await expect(loadClientContracts(user, controller.signal, progress, advisers)).rejects.toThrow();
    expect(progress).not.toHaveBeenCalled(); expect(advisers).not.toHaveBeenCalled();
  });
});
