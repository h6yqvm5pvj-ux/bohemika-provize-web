import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
const state = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path,
    async set(data: Record<string, unknown>) { records.set(path, { ...data }); },
    async get() { return { data: () => records.get(path) }; },
  });
  let tail = Promise.resolve();
  const db = { collection: (collection: string) => ({ doc: (id: string) => ref(`${collection}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const next = tail.then(() => fn({
        get: (r: ReturnType<typeof ref>) => r.get(),
        update: (r: ReturnType<typeof ref>, data: Record<string, unknown>) => records.set(r.path, { ...records.get(r.path), ...data }),
        delete: (r: ReturnType<typeof ref>) => records.delete(r.path),
      }));
      tail = next.then(() => undefined, () => undefined); return next;
    },
  };
  return { records, db, updateUser: vi.fn(), send: vi.fn(), queue: vi.fn(), config: vi.fn() };
});
vi.mock("./firebaseAdmin", () => ({ adminAuth: { updateUser: state.updateUser }, adminDb: state.db }));
vi.mock("./firebaseAuthEmail", () => ({ requireAuthEmailConfig: state.config, sendAuthEmailMessage: state.send }));
vi.mock("./passwordChangeEmail", () => ({ queuePasswordChanged: state.queue, renderPasswordChangeCode: (code: string) => ({ code }) }));
vi.mock("@/lib/appSession", () => ({ resolveAppSessionSecret: () => "synthetic-secret-for-test-only" }));
import { authorizePasswordChange, completePasswordChange, preparePasswordChange } from "./passwordChange";
const user = { uid: "synthetic-uid", email: "advisor@example.test", disabled: false, providerData: [{ providerId: "password" }], multiFactor: { enrolledFactors: [] } } as unknown as UserRecord;
const token = (second = 0, extra = {}) => ({ uid: user.uid, email: user.email, auth_time: Math.floor(Date.now() / 1000) + second, firebase: { sign_in_provider: "password", ...extra } }) as DecodedIdToken;
const latest = () => [...state.records.values()][0];
const password = "Different-secret-83!";
async function emailReady() {
  const challenge = await preparePasswordChange(token(), user);
  const proof = token(1);
  await authorizePasswordChange(proof, user, challenge.challengeId);
  const code = state.send.mock.calls.at(-1)![1].code as string;
  return { ...challenge, proof, code };
}
beforeEach(() => {
  vi.clearAllMocks(); state.records.clear();
  state.updateUser.mockResolvedValue(user); state.send.mockResolvedValue(undefined);
  state.queue.mockResolvedValue({ jobId: "notice", sent: true }); state.config.mockReturnValue({});
});

describe("server-enforced password change confirmation", () => {
  it("requires a new password reauthentication after preparation; a previously fresh token is insufficient", async () => {
    const old = token(); const c = await preparePasswordChange(old, user);
    await expect(authorizePasswordChange(old, user, c.challengeId)).rejects.toMatchObject({ code: "change/expired" });
    expect(state.send).not.toHaveBeenCalled(); expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("sends an OTP only to the authoritative account and never persists the plain code", async () => {
    const c = await emailReady();
    expect(state.send.mock.calls[0][0]).toBe(user.email);
    expect(c.code).toMatch(/^\d{6}$/); expect(latest().codeDigest).toMatch(/^[a-f\d]{64}$/);
    expect(Object.values(latest())).not.toContain(c.code);
    expect(JSON.stringify(c)).not.toContain("codeDigest");
    await authorizePasswordChange(c.proof, user, c.challengeId);
    expect(state.send).toHaveBeenCalledOnce();
  });
  it("rejects a wrong code and commits each failed attempt; five guesses consume the challenge", async () => {
    const c = await emailReady(); const wrong = c.code === "000000" ? "000001" : "000000";
    for (let i = 1; i <= 5; i++) {
      await expect(completePasswordChange(c.proof, user, c.challengeId, password, wrong)).rejects.toMatchObject({ code: i === 5 ? "change/expired" : "change/wrong-code" });
      expect(latest().attempts).toBe(i);
    }
    await expect(completePasswordChange(c.proof, user, c.challengeId, password, c.code)).rejects.toMatchObject({ code: "change/expired" });
    expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("changes the password only once under concurrent submissions and then queues notification", async () => {
    const c = await emailReady();
    const outcomes = await Promise.allSettled([1, 2].map(() => completePasswordChange(c.proof, user, c.challengeId, password, c.code)));
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(state.updateUser).toHaveBeenCalledExactlyOnceWith(user.uid, { password });
    expect(state.queue).toHaveBeenCalledExactlyOnceWith(user.email);
    expect(JSON.stringify(latest())).not.toContain(password);
  });
  it.each(["expired", "email-changed", "different-account", "mfa-added", "wrong-provider"])("rejects %s before mutation", async scenario => {
    const c = await emailReady(); let u = user, proof = c.proof;
    if (scenario === "expired") latest().expiresAtMs = Date.now() - 1;
    if (scenario === "email-changed") u = { ...user, email: "other@example.test" } as UserRecord;
    if (scenario === "different-account") proof = { ...proof, uid: "another" };
    if (scenario === "mfa-added") u = { ...user, multiFactor: { enrolledFactors: [{ uid: "totp-1", factorId: "totp" }] } } as UserRecord;
    if (scenario === "wrong-provider") proof = { ...proof, firebase: { ...proof.firebase, sign_in_provider: "custom" } };
    await expect(completePasswordChange(proof, u, c.challengeId, password, c.code)).rejects.toBeInstanceOf(Error);
    expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("requires the enrolled TOTP identifier and cannot downgrade to an email code", async () => {
    const u = { ...user, multiFactor: { enrolledFactors: [{ uid: "totp-1", factorId: "totp" }] } } as UserRecord;
    const c = await preparePasswordChange(token(), u); expect(c.method).toBe("totp");
    await expect(authorizePasswordChange(token(1), u, c.challengeId)).rejects.toMatchObject({ code: "change/mfa-required" });
    await expect(authorizePasswordChange(token(1, { sign_in_second_factor: "totp", second_factor_identifier: "other" }), u, c.challengeId)).rejects.toMatchObject({ code: "change/mfa-required" });
    const proof = token(1, { sign_in_second_factor: "totp", second_factor_identifier: "totp-1" });
    await authorizePasswordChange(proof, u, c.challengeId);
    await completePasswordChange(proof, u, c.challengeId, password, "");
    expect(state.send).not.toHaveBeenCalled(); expect(state.updateUser).toHaveBeenCalledOnce();
  });
  it("does not permit an old email code after starting again", async () => {
    const c = await emailReady(); await preparePasswordChange(token(), user);
    await expect(completePasswordChange(c.proof, user, c.challengeId, password, c.code)).rejects.toMatchObject({ code: "change/expired" });
    expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("validates password policy on the server without consuming a valid code", async () => {
    const c = await emailReady();
    await expect(completePasswordChange(c.proof, user, c.challengeId, "weak", c.code)).rejects.toMatchObject({ code: "change/password-policy" });
    expect(latest().state).toBe("ready"); expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("invalidates confirmation on delivery failure without logging the code or provider error", async () => {
    const c = await preparePasswordChange(token(), user);
    state.send.mockRejectedValue(new Error("private provider response"));
    await expect(authorizePasswordChange(token(1), user, c.challengeId)).rejects.toMatchObject({ code: "change/email-failed" });
    expect(state.records.size).toBe(0); expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("does not claim success or send notification when the identity provider outcome is uncertain", async () => {
    const c = await emailReady(); state.updateUser.mockRejectedValue(new Error(password));
    const error = await completePasswordChange(c.proof, user, c.challengeId, password, c.code).catch(e => e);
    expect(error.code).toBe("change/outcome-unknown"); expect(error.message).not.toContain(password);
    expect(state.queue).not.toHaveBeenCalled();
  });
  it("reports a successful change accurately when the notification cannot be sent", async () => {
    const c = await emailReady(); state.queue.mockRejectedValue(new Error("unavailable"));
    await expect(completePasswordChange(c.proof, user, c.challengeId, password, c.code)).resolves.toMatchObject({ changed: true, notificationSent: false });
  });
});
