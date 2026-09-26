import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: {
    batch: () => ({ create: (_ref: unknown, data: unknown) => storage.create(data), commit: storage.commit }),
    collection: () => ({ doc: () => ({
      collection: () => ({ doc: () => storage }),
    }) }),
  },
}));

import { recordAppSession, touchAppSession } from "./appSessionRegistry";

const identity = { email: "advisor@example.test", uid: "advisor-uid", sessionId: "session-1" };
const request = (headers: Record<string, string>) => new NextRequest("https://bohemka.app/api/auth/session", { headers });
const record = (headers: Record<string, string>) => recordAppSession({
  ...identity, expiresAtMs: Date.now() + 60_000, req: request(headers),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("RATE_LIMIT_TRUSTED_IP_HEADERS", "x-vercel-forwarded-for");
  vi.stubEnv("APP_SESSION_SECRET", "synthetic-session-metadata-test-secret");
  storage.create.mockResolvedValue(undefined);
  storage.update.mockResolvedValue(undefined);
  storage.commit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("session IP audit integrity", () => {
  it("writes the session and its verified login history in the same batch", async () => {
    await record({ "x-vercel-forwarded-for": "198.51.100.42" });
    expect(storage.create).toHaveBeenCalledTimes(2);
    expect(storage.create.mock.calls[0][0]).toMatchObject({ sessionId: "session-1", loginActivityRecorded: true });
    expect(storage.create.mock.calls[1][0]).toMatchObject({ email: identity.email, outcome: "success", source: "web", identityVerified: true });
    expect(storage.commit).toHaveBeenCalledOnce();
  });
  it("rejects session creation when the atomic audit write fails", async () => {
    storage.commit.mockRejectedValueOnce(new Error("unavailable"));
    await expect(record({})).rejects.toThrow("unavailable");
  });
  it.each(["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"])(
    "ignores forged %s in both the displayed IP and its fingerprint", async forgedHeader => {
      await record({ "x-vercel-forwarded-for": "198.51.100.42" });
      const legitimate = storage.create.mock.calls[0]![0];
      await record({ "x-vercel-forwarded-for": "198.51.100.42", [forgedHeader]: "203.0.113.99" });
      const forged = storage.create.mock.calls[2]![0];
      expect(forged.ipLabel).toBe("198.51.100.xxx");
      expect(forged.ipHash).toBe(legitimate.ipHash);
      expect(forged.ipHash).not.toBe("");
    },
  );
  it("leaves the IP unknown when only untrusted headers are present", async () => {
    await record({ "x-forwarded-for": "203.0.113.99", "cf-connecting-ip": "203.0.113.99" });
    expect(storage.create.mock.calls[0]![0]).toMatchObject({ ipLabel: "", ipHash: "" });
  });
  it("masks trusted IPv6 addresses", async () => {
    await record({ "x-vercel-forwarded-for": "2001:db8:1234:5678::1" });
    expect(storage.create.mock.calls[0]![0]).toMatchObject({ ipLabel: "2001:db8:1234:..." });
  });
  it("also ignores spoofed headers when updating an existing session", async () => {
    await touchAppSession({ ...identity, req: request({
      "x-vercel-forwarded-for": "198.51.100.42", "cf-connecting-ip": "203.0.113.99",
    }) });
    expect(storage.update.mock.calls[0]![0]).toMatchObject({ ipLabel: "198.51.100.xxx" });
  });
});
