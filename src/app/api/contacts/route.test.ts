import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  canManage: vi.fn(),
  requireAdvisor: vi.fn(),
  loadAllEmails: vi.fn(),
  sendBroadcast: vi.fn(),
  writeMailbox: vi.fn(),
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

vi.mock("@/lib/server/adminBroadcastNotifications", () => ({
  loadAllBroadcastUserEmails: mocks.loadAllEmails,
  sendAdminBroadcastNow: mocks.sendBroadcast,
}));

vi.mock("@/lib/server/mailbox", () => ({
  writeMailboxEntries: mocks.writeMailbox,
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
    mocks.loadAllEmails.mockResolvedValue([
      "prvni@bohemika.eu",
      "druhy@bohemika.eu",
    ]);
    mocks.writeMailbox.mockResolvedValue({ written: 2 });
    mocks.sendBroadcast.mockResolvedValue({ ok: true, sent: 2 });
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
    expect(mocks.writeMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmails: ["prvni@bohemika.eu", "druhy@bohemika.eu"],
        type: "contact_directory_update",
        deepLink: "/?contacts=1&source=contact-notification",
      }),
    );
    expect(mocks.sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        targetMode: "all",
        targetPath: "/?contacts=1&source=contact-notification",
      }),
      expect.objectContaining({ adminEmail: authContext.email }),
      expect.any(NextRequest),
    );
  });

  it("neodešle notifikaci, pokud se obsah nezměnil", async () => {
    mocks.canManage.mockResolvedValue(true);
    const unchangedContact = {
      id: "pillow-kam",
      institutionKey: "pillow",
      person: "Pillow KAM",
      emails: [{ value: "kam@pillow.cz" }],
    };
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ contacts: [unchangedContact] }),
    });
    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("https://bohemka.app/api/contacts", {
        method: "PUT",
        body: JSON.stringify({ contacts: [unchangedContact] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.writeMailbox).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it("rozdělí interní notifikace do dávek pro všechny uživatele", async () => {
    mocks.canManage.mockResolvedValue(true);
    mocks.loadAllEmails.mockResolvedValue(
      Array.from(
        { length: 401 },
        (_, index) => `uzivatel${index}@bohemika.eu`,
      ),
    );
    const contact = {
      id: "pillow-podpora",
      institutionKey: "pillow",
      description: "Podpora",
      emails: [{ value: "podpora@pillow.cz" }],
    };
    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("https://bohemka.app/api/contacts", {
        method: "PUT",
        body: JSON.stringify({ contacts: [contact] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.writeMailbox).toHaveBeenCalledTimes(2);
    expect(
      mocks.writeMailbox.mock.calls[0]?.[0]?.recipientEmails,
    ).toHaveLength(400);
    expect(
      mocks.writeMailbox.mock.calls[1]?.[0]?.recipientEmails,
    ).toHaveLength(1);
  });
});
