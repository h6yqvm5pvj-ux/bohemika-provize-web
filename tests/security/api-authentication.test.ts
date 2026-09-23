import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASHFLOW_SHADOW_VERSION } from "@/app/cashflow/shadowProtocol";

const doubles = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  isBlocked: vi.fn(),
  databaseAccess: vi.fn(() => { throw new Error("Unauthenticated database access"); }),
  networkAccess: vi.fn(() => { throw new Error("Network is forbidden in security tests"); }),
}));

vi.mock("@/lib/server/firebaseAdmin", async () => {
  const { withAccountSecurityPolicy } = await import("@/lib/server/accountSecurityPolicy");
  return {
  adminAuth: withAccountSecurityPolicy({ verifyIdToken: doubles.verifyIdToken, getUser: doubles.getUser } as never, doubles.isBlocked),
  adminDb: {
    collection: doubles.databaseAccess,
    collectionGroup: doubles.databaseAccess,
    doc: doubles.databaseAccess,
    runTransaction: doubles.databaseAccess,
    batch: doubles.databaseAccess,
  },
  adminMessaging: null,
}; });

vi.mock("@/lib/server/rateLimit", () => ({
  consumeRateLimit: vi.fn(async () => ({
    allowed: true, limit: 100, remaining: 99, resetAtMs: Date.now() + 60_000,
    resetAtUnix: Math.ceil(Date.now() / 1000) + 60, retryAfterSeconds: 0, store: "memory",
  })),
  applyRateLimitHeaders: vi.fn(),
  getRequestIp: () => "192.0.2.1",
}));

// These routes intentionally accept unauthenticated visitors.
// The logout operation below is separately excluded because it clears a cookie.
const publicRoutes = new Set([
  "auth/password-reset", "auth/password-reset/confirm", "auth/login-attempts",
  "auth/passkeys/authentication", "auth/passkeys/authentication-options",
  "online-card/meeting-request", "online-card/review", "gold",
]);
const retiredRoutes = new Set(["contracts/sync-cpp-status"]);
// Setup endpoints intentionally accept recent password sessions without TOTP.
// They cannot issue application sessions or grant business-data access. Their
// distinct email requirements, revocation, blocks and limits are covered in
// src/app/api/auth/emailVerification.test.ts, auth/mfa-enrollment/route.test.ts
// and src/lib/server/emailSetupSecurity.test.ts + mfaEnrollment.test.ts.
const setupRoutes = new Set(["auth/email-verification-link", "auth/mfa-enrollment"]);
const apiRoot = join(process.cwd(), "src/app/api");
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function findRoutes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findRoutes(path) : entry.name === "route.ts" ? [path] : [];
  });
}

const cases = findRoutes(apiRoot).flatMap((file) => {
  const route = relative(apiRoot, file).replace(/\/route\.ts$/, "");
  if (publicRoutes.has(route) || retiredRoutes.has(route) || setupRoutes.has(route)) return [];
  const source = readFileSync(file, "utf8");
  return methods.filter((method) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source) &&
    !(route === "auth/session" && method === "DELETE") &&
    !(route === "online-card/analytics" && method === "POST")
  ).map((method) => ({ file, route, method }));
});

beforeEach(() => {
  vi.clearAllMocks();
  doubles.verifyIdToken.mockRejectedValue(Object.assign(new Error("Invalid token"), { code: "auth/argument-error" }));
  doubles.getUser.mockResolvedValue({ uid: "synthetic", disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [] } });
  doubles.isBlocked.mockResolvedValue(false);
  vi.stubGlobal("fetch", doubles.networkAccess);
  vi.stubEnv("CASHFLOW_SHADOW_ENABLED", "1");
  vi.stubEnv("CASHFLOW_CANDIDATES_ENABLED", "1");
  vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "1");
  vi.stubEnv("CASHFLOW_SHADOW_EMAILS", "advisor@example.test");
  vi.stubEnv("CRON_SECRET", "synthetic-cron-secret-for-local-tests");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.each([
  "missing", "forged", "without-totp", "without-mfa-proof", "blocked-account",
  "disabled-account", "unverified-email", "unproven-custom-token",
] as const)("API authentication: %s bearer", (bearer) => {
  it.each(cases)("$method /api/$route rejects access before reading data", async ({ file, route, method }) => {
    const routeModule = await import(/* @vite-ignore */ file);
    const headers = new Headers({ "Content-Type": "application/json", Origin: "https://app.example.test" });
    if (bearer !== "missing") headers.set("Authorization", "Bearer synthetic-token");
    if (bearer === "without-totp") doubles.verifyIdToken.mockResolvedValue({ uid: "synthetic", email: "synthetic@example.test", email_verified: true, firebase: { sign_in_provider: "password" } });
    if (bearer !== "missing" && bearer !== "forged" && bearer !== "without-totp") {
      doubles.verifyIdToken.mockResolvedValue({
        uid: "synthetic", email: "synthetic@example.test", email_verified: true,
        firebase: bearer === "without-mfa-proof" ? { sign_in_provider: "password" }
          : bearer === "unproven-custom-token" ? { sign_in_provider: "custom" }
          : { sign_in_provider: "password", sign_in_second_factor: "totp" },
      });
      doubles.getUser.mockResolvedValue({
        uid: "synthetic", disabled: bearer === "disabled-account", emailVerified: bearer !== "unverified-email",
        multiFactor: { enrolledFactors: [{ factorId: "totp" }] },
      });
      doubles.isBlocked.mockResolvedValue(bearer === "blocked-account");
    }
    const body = route.startsWith("cashflow/") ? {
      version: CASHFLOW_SHADOW_VERSION, asOfMs: Date.now(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      inputHash: "a".repeat(64), itemsHash: "b".repeat(64), monthsHash: "c".repeat(64),
      options: {
        scopeFilter: "combined", productFilter: "all", tipsterMode: false, showPastYears: false,
        intelligentPredictionEnabled: false, contractNumberQuery: "",
      },
    } : {};
    const request = new NextRequest(`https://app.example.test/api/${route.replace(/\[[^\]]+\]/g, "test-id")}`, {
      method, headers, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });
    const response: Response = await routeModule[method](request, {
      params: Promise.resolve({ slug: "test-client", postId: "test-post", commentId: "test-comment" }),
    });
    expect(bearer === "missing" || bearer === "forged" ? [401] : [401, 403]).toContain(response.status);
    expect(doubles.databaseAccess).not.toHaveBeenCalled();
    expect(doubles.networkAccess).not.toHaveBeenCalled();
    if (bearer === "missing") expect(doubles.verifyIdToken).not.toHaveBeenCalled();
    for (const call of doubles.verifyIdToken.mock.calls) expect(call[1]).toBe(true);
  });
});
