import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyClientCard } from "@/app/_klienti/clientCardData";
import { CLIENT_CARD_PILOT_OWNER_EMAIL } from "@/app/_klienti/clientAccess";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), collection: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAdvisorAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: NextResponse) => response }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: mocks.collection } }));
import { GET } from "./route";

const request = () => new NextRequest("https://test.local/api/client-cards");
const ctx = { uid: "owner", email: CLIENT_CARD_PILOT_OWNER_EMAIL, isImpersonating: false };
const card = { ...createEmptyClientCard("Petr Novák"), birthNumber: "900101/0000", phone: "777123456", occupation: "Private" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx });
  const node = (path: string): object => ({
    doc: (id: string) => node(`${path}/${id}`), collection: (name: string) => node(`${path}/${name}`), get: () => mocks.get(path),
  });
  mocks.collection.mockImplementation(node);
  mocks.get.mockResolvedValue({ docs: [{ id: clientSlugForName(card.clientName), data: () => ({ ownerUid: ctx.uid, card }) }] });
});

describe("private client directory summaries", () => {
  it("returns only directory fields from the authenticated owner's namespace", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, cards: [{ slug: clientSlugForName(card.clientName), clientName: card.clientName, phone: card.phone, email: "", permanentAddress: "" }] });
    expect(mocks.get).toHaveBeenCalledWith("clientCardsPrivate/owner/cards");
    expect(response.headers.get("Cache-Control")).toContain("private, no-store");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ allowImpersonation: false }));
  });
  it.each([401, 403, 429])("preserves authorization and rate-limit failures: %s", async (status) => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await GET(request())).status).toBe(status);
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it.each([{ ...ctx, email: "" }, { ...ctx, isImpersonating: true }])("denies unavailable accounts before reading data", async (ctx) => {
    mocks.guard.mockResolvedValue({ ok: true, ctx });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it("fails closed on a wrong owner without leaking personal data", async () => {
    mocks.get.mockResolvedValue({ docs: [{ id: clientSlugForName(card.clientName), data: () => ({ ownerUid: "other", card }) }] });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(card.birthNumber);
  });
});

it("opens client summaries for another authenticated adviser in their own UID namespace", async () => {
  mocks.guard.mockResolvedValue({ok:true,ctx:{...ctx,uid:"colleague",email:"other@example.test"}});
  mocks.get.mockResolvedValue({docs:[]});
  expect((await GET(request())).status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith("clientCardsPrivate/colleague/cards");
});
