import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(), verify: vi.fn(), limit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/server/activeAppSession", () => ({ verifyActiveAppSession: mocks.verify }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.limit }));

import { APP_SESSION_COOKIE_NAME } from "@/lib/appSession";
import { refreshAuthenticatedRoutes } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockReturnValue({ value: "synthetic-session-cookie" });
  mocks.verify.mockResolvedValue({ ok: true, session: { uid: "verified-user" } });
  mocks.limit.mockResolvedValue({ allowed: true });
});

describe("authenticated login route refresh", () => {
  it.each(["invalid", "revoked", "blocked", "unavailable"])("does not invalidate routes for a %s session", async reason => {
    mocks.verify.mockResolvedValue({ ok: false, reason });
    await expect(refreshAuthenticatedRoutes()).rejects.toThrow("Přihlášení se nepodařilo ověřit");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("requires a server-verified cookie even if a client supplies another user or administrator role", async () => {
    mocks.cookie.mockReturnValue(undefined);
    mocks.verify.mockResolvedValue({ ok: false, reason: "invalid" });
    await expect(Reflect.apply(refreshAuthenticatedRoutes, undefined, [{ uid: "another-user", role: "admin" }]))
      .rejects.toThrow("Přihlášení se nepodařilo ověřit");
    expect(mocks.cookie).toHaveBeenCalledWith(APP_SESSION_COOKIE_NAME);
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("invalidates cached guest routes only after an active session is confirmed, returning no private data", async () => {
    await expect(refreshAuthenticatedRoutes()).resolves.toBeUndefined();
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith("synthetic-session-cookie");
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ key: "verified-user" }));
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidate.mock.invocationCallOrder[0]);
  });

  it.each(["firestore", "unavailable"])("keeps revalidation closed when the %s rate limit is denied", async store => {
    mocks.limit.mockResolvedValue({ allowed: false, store });
    await expect(refreshAuthenticatedRoutes()).rejects.toThrow("Dokončení přihlášení není momentálně dostupné");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
