import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), collection: vi.fn(), select: vi.fn(), get: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: mocks.collection } }));
import { GET } from "./route";
const owner = "owner@example.test";
const subordinate = "subordinate@example.test";
const reads: string[] = [];
const request = (email = owner) => new NextRequest(`http://localhost/api/contracts/client-names?ownerEmail=${email}`);
beforeEach(() => {
  vi.resetAllMocks(); reads.length = 0;
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, teamEmails: [subordinate] }, withRateLimit: (response: Response) => response });
  mocks.collection.mockImplementation((name: string) => ({ doc: (email: string) => ({ collection: (collection: string) => {
    reads.push(`${name}/${email}/${collection}`); return { select: mocks.select };
  } }) }));
  mocks.select.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: ["Jan Buček", "Jan Bůček", " JAN   BUČEK ", "", null].map(clientName => ({ data: () => ({ clientName }) })) });
});
describe("complete client name directory", () => {
  it("reads only names and keeps accent variants while deduplicating spelling and spacing", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, names: ["Jan Buček", "Jan Bůček"] });
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("clientName");
    expect(reads).toEqual([`users/${owner}/entries`]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("returns all names including old records without dates in a single read", async () => {
    const names = Array.from({ length: 2501 }, (_, i) => `Klient ${i}`);
    mocks.get.mockResolvedValue({ docs: names.map(clientName => ({ data: () => ({ clientName }) })) });
    expect((await (await GET(request())).json()).names).toEqual(names);
    expect(mocks.get).toHaveBeenCalledOnce();
  });
  it("allows only the selected authorized subordinate", async () => {
    expect((await GET(request(subordinate))).status).toBe(200);
    expect(reads).toEqual([`users/${subordinate}/entries`]);
  });
  it("uses the represented account, not the administrator's identity", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: subordinate, actorEmail: owner, teamEmails: [] }, withRateLimit: (r: Response) => r });
    expect((await GET(request(subordinate))).status).toBe(200);
    expect(reads).toEqual([`users/${subordinate}/entries`]);
  });
  it("rejects unrelated owners before database access", async () => {
    expect((await GET(request("unrelated@example.test"))).status).toBe(403);
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it("honors authentication and subscription failures", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(request())).status).toBe(401); expect(mocks.collection).not.toHaveBeenCalled();
  });
  it("does not return an empty successful result on read errors", async () => {
    mocks.get.mockRejectedValue(new Error("private details"));
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private details");
  });
});
