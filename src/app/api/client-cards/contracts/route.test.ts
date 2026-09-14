import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), ensure: vi.fn(), read: vi.fn() }));
vi.mock("@/app/api/contracts/_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("@/lib/server/clientContractIndex", () => ({ ensureClientContractIndex: mocks.ensure, readClientContractLinks: mocks.read }));
import { GET } from "./route";
const owner = "jakub.rauscher@bohemika.eu";
const team = "team@example.test";
const ctx = { email: owner, isImpersonating: false, contractAccessEmails: [team, "outsider@example.test"], teamEmails: [team, "tip@example.test"], users: [{ email: owner, name: "Jakub", accountType: "advisor" }, { email: team, name: "Poradce", accountType: "advisor" }, { email: "tip@example.test", accountType: "tipster" }] };
const request = (query = "") => new NextRequest(`http://localhost/api/client-cards/contracts?${query}`);
beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ ok: true, ctx, withRateLimit: (r: NextResponse) => r }); mocks.ensure.mockResolvedValue({ ready: true, processed: 25 }); mocks.read.mockResolvedValue([]); });
describe("indexed client contracts access", () => {
  it("defaults to personally concluded contracts and uses only the real subordinate hierarchy", async () => {
    const response = await GET(request("ownerEmail=outsider@example.test"));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.ensure.mock.calls.map(call => call[1])).toEqual([owner, team]);
    expect(mocks.read.mock.calls.map(call => call.slice(1, 4))).toEqual([[owner, [owner], null], [team, [owner], null]]);
    expect((await response.json()).teamAdvisers).toEqual([{ email: team, name: "Poradce" }]);
  });
  it("queries a card by its stored ID and intersects selected advisers with the team", async () => {
    const slug = clientSlugForName("Petr Novák")!;
    await GET(request(`scope=team&advisers=${team},outsider@example.test&clientSlug=${slug}`));
    expect(mocks.read.mock.calls.every(call => JSON.stringify(call[2]) === JSON.stringify([team]) && call[3] === slug)).toBe(true);
  });
  it("returns no data for an unauthorized adviser selection", async () => {
    const response = await GET(request("scope=team&advisers=outsider@example.test"));
    expect((await response.json()).contracts).toEqual([]); expect(mocks.ensure).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("keeps unscoped legacy cards within authorized owners", async () => {
    await GET(request(`scope=all&clientSlug=${clientSlugForName("Petr Novák")}`));
    expect(mocks.read.mock.calls.map(call => [call[1], call[2]])).toEqual([[owner, null], [team, null]]);
  });
  it("reports initial indexing progress without publishing an incomplete portfolio", async () => {
    mocks.ensure.mockResolvedValueOnce({ ready: false, processed: 150 });
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ ok: true, indexing: true, indexedContracts: 175 });
    expect(body).not.toHaveProperty("contracts"); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("fails closed when an owner's index cannot be read", async () => {
    mocks.read.mockRejectedValueOnce(new Error("firestore"));
    expect((await GET(request())).status).toBe(500);
  });
  it.each([{ ...ctx, email: "" }, { ...ctx, isImpersonating: true }])("denies unauthorized cards or impersonation", async denied => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: denied, withRateLimit: (r: NextResponse) => r });
    expect((await GET(request())).status).toBe(403); expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it("rejects invalid card IDs and propagates authentication failures", async () => {
    expect((await GET(request("clientSlug=../../private"))).status).toBe(400);
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(request())).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
  });
});

it("allows the second adviser to load their own portfolio", async () => {
  mocks.guard.mockResolvedValue({ok:true,ctx:{...ctx,email:team,teamEmails:[]},withRateLimit:(r:NextResponse)=>r});
  expect((await GET(request())).status).toBe(200);
  expect(mocks.read.mock.calls.map(call=>call.slice(1,4))).toEqual([[team,[team],null]]);
});
