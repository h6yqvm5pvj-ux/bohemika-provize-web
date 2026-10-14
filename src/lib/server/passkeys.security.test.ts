import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  getUser: vi.fn(), createCustomToken: vi.fn(), isBlocked: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", async () => {
  const { withAccountSecurityPolicy } = await import("./accountSecurityPolicy");
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: mocks.store.has(path), data: () => mocks.store.get(path) }),
    set: async (data: Record<string, unknown>) => { mocks.store.set(path, data); },
    update: async (data: Record<string, unknown>) => {
      mocks.update(path, data);
      mocks.store.set(path, { ...mocks.store.get(path), ...data });
    },
  });
  return {
    adminAuth: withAccountSecurityPolicy({ getUser: mocks.getUser, createCustomToken: mocks.createCustomToken } as never, mocks.isBlocked),
    adminDb: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (run: (tx: unknown) => Promise<unknown>) => run({
        get: (doc: ReturnType<typeof ref>) => doc.get(),
        delete: (doc: ReturnType<typeof ref>) => { mocks.store.delete(doc.path); },
      }),
    },
  };
});

import { createAuthenticationOptions, verifyAuthentication } from "./passkeys";

const origin = "https://bohemka.app";
const credentialId = Buffer.from("synthetic-credential").toString("base64url");
const challenge = Buffer.from("synthetic-server-challenge").toString("base64url");
const uid = "synthetic-passkey-owner";
const email = "passkey@example.test";
const user = { uid, email, emailVerified: true, disabled: false, multiFactor: { enrolledFactors: [{ factorId: "totp" }] } };
const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const otherKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = key.publicKey.export({ format: "jwk" });
const publicKey = Buffer.from(isoCBOR.encode(new Map([
  [1, 2], [3, -7], [-1, 1],
  [-2, Buffer.from(publicJwk.x!, "base64url")], [-3, Buffer.from(publicJwk.y!, "base64url")],
] as [number, number | Uint8Array][]))).toString("base64url");

// Use real WebAuthn signature verification and ephemeral synthetic keys. Only
// Firebase storage and token issuance are replaced; no deployment is contacted.
function assertion(options: { origin?: string; rpID?: string; flags?: number; counter?: number; forged?: boolean } = {}): AuthenticationResponseJSON {
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: options.origin ?? origin }));
  const authenticatorData = Buffer.alloc(37);
  createHash("sha256").update(options.rpID ?? "bohemka.app").digest().copy(authenticatorData);
  authenticatorData[32] = options.flags ?? 0x05;
  authenticatorData.writeUInt32BE(options.counter ?? 2, 33);
  const signature = sign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]),
    options.forged ? otherKey.privateKey : key.privateKey);
  return {
    id: credentialId, rawId: credentialId, type: "public-key", clientExtensionResults: {},
    response: {
      clientDataJSON: clientData.toString("base64url"), authenticatorData: authenticatorData.toString("base64url"),
      signature: signature.toString("base64url"), userHandle: Buffer.from(uid).toString("base64url"),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.store.clear();
  mocks.getUser.mockResolvedValue(structuredClone(user));
  mocks.createCustomToken.mockResolvedValue("synthetic-custom-token");
  mocks.isBlocked.mockResolvedValue(false);
  mocks.store.set(`passkeyCredentials/${credentialId}`, {
    credentialId, publicKey, counter: 1, uid, email, transports: [],
  });
  mocks.store.set(`_passkeyChallenges/${challenge}`, {
    challenge, type: "authentication", origin, rpID: "bohemka.app", expiresAtMs: Date.now() + 60_000,
  });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  for (const name of ["NEXT_PUBLIC_APP_URL", "WEBAUTHN_ORIGIN", "WEBAUTHN_ALLOWED_ORIGINS", "WEBAUTHN_RP_ID"]) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("passkey login bypass attempts", () => {
  it("issues a token only after a genuine signature, user verification and account checks", async () => {
    await expect(verifyAuthentication(assertion())).resolves.toEqual({ customToken: "synthetic-custom-token", uid, email });
    expect(mocks.createCustomToken).toHaveBeenCalledExactlyOnceWith(uid, { app_totp_enrolled: true });
    expect(mocks.update).toHaveBeenCalledWith(`passkeyCredentials/${credentialId}`, expect.objectContaining({ counter: 2 }));
  });

  it.each([
    ["a signature from another key", { forged: true }],
    ["another origin", { origin: "https://attacker.example.test" }],
    ["another relying party", { rpID: "attacker.example.test" }],
    ["missing user verification", { flags: 0x01 }],
    ["missing user presence", { flags: 0x04 }],
    ["a replayed signature counter", { counter: 1 }],
  ] as const)("rejects %s without issuing a token", async (_name, options) => {
    await expect(verifyAuthentication(assertion(options))).rejects.toThrow();
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["missing", "expired", "wrong-type", "malformed"])("rejects a %s server challenge", async kind => {
    const path = `_passkeyChallenges/${challenge}`;
    const record = mocks.store.get(path)!;
    if (kind === "missing") mocks.store.delete(path);
    if (kind === "expired") record.expiresAtMs = Date.now() - 1;
    if (kind === "wrong-type") record.type = "registration";
    if (kind === "malformed") delete record.rpID;
    await expect(verifyAuthentication(assertion())).rejects.toMatchObject({ status: 400 });
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });

  it("rejects reusing a successfully consumed challenge", async () => {
    const response = assertion();
    await verifyAuthentication(response);
    mocks.createCustomToken.mockClear();
    await expect(verifyAuthentication(response)).rejects.toMatchObject({ status: 400 });
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });

  it.each(["missing", "disabled"])("rejects a %s stored credential", async kind => {
    const path = `passkeyCredentials/${credentialId}`;
    if (kind === "missing") mocks.store.delete(path); else mocks.store.get(path)!.disabled = true;
    await expect(verifyAuthentication(assertion())).rejects.toMatchObject({ status: 401 });
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });

  it.each(["disabled", "unverified", "no-totp", "wrong-email", "deleted", "blocked"])("rejects a valid assertion for a %s account", async kind => {
    const account = structuredClone(user);
    if (kind === "disabled") account.disabled = true;
    if (kind === "unverified") account.emailVerified = false;
    if (kind === "no-totp") account.multiFactor.enrolledFactors = [];
    if (kind === "wrong-email") account.email = "another@example.test";
    mocks.getUser.mockResolvedValue(account);
    if (kind === "deleted") mocks.getUser.mockRejectedValue(new Error("Synthetic user missing"));
    if (kind === "blocked") mocks.isBlocked.mockResolvedValue(true);
    await expect(verifyAuthentication(assertion())).rejects.toThrow();
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });

  it("rejects a production origin forged through forwarding headers", async () => {
    const request = new NextRequest(`${origin}/api/auth/passkeys/authentication-options`, {
      headers: { Origin: "https://attacker.example.test", "x-forwarded-host": "attacker.example.test", "x-forwarded-proto": "https" },
    });
    await expect(createAuthenticationOptions(request)).rejects.toMatchObject({ status: 403 });
  });
});
