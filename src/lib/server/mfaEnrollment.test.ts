import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const records = new Map<string, Record<string, any>>();
  const deleted = Symbol("delete");
  let tail = Promise.resolve();
  const db = { collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: (fn: (tx: any) => Promise<unknown>) => {
      const next = tail.then(async () => {
        const pending = new Map([...records].map(([key, value]) => [key, structuredClone(value)]));
        const result = await fn({
          get: async (ref: { path: string }) => ({ data: () => pending.get(ref.path) }),
          set: (ref: { path: string }, data: Record<string, any>) => pending.set(ref.path, { ...data }),
          update: (ref: { path: string }, data: Record<string, any>) => {
            const updated = { ...pending.get(ref.path), ...data };
            for (const key in updated) if (updated[key] === deleted) delete updated[key];
            pending.set(ref.path, updated);
          },
        });
        records.clear(); pending.forEach((value, key) => records.set(key, value)); return result;
      });
      tail = next.then(() => undefined, () => undefined); return next;
    },
  };
  return { records, db, deleted, send: vi.fn(), config: vi.fn(), getUser: vi.fn(), fetch: vi.fn() };
});
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => state.deleted } }));
vi.mock("./firebaseAdmin", () => ({ adminAuth: { getUser: state.getUser }, adminDb: state.db }));
vi.mock("./firebaseAuthEmail", () => ({ requireAuthEmailConfig: state.config }));
vi.mock("./mfaEnrollmentEmail", () => ({ sendMfaEnrollmentCode: state.send }));
vi.mock("@/lib/appSession", () => ({ resolveAppSessionSecret: () => "synthetic-test-secret" }));
import { requestMfaEnrollment, verifyMfaEnrollmentEmail, finishMfaEnrollment } from "./mfaEnrollment";
const context = { uid: "synthetic", email: "synthetic@example.test", emailVerified: true, authTime: 1000 };
const challenge = () => [...state.records].find(([key]) => key.startsWith("authMfaEnrollments/"))![1];
const block = () => state.records.get(`accountBlocks/${context.uid}`)!;
const code = () => state.send.mock.calls.at(-1)![1] as string;
const startResponse = () => Response.json({ totpSessionInfo: { sharedSecretKey: "JBSWY3DPEHPK3PXP", sessionInfo: "private-provider-session", hashingAlgorithm: "SHA1", verificationCodeLength: 6, periodSec: 30, finalizeEnrollmentTime: new Date(Date.now() + 600_000).toISOString() } });
const start = async () => {
  const c = await requestMfaEnrollment(context);
  await verifyMfaEnrollmentEmail(context, "private-token", c.challengeId, code()); return c;
};
beforeEach(() => {
  vi.clearAllMocks(); state.records.clear();
  state.send.mockResolvedValue(undefined); state.config.mockReturnValue({});
  state.getUser.mockResolvedValue({ ...context, disabled: false, multiFactor: { enrolledFactors: [{ factorId: "totp", uid: "new-factor" }] } });
  state.fetch.mockImplementation(async (url: string) => url.includes(":start") ? startResponse() : Response.json({ idToken: "private-new-token", refreshToken: "private-refresh-token" }));
  vi.stubGlobal("fetch", state.fetch); vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "synthetic-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("fresh inbox proof before TOTP enrollment", () => {
  it("sends only to the authoritative email and stores a digest, never the OTP", async () => {
    const c = await requestMfaEnrollment(context);
    expect(state.send).toHaveBeenCalledWith(context.email, expect.stringMatching(/^\d{6}$/), c.challengeId);
    expect(Object.values(challenge())).not.toContain(code());
    expect(challenge().codeDigest).toMatch(/^[a-f\d]{64}$/);
    expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: null });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(c).not.toHaveProperty("secretKey");
  });
  it("commits five wrong attempts and consumes the challenge without contacting Firebase", async () => {
    const c = await requestMfaEnrollment(context); const wrong = code() === "000000" ? "000001" : "000000";
    for (let n = 1; n <= 5; n++) {
      await expect(verifyMfaEnrollmentEmail(context, "token", c.challengeId, wrong)).rejects.toMatchObject({ code: n === 5 ? "mfa/expired" : "mfa/wrong-email-code" });
      expect(challenge().attempts).toBe(n);
    }
    await expect(verifyMfaEnrollmentEmail(context, "token", c.challengeId, code())).rejects.toThrow();
    expect(challenge()).not.toHaveProperty("codeDigest"); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each(["expired", "email", "uid", "session", "challenge", "admin-block", "revoked"])("rejects %s proof before any provider call", async scenario => {
    const c = await requestMfaEnrollment(context); let current = context; let id: string = c.challengeId;
    if (scenario === "expired") challenge().expiresAtMs = Date.now();
    if (scenario === "email") current = { ...context, email: "other@example.test" };
    if (scenario === "uid") current = { ...context, uid: "other" };
    if (scenario === "session") current = { ...context, authTime: 1001 };
    if (scenario === "challenge") id = "another";
    if (scenario === "admin-block") block().reason = "admin-block";
    if (scenario === "revoked") block().revocation = { validAfterSeconds: 1001, generation: "00000000-0000-4000-8000-000000000001", pendingOperations: {} };
    await expect(verifyMfaEnrollmentEmail(current, "token", id, code())).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("consumes the email proof once during concurrent verification and keeps the provider session encrypted", async () => {
    const c = await requestMfaEnrollment(context); const otp = code();
    const results = await Promise.allSettled([1, 2].map(() => verifyMfaEnrollmentEmail(context, "token", c.challengeId, otp)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(challenge())).not.toContain("private-provider-session");
    expect(JSON.stringify(challenge())).not.toContain("JBSWY3DPEHPK3PXP");
    expect(challenge()).not.toHaveProperty("codeDigest");
    expect(challenge().state).toBe("qr");
    expect(results.find(result => result.status === "fulfilled")).toMatchObject({ value: { challengeId: c.challengeId, secretKey: "JBSWY3DPEHPK3PXP" } });
  });
  it("cannot finish enrollment before inbox confirmation", async () => {
    const c = await requestMfaEnrollment(context);
    await expect(finishMfaEnrollment(context, "token", c.challengeId, "123456")).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled(); expect(block().mfaEmailConfirmedFactorUid).toBeNull();
  });
  it("finalizes once, with the server-owned session, and approves only that factor without unblocking the account", async () => {
    const c = await start();
    const results = await Promise.allSettled([1, 2].map(() => finishMfaEnrollment(context, "token", c.challengeId, "012345")));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(state.fetch.mock.calls[1][1].body)).toMatchObject({ totpVerificationInfo: { sessionInfo: "private-provider-session", verificationCode: "012345" } });
    expect(challenge()).not.toHaveProperty("encryptedSession");
    expect(block()).toMatchObject({ reason: "missing-totp", mfaEmailConfirmedFactorUid: "new-factor" });
    expect(results.find(result => result.status === "fulfilled")).toEqual({ status: "fulfilled", value: { enrolled: true } });
    await expect(finishMfaEnrollment(context, "token", c.challengeId, "012345")).rejects.toThrow();
  });
  it("acknowledges a valid enrollment when the deadline passes during the provider call", async () => {
    vi.useFakeTimers(); const c = await start(); challenge().expiresAtMs = Date.now() + 100;
    state.fetch.mockImplementation(async () => { vi.advanceTimersByTime(200); return Response.json({}); });
    await expect(finishMfaEnrollment(context, "token", c.challengeId, "123456")).resolves.toEqual({ enrolled: true });
    expect(block().mfaEmailConfirmedFactorUid).toBe("new-factor");
    await expect(finishMfaEnrollment(context, "token", c.challengeId, "123456")).rejects.toThrow();
  });
  it("does not leave a crashed finalization permanently blocking a subsequently reset account", async () => {
    vi.useFakeTimers(); const c = await start();
    challenge().state = "finalizing"; challenge().finalizationStartedAtMs = Date.now();
    await expect(requestMfaEnrollment(context)).rejects.toThrow();
    vi.advanceTimersByTime(60_001);
    // Endpoint authentication independently requires no enrolled factors, i.e.
    // an uncertain successful enrollment must first be reset by an administrator.
    const fresh = await requestMfaEnrollment({ ...context, authTime: context.authTime + 61 });
    expect(fresh.challengeId).not.toBe(c.challengeId);
    expect(challenge().state).toBe("sent"); expect(block().mfaEmailConfirmedFactorUid).toBeNull();
  });
  it("allows correction of a known wrong TOTP, then limits retries", async () => {
    const c = await start();
    state.fetch.mockImplementation(async () => Response.json({ error: { message: "INVALID_VERIFICATION_CODE : details" } }, { status: 400 }));
    for (let n = 1; n <= 5; n++) {
      await expect(finishMfaEnrollment(context, "token", c.challengeId, "123456")).rejects.toMatchObject({ code: "mfa/wrong-totp" });
      expect(challenge().totpAttempts).toBe(n);
    }
    await expect(finishMfaEnrollment(context, "token", c.challengeId, "123456")).rejects.toThrow();
    expect(challenge().state).toBe("used"); expect(block().mfaEmailConfirmedFactorUid).toBeNull();
  });
  it("fails closed for an uncertain provider result without exposing provider secrets", async () => {
    const c = await start(); state.fetch.mockRejectedValue(new Error("private-provider-session"));
    const error = await finishMfaEnrollment(context, "token", c.challengeId, "123456").catch(e => e);
    expect(error.message).not.toContain("private-provider-session");
    expect(challenge().state).toBe("used"); expect(challenge()).not.toHaveProperty("encryptedSession");
    expect(block().mfaEmailConfirmedFactorUid).toBeNull();
  });
  it("refuses approval if an administrator blocks the account during finalization", async () => {
    const c = await start();
    state.getUser.mockImplementation(async () => { block().reason = "admin-block"; return { ...context, multiFactor: { enrolledFactors: [{ uid: "new-factor", factorId: "totp" }] } }; });
    await expect(finishMfaEnrollment(context, "token", c.challengeId, "123456")).rejects.toThrow();
    expect(block().reason).toBe("admin-block"); expect(block().mfaEmailConfirmedFactorUid).toBeNull();
  });
  it("invalidates the old proof when resending and enforces the cooldown", async () => {
    vi.useFakeTimers(); const c = await requestMfaEnrollment(context); const oldCode = code();
    await expect(requestMfaEnrollment(context)).rejects.toMatchObject({ code: "mfa/resend-wait" });
    vi.advanceTimersByTime(60_001); const next = await requestMfaEnrollment(context);
    expect(next.challengeId).not.toBe(c.challengeId);
    await expect(verifyMfaEnrollmentEmail(context, "token", c.challengeId, oldCode)).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("invalidates an undelivered code and retains the access block", async () => {
    state.send.mockRejectedValue(new Error("private-mail-provider"));
    await expect(requestMfaEnrollment(context)).rejects.toMatchObject({ code: "mfa/email-failed" });
    expect(challenge().state).toBe("used"); expect(challenge()).not.toHaveProperty("codeDigest");
    expect(block().reason).toBe("missing-totp");
  });
});
