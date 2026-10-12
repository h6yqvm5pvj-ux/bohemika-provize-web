import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DIRECTORY_CONTACTS,
  type DirectoryContact,
} from "@/app/lib/contactDirectory";

const pillowDefaults = DEFAULT_DIRECTORY_CONTACTS.filter(
  (contact) => contact.institutionKey === "pillow",
);

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

  it.each(["GET", "PUT"] as const)("odmítne %s bez přihlášení", async (method) => {
    mocks.requireAdvisor.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const handlers = await import("./route");
    const response = await handlers[method](
      new NextRequest("https://bohemka.app/api/contacts", { method }),
    );
    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("doplní Pillow do staršího adresáře a zachová uložené kontakty", async () => {
    const existing: DirectoryContact = {
      id: "custom-cpp",
      institutionKey: "cpp",
      person: "Testovací podpora",
      emails: [{ value: "podpora@example.test" }],
    };
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ contacts: [existing] }),
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://bohemka.app/api/contacts"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.contacts).toEqual([existing, ...pillowDefaults]);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
    expect(mocks.writeMailbox).not.toHaveBeenCalled();
  });

  it.each(["id", "email", "phone"] as const)(
    "neduplikuje existující kartu Pillow podle %s a zachová její úpravy",
    async (match) => {
      const seed = pillowDefaults[0];
      const edited: DirectoryContact = {
        id: match === "id" ? seed.id : "custom-pillow",
        institutionKey: "pillow",
        person: "Upravený testovací kontakt",
        emails: [{
          value: match === "email"
            ? seed.emails![0].value.toUpperCase()
            : "upraveny@example.test",
        }],
        ...(match === "phone" ? { phone: seed.phone } : {}),
      };
      mocks.get.mockResolvedValue({
        exists: true,
        data: () => ({ contacts: [edited] }),
      });
      const { GET } = await import("./route");
      const response = await GET(new NextRequest("https://bohemka.app/api/contacts"));
      const payload = await response.json();
      expect(payload.contacts).toEqual([edited, pillowDefaults[1]]);
    },
  );

  it("neobnoví odstraněné kontakty po uložení nové verze adresáře", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ contacts: [], pillowDefaultsVersion: 1 }),
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://bohemka.app/api/contacts"));
    expect((await response.json()).contacts).toEqual([]);
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

  it("odmítne neplatná kontaktní data i specialistovi", async () => {
    mocks.canManage.mockResolvedValue(true);
    const { PUT } = await import("./route");
    const response = await PUT(new NextRequest("https://bohemka.app/api/contacts", {
      method: "PUT",
      body: JSON.stringify({ contacts: [{ id: "invalid", institutionKey: "pillow", phone: { display: "Test", href: "javascript:alert(1)" } }] }),
    }));
    expect(response.status).toBe(400);
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
        body: JSON.stringify({ contacts: [pillowContact], pillowDefaultsVersion: 999 }),
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
        pillowDefaultsVersion: 1,
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
      data: () => ({ contacts: [unchangedContact], pillowDefaultsVersion: 1 }),
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

  it("uloží doplněné výchozí kontakty bez notifikace, když se zobrazený obsah nezměnil", async () => {
    mocks.canManage.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ contacts: [] }),
    });
    const { PUT } = await import("./route");
    const response = await PUT(new NextRequest("https://bohemka.app/api/contacts", {
      method: "PUT",
      body: JSON.stringify({ contacts: pillowDefaults }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      contacts: pillowDefaults,
      pillowDefaultsVersion: 1,
    }));
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
