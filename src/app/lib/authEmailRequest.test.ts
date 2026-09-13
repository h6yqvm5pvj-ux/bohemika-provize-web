import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestPasswordResetEmail, requestVerificationEmail } from "./authEmailRequest";

describe("browser auth email requests", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { fetchMock.mockReset().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("sends reset requests only to the local server", async () => {
    await requestPasswordResetEmail("synthetic@example.test");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/password-reset", expect.objectContaining({
      method: "POST", body: JSON.stringify({ email: "synthetic@example.test" }), redirect: "error", credentials: "omit",
      headers: { "Content-Type": "application/json" },
    }));
  });
  it("sends an owner token for verification without supplying a recipient", async () => {
    const user = { getIdToken: vi.fn().mockResolvedValue("synthetic-token"), email: "synthetic@example.test" };
    expect(await requestVerificationEmail(user as unknown as User)).toBe(false);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/email-verification-link", expect.objectContaining({
      body: "{}", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" }, redirect: "error",
    }));
  });
  it.each([400, 401, 429, 503])("does not leak server error text for status %i", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ ok: false, error: "private-token recipient@example.test", code: "private-token" }, { status }));
    const error = await requestPasswordResetEmail("synthetic@example.test").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toMatch(/private-token|recipient@/);
  });
  it("sanitizes network failures", async () => {
    fetchMock.mockRejectedValue(new Error("private-token"));
    await expect(requestPasswordResetEmail("synthetic@example.test")).rejects.toMatchObject({ code: "auth/network-request-failed" });
  });
  it("does not accept a non-JSON success response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>login</html>"));
    await expect(requestPasswordResetEmail("synthetic@example.test")).rejects.toThrow();
  });
});
