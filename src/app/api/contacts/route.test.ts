import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  canManage: vi.fn(),
  requireAdvisor: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: vi.fn(() => "server-timestamp") },
}));

vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.requireAdvisor,
  withRateLimitHeaders: vi.fn((response: NextResponse) => response),
}));

vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mocks.get, set: mocks.set })),
    })),
  },
}));

vi.mock("@/lib/server/toolDocuments", () => ({
  canManageToolDocuments: mocks.canManage,
}));

const authContext = {
  email: "specialista@bohemika.eu",
  uid: "user-1",
  decoded: {},
  rateLimit: {},
};

describe("/api/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdvisor.mockResolvedValue({ ok: true, ctx: authContext });
    mocks.canManage.mockResolvedValue(false);
    mocks.get.mockResolvedValue({ exists: false, data: () => undefined });
    mocks.set.mockResolvedValue(undefined);
  });

  it("vrátí výchozí kontakty a oprávnění uživatele", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://bohemka.app/api/contacts"),
    );
    const payload = (await response.json()) as {
      canManage?: boolean;
      contacts?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.canManage).toBe(false);
    expect(payload.contacts?.length).toBeGreaterThan(0);
  });

  it("zakáže zápis běžnému uživateli", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("https://bohemka.app/api/contacts", {
        method: "PUT",
        body: JSON.stringify({ contacts: [] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("umožní specialistovi uložit první kartu Pillow", async () => {
    mocks.canManage.mockResolvedValue(true);
    const pillowContact = {
      id: "pillow-kam",
      institutionKey: "pillow",
      person: "Pillow KAM",
      phone: { display: "+420 777 123 456", href: "+420777123456" },
      emails: [{ value: "kam@pillow.cz" }],
    };
    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("https://bohemka.app/api/contacts", {
        method: "PUT",
        body: JSON.stringify({ contacts: [pillowContact] }),
      }),
    );
    const payload = (await response.json()) as {
      contacts?: unknown[];
      canManage?: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.canManage).toBe(true);
    expect(payload.contacts).toEqual([pillowContact]);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: [pillowContact],
        updatedByEmail: authContext.email,
      }),
    );
  });
});
