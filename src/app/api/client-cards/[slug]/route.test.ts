import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyClientCard, MAX_CLIENT_CARD_REQUEST_BYTES } from "@/app/_klienti/clientCardData";
import { CLIENT_CARD_PILOT_OWNER_EMAIL, TEST_CLIENT_SLUG } from "@/app/_klienti/clientAccess";

const mocks = vi.hoisted(() => ({
  requireAdvisor: vi.fn(),
  get: vi.fn(),
  write: vi.fn(),
  collection: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-timestamp" },
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.requireAdvisor,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, runTransaction: mocks.transaction },
}));

import { GET, PUT } from "./route";

const owner = { uid: "owner-uid", email: CLIENT_CARD_PILOT_OWNER_EMAIL, isImpersonating: false };
const card = { ...createEmptyClientCard("Testovací klient"), birthNumber: "900101/0000" };
const context = (slug = TEST_CLIENT_SLUG) => ({ params: Promise.resolve({ slug }) });
const request = (method = "GET", body?: unknown) => new NextRequest(
  `https://bohemka.app/api/client-cards/${TEST_CLIENT_SLUG}`,
  { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
);
const expectPrivate = (response: Response) => {
  expect(response.headers.get("Cache-Control")).toContain("private");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Vary")).toContain("Authorization");
};

describe("client card authorization and persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdvisor.mockResolvedValue({ ok: true, ctx: owner });
    mocks.get.mockResolvedValue({ data: () => undefined });
    const node = (path: string): object => ({
      path,
      collection: (name: string) => node(`${path}/${name}`),
      doc: (id: string) => node(`${path}/${id}`),
      get: () => mocks.get(path),
    });
    mocks.collection.mockImplementation(node);
    mocks.transaction.mockImplementation(async (callback) => callback({
      get: (ref: { path: string }) => mocks.get(ref.path),
      set: (ref: { path: string }, data: unknown) => mocks.write(ref.path, data),
    }));
  });

  it.each([401, 403, 429])("preserves guard rejection %s without accessing card data", async (status) => {
    mocks.requireAdvisor.mockImplementation(async () => ({
      ok: false, response: NextResponse.json({ error: "Rejected" }, { status }),
    }));
    for (const handler of [GET, PUT]) {
      const response = await handler(request(handler === GET ? "GET" : "PUT"), context());
      expect(response.status).toBe(status);
      expectPrivate(response);
    }
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    { ...owner, email: "other@bohemika.eu" },
    { ...owner, email: "jakub.rauscher@example.org" },
    { ...owner, isImpersonating: true },
  ])("rejects an unauthorized account or impersonation: %j", async (ctx) => {
    mocks.requireAdvisor.mockResolvedValue({ ok: true, ctx });
    const read = await GET(request(), context());
    const write = await PUT(request("PUT", { card, expectedRevision: 0 }), context());
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expectPrivate(read);
    expectPrivate(write);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("requires the advisor guard with impersonation disabled", async () => {
    await GET(request(), context());
    expect(mocks.requireAdvisor).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({
      allowImpersonation: false, namespace: "api:client-cards:get", limit: 60,
    }));
  });

  it("rejects client slugs outside the pilot for reads and writes", async () => {
    expect((await GET(request(), context("other-client"))).status).toBe(404);
    expect((await PUT(request("PUT", { card, expectedRevision: 0 }), context("other-client"))).status).toBe(404);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("returns an empty card in the authenticated UID's namespace", async () => {
    const response = await GET(request(), context());
    expect(await response.json()).toEqual({ ok: true, card: null, revision: 0 });
    expect(mocks.get).toHaveBeenCalledWith(`clientCardsPrivate/owner-uid/cards/${TEST_CLIENT_SLUG}`);
    expectPrivate(response);
  });

  it("does not reuse a previous UID's card even if the account email is the same", async () => {
    mocks.get.mockImplementation(async (path: string) => ({ data: () => path.includes("/owner-uid/")
      ? { ownerUid: owner.uid, card, revision: 1 } : undefined }));
    expect((await (await GET(request(), context())).json()).card).toEqual(card);
    mocks.requireAdvisor.mockResolvedValue({ ok: true, ctx: { ...owner, uid: "replacement-uid" } });
    expect(await (await GET(request(), context())).json()).toEqual({ ok: true, card: null, revision: 0 });
  });

  it("returns only validated card fields and revision", async () => {
    mocks.get.mockResolvedValue({ data: () => ({ ownerUid: owner.uid, card, revision: 2, internalNote: "private" }) });
    const response = await GET(request(), context());
    expect(await response.json()).toEqual({ ok: true, card, revision: 2 });
    expectPrivate(response);
  });

  it.each([
    { ownerUid: "different-owner", card, revision: 1 },
    { ownerUid: owner.uid, card: { ...card, birthDate: "invalid" }, revision: 1 },
    { ownerUid: owner.uid, card, revision: 0 },
  ])("fails closed on an invalid stored document", async (data) => {
    mocks.get.mockResolvedValue({ data: () => data });
    const read = await GET(request(), context());
    const write = await PUT(request("PUT", { card, expectedRevision: 0 }), context());
    expect(read.status).toBe(500);
    expect(write.status).toBe(500);
    expect(JSON.stringify(await read.json())).not.toContain(card.birthNumber);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("creates a card with a server-controlled owner and revision", async () => {
    const response = await PUT(request("PUT", { card, expectedRevision: 0 }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, card, revision: 1 });
    expect(mocks.write).toHaveBeenCalledWith(`clientCardsPrivate/owner-uid/cards/${TEST_CLIENT_SLUG}`, {
      ownerUid: owner.uid, card, revision: 1, updatedAt: "server-timestamp",
    });
    expectPrivate(response);
  });

  it("persists explicit blank fields when updating a saved card", async () => {
    mocks.get.mockResolvedValue({ data: () => ({ ownerUid: owner.uid, card, revision: 3 }) });
    const edited = { ...card, birthNumber: "" };
    const response = await PUT(request("PUT", { card: edited, expectedRevision: 3 }), context());
    expect(await response.json()).toEqual({ ok: true, card: edited, revision: 4 });
    expect(mocks.write).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ card: edited, revision: 4 }));
  });

  it.each([0, 2, 4])("rejects stale or invented revision %s without overwriting", async (expectedRevision) => {
    mocks.get.mockResolvedValue({ data: () => ({ ownerUid: owner.uid, card, revision: 3 }) });
    const response = await PUT(request("PUT", { card, expectedRevision }), context());
    expect(response.status).toBe(409);
    expectPrivate(response);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    { card, expectedRevision: 0, ownerUid: "victim" },
    { card: { ...card, ownerUid: "victim" }, expectedRevision: 0 },
    { card, expectedRevision: -1 },
    { card, expectedRevision: 0.5 },
    { card, expectedRevision: Number.MAX_SAFE_INTEGER },
    { card },
    { card: { clientName: "Partial" }, expectedRevision: 0 },
  ])("rejects invalid fields and client-supplied ownership", async (body) => {
    const response = await PUT(request("PUT", body), context());
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a request exceeding the byte limit", async () => {
    const response = await PUT(request("PUT", { card: { ...card, clientName: "ě".repeat(MAX_CLIENT_CARD_REQUEST_BYTES) }, expectedRevision: 0 }), context());
    expect(response.status).toBe(413);
    expectPrivate(response);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await PUT(new NextRequest("https://bohemka.app/api/client-cards/test", { method: "PUT", body: "{" }), context());
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns a generic error without personal data when persistence fails", async () => {
    mocks.transaction.mockRejectedValue(new Error(`Database error: ${card.birthNumber}`));
    const response = await PUT(request("PUT", { card, expectedRevision: 0 }), context());
    expect(response.status).toBe(500);
    expectPrivate(response);
    expect(JSON.stringify(await response.json())).not.toContain(card.birthNumber);
  });
});
