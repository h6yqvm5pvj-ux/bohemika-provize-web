// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
const mocks = vi.hoisted(() => ({ reauth: vi.fn(), resolve: vi.fn(), fetch: vi.fn(), getToken: vi.fn().mockResolvedValue("synthetic-token"), credential: vi.fn() }));
vi.mock("@/app/firebase-auth", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
  reauthenticateWithCredential: mocks.reauth,
  EmailAuthProvider: { credential: mocks.credential },
  FactorId: { TOTP: "totp" },
  getMultiFactorResolver: () => ({ hints: [{ uid: "totp-1", factorId: "totp" }], resolveSignIn: mocks.resolve }),
  TotpMultiFactorGenerator: { assertionForSignIn: (uid: string, code: string) => ({ uid, code }) },
}));
import { usePasswordChange } from "./usePasswordChange";
let root: Root, container: HTMLDivElement, flow: ReturnType<typeof usePasswordChange>;
const user = { uid: "synthetic-uid", email: "advisor@example.test", getIdToken: mocks.getToken } as unknown as User;
const password = "Different-secret-83!";
function Harness() { const current = usePasswordChange(user, ""); useEffect(() => { flow = current; }, [current]); return <span>{current.step}</span>; }
const operations = () => mocks.fetch.mock.calls.map(call => JSON.parse(call[1].body).action);
async function fill() { await act(async () => { flow.setCurrentPassword("Old-secret-72!"); flow.setPassword(password); flow.setConfirmPassword(password); }); }
async function submit() { await act(async () => { await flow.submit(); }); }
beforeEach(async () => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.getToken.mockResolvedValue("synthetic-token"); mocks.reauth.mockResolvedValue({ user }); mocks.resolve.mockResolvedValue({ user });
  mocks.fetch.mockImplementation(async (_url, init) => {
    const b = JSON.parse(init.body);
    return Response.json(b.action === "prepare" ? { ok: true, challengeId: "synthetic-challenge", method: "email", waitMs: 0 } : b.action === "authorize" ? { ok: true, method: "email" } : { ok: true, changed: true, notificationSent: true });
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness />)); await fill();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("password change workflow", () => {
  it("requires current password reauthentication then email confirmation before submitting the new password", async () => {
    await submit(); expect(flow.step).toBe("email"); expect(operations()).toEqual(["prepare", "authorize"]);
    expect(mocks.credential).toHaveBeenCalledWith(user.email, "Old-secret-72!"); expect(flow.currentPassword).toBe("");
    for (const [, init] of mocks.fetch.mock.calls) { expect(init.body).not.toContain("Old-secret"); expect(init.body).not.toContain(password); expect(init.body).not.toContain(user.email); }
    await act(async () => flow.setCode("123 456")); await submit();
    expect(flow.step).toBe("done"); expect(flow.password).toBe(""); expect(flow.code).toBe(""); expect(flow.confirmPassword).toBe("");
    expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body)).toMatchObject({ action: "complete", password, code: "123456" });
  });
  it("handles the Firebase MFA resolver and never requests email as a fallback", async () => {
    mocks.reauth.mockRejectedValue({ code: "auth/multi-factor-auth-required" });
    mocks.fetch.mockImplementation(async (_url, init) => Response.json(JSON.parse(init.body).action === "prepare" ? { ok: true, challengeId: "mfa-challenge", method: "totp", waitMs: 0 } : JSON.parse(init.body).action === "authorize" ? { ok: true, method: "totp" } : { ok: true, changed: true, notificationSent: true }));
    await submit(); expect(flow.step).toBe("totp"); expect(operations()).toEqual(["prepare"]);
    await act(async () => flow.setCode("123456")); await submit();
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith({ uid: "totp-1", code: "123456" });
    expect(operations()).toEqual(["prepare", "authorize", "complete"]); expect(flow.step).toBe("done");
    expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body).code).toBe("");
  });
  it("keeps a wrong TOTP retryable and never changes the password", async () => {
    mocks.reauth.mockRejectedValue({ code: "auth/multi-factor-auth-required" });
    mocks.resolve.mockRejectedValue({ code: "auth/invalid-verification-code" });
    await submit(); await act(async () => flow.setCode("111111")); await submit();
    expect(flow.step).toBe("totp"); expect(flow.error).toContain("není správný"); expect(operations()).toEqual(["prepare"]);
  });
  it("does not send email or a new password after invalid old credentials", async () => {
    mocks.reauth.mockRejectedValue({ code: "auth/invalid-credential" }); await submit();
    expect(flow.step).toBe("password"); expect(flow.error).toContain("Původní heslo"); expect(operations()).toEqual(["prepare"]);
  });
  it("erases secrets after an expired confirmation and lets the user start again", async () => {
    await submit(); await act(async () => flow.setCode("123456"));
    mocks.fetch.mockResolvedValue(Response.json({ ok: false, code: "change/expired", error: "Začni znovu." }, { status: 409 }));
    await submit(); expect(flow.step).toBe("expired"); expect(flow.password).toBe("");
    await act(async () => flow.reset()); expect(flow.step).toBe("password"); expect(flow.code).toBe("");
  });
  it("does not retry an uncertain password mutation or misleadingly say it failed", async () => {
    await submit(); await act(async () => flow.setCode("123456")); mocks.fetch.mockRejectedValue(new Error("transport"));
    await submit(); expect(flow.step).toBe("unknown"); expect(flow.password).toBe("");
    const count = mocks.fetch.mock.calls.length; await submit(); expect(mocks.fetch).toHaveBeenCalledTimes(count);
  });
  it("preserves successful change status even when notification is delayed", async () => {
    await submit(); await act(async () => flow.setCode("123456"));
    mocks.fetch.mockResolvedValue(Response.json({ ok: true, changed: true, notificationSent: false }));
    await submit(); expect(flow.step).toBe("done"); expect(flow.notificationSent).toBe(false);
  });
  it("prevents duplicate submission in the same render", async () => {
    await act(async () => { await Promise.all([flow.submit(), flow.submit()]); });
    expect(operations()).toEqual(["prepare", "authorize"]); expect(mocks.reauth).toHaveBeenCalledOnce();
  });
});
