import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generatePasswordResetLink: vi.fn(), generateEmailVerificationLink: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: mocks }));
import { sendFirebaseAuthEmail } from "./firebaseAuthEmail";

const email = "synthetic@example.test";
const actionLink = (mode: string) => `https://synthetic.firebaseapp.com/__/auth/action?mode=${mode}&oobCode=synthetic-code&apiKey=public-test-key`;

describe("Firebase action links delivered exclusively through Resend", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("RESEND_API_KEY", "re_synthetic_key");
    vi.stubEnv("AUTH_EMAIL_FROM", "BohemkaApp <noreply@example.test>");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({ id: "synthetic-message" }));
    mocks.generatePasswordResetLink.mockResolvedValue(actionLink("resetPassword"));
    mocks.generateEmailVerificationLink.mockResolvedValue(actionLink("verifyEmail"));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each(["PASSWORD_RESET", "VERIFY_EMAIL"] as const)("delivers %s in Czech without returning its secret", async (requestType) => {
    expect(await sendFirebaseAuthEmail({ requestType, email })).toBeUndefined();
    const selected = requestType === "PASSWORD_RESET" ? mocks.generatePasswordResetLink : mocks.generateEmailVerificationLink;
    const other = requestType === "PASSWORD_RESET" ? mocks.generateEmailVerificationLink : mocks.generatePasswordResetLink;
    expect(selected).toHaveBeenCalledExactlyOnceWith(email);
    expect(other).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST", cache: "no-store", redirect: "error",
      headers: expect.objectContaining({ Authorization: "Bearer re_synthetic_key", "Idempotency-Key": expect.any(String) }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.to).toEqual([email]);
    expect(body.from).toBe("BohemkaApp <noreply@example.test>");
    expect(body.text).toContain("lang=cs");
    expect(body.text).toContain("synthetic-code");
    expect(body.text).toContain("https://bohemka.app/ucet/akce#mode=");
    expect(body.text).not.toContain("synthetic.firebaseapp.com");
    expect(body.text).not.toContain("apiKey=");
    expect(body.html).toContain("&amp;oobCode=");
    expect(JSON.stringify(body)).not.toContain("re_synthetic_key");
    expect(body).not.toHaveProperty("cc");
    expect(body).not.toHaveProperty("bcc");
  });
  it.each([
    ["RESEND_API_KEY", ""], ["RESEND_API_KEY", "invalid\nkey"],
    ["AUTH_EMAIL_FROM", ""], ["AUTH_EMAIL_FROM", "sender@example.test\nBcc: other@example.test"],
  ])("fails before generating a link when %s is invalid", async (name, value) => {
    vi.stubEnv(name, value);
    await expect(sendFirebaseAuthEmail({ requestType: "PASSWORD_RESET", email })).rejects.toMatchObject({ code: "auth/configuration-not-found" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.generatePasswordResetLink).not.toHaveBeenCalled();
  });
  it("rejects a recipient list before generation", async () => {
    await expect(sendFirebaseAuthEmail({ requestType: "PASSWORD_RESET", email: "one@example.test,two@example.test" })).rejects.toMatchObject({ code: "auth/invalid-email" });
    expect(mocks.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])("sanitizes Resend failure %i without reading its body", async (status) => {
    const response = Response.json({ message: `${email} synthetic-code re_synthetic_key` }, { status });
    const read = vi.spyOn(response, "json");
    fetchMock.mockResolvedValue(response);
    const error = await sendFirebaseAuthEmail({ requestType: "VERIFY_EMAIL", email }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toMatch(/synthetic|example.test/);
    expect(read).not.toHaveBeenCalled();
  });
  it("sanitizes network errors without retrying a potentially sent message", async () => {
    fetchMock.mockRejectedValue(new Error("request contains re_synthetic_key synthetic-code"));
    await expect(sendFirebaseAuthEmail({ requestType: "VERIFY_EMAIL", email })).rejects.toMatchObject({ code: "auth/network-request-failed" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("sanitizes Firebase errors and never delivers a failed action", async () => {
    mocks.generateEmailVerificationLink.mockRejectedValue(new Error(`${email} synthetic-code`));
    const error = await sendFirebaseAuthEmail({ requestType: "VERIFY_EMAIL", email }).catch((e: Error) => e);
    expect(String(error)).not.toMatch(/synthetic|example.test/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http://example.test/?mode=verifyEmail&oobCode=code", "javascript:alert(1)", actionLink("resetPassword")])("rejects an invalid verification action URL", async (url) => {
    mocks.generateEmailVerificationLink.mockResolvedValue(url);
    await expect(sendFirebaseAuthEmail({ requestType: "VERIFY_EMAIL", email })).rejects.toMatchObject({ code: "auth/configuration-not-found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
