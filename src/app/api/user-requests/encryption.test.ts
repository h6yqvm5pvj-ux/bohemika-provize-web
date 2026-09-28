import "../../../../tests/helpers/privateEncryptionTestKey";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { privateFirestore } from "../../../../tests/helpers/privateFirestore";
const mocks = vi.hoisted(() => ({ db: null as Firestore | null, guard: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; }, adminAuth: null }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (r: NextResponse) => r }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_: string, run: () => unknown) => run() }));
import { GET, POST, PATCH, PUT } from "./route";

let store: ReturnType<typeof privateFirestore>;
const owner = "owner@example.test";
const asUser = (email: string, admin = false) => mocks.guard.mockResolvedValue({ ok: true, ctx: { email, uid: email, decoded: { admin } } });
const request = (method: string, data?: object, query = "") => new NextRequest(`https://example.test/api/user-requests${query}`, { method, ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
beforeEach(() => { vi.clearAllMocks(); store = privateFirestore(); mocks.db = store.db; asUser(owner); vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true"); });
describe("encrypted user requests", () => {
  it("round-trips creation, admin feedback and owner corrections with no readable copies", async () => {
    const body = { subject: "problem", message: "Sensitive request text", priority: "normal" };
    const response = await POST(request("POST", body));
    expect(response.status).toBe(200);
    const id = (await response.json()).request.id;
    expect((await (await GET(request("GET"))).json()).requests[0].message).toBe(body.message);
    asUser("admin@example.test", true);
    expect((await PATCH(request("PATCH", { id, status: "needsInfo", feedback: "Sensitive reply text" }))).status).toBe(200);
    asUser(owner);
    expect((await PUT(request("PUT", { ...body, id, message: "Sensitive corrected text" }))).status).toBe(200);
    const own = await (await GET(request("GET"))).json();
    expect(own.requests[0]).toMatchObject({ message: "Sensitive corrected text", feedback: "Sensitive reply text" });
    expect(JSON.stringify([...store.records])).not.toContain("Sensitive");
  });
  it("denies another account before trying to decrypt even a damaged request", async () => {
    store.records.set("userRequests/secret-request", { requesterEmail: owner, message: { privateEncryption: 1, payload: {} } });
    asUser("stranger@example.test");
    expect((await PUT(request("PUT", { id: "secret-request", subject: "problem", message: "Attempted overwrite", priority: "normal" }))).status).toBe(403);
    expect((await (await GET(request("GET", undefined, "?scope=all"))).json()).requests).toEqual([]);
    expect((await PATCH(request("PATCH", { id: "secret-request", status: "accepted" }))).status).toBe(403);
  });
});
