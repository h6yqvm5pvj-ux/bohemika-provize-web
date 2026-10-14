import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { withRateLimitHeaders, type AuthedRateLimitContext } from "@/lib/server/apiEntryGuard";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASHFLOW_SHADOW_VERSION } from "@/app/cashflow/shadowProtocol";
import { CASHFLOW_SERVER_PILOT_VERSION } from "@/app/cashflow/cashflowServerProtocol";
import { APP_SESSION_COOKIE_NAME, createAppSessionCookieValue } from "@/lib/appSession";

const doubles = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  isBlocked: vi.fn(),
  createDeniedAudit: vi.fn(async () => undefined),
  databaseAccess: vi.fn(() => { throw new Error("Unauthenticated database access"); }),
  networkAccess: vi.fn(() => { throw new Error("Network is forbidden in security tests"); }),
}));

vi.mock("@/lib/server/firebaseAdmin", async () => {
  const { withAccountSecurityPolicy } = await import("@/lib/server/accountSecurityPolicy");
  return {
  adminAuth: withAccountSecurityPolicy({ verifyIdToken: doubles.verifyIdToken, getUser: doubles.getUser } as never, doubles.isBlocked),
  adminDb: {
    // Denied logins may create a minimal audit record. No read, update or
    // delete method is exposed here; all business-data access still throws.
    collection: (name: string) => name === "_authActivity"
      ? { doc: () => ({ create: doubles.createDeniedAudit }) }
      : doubles.databaseAccess(),
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
    new RegExp(`export\\s+(?:(?:async\\s+)?function\\s+${method}\\b|const\\s+${method}\\s*=)`).test(source) &&
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
  vi.stubEnv("CASHFLOW_SERVER_PILOT_ENABLED", "1");
  vi.stubEnv("CASHFLOW_SERVER_PILOT_EMAILS", "advisor@example.test");
  vi.stubEnv("CRON_SECRET", "synthetic-cron-secret-for-local-tests");
  vi.stubEnv("APP_SESSION_SECRET", "synthetic-api-authentication-test-secret");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.each([
  "missing", "forged", "without-totp", "without-mfa-proof", "blocked-account",
  "disabled-account", "unverified-email", "unproven-custom-token",
  "expired", "revoked", "spoofed-identity", "cookie-only", "password-with-custom-proof",
] as const)("API authentication: %s bearer", (bearer) => {
  it.each(cases)("$method /api/$route rejects access before reading data", async ({ file, route, method }) => {
    const routeModule = await import(/* @vite-ignore */ file);
    const headers = new Headers({ "Content-Type": "application/json", Origin: "https://app.example.test" });
    const noBearer = ["missing", "spoofed-identity", "cookie-only"].includes(bearer);
    const invalidBearer = ["forged", "expired", "revoked"].includes(bearer);
    if (!noBearer) headers.set("Authorization", "Bearer synthetic-token");
    if (bearer === "expired" || bearer === "revoked") {
      doubles.verifyIdToken.mockRejectedValue(Object.assign(new Error("Rejected synthetic token"), {
        code: bearer === "expired" ? "auth/id-token-expired" : "auth/id-token-revoked",
      }));
    }
    if (bearer === "spoofed-identity") {
      headers.set("x-user-id", "synthetic-admin");
      headers.set("x-user-email", "admin@example.test");
      headers.set("x-user-role", "owner");
      headers.set("x-middleware-subrequest", "src/proxy:src/proxy:src/proxy:src/proxy:src/proxy");
      headers.set("x-middleware-next", "1");
    }
    if (bearer === "cookie-only") {
      const session = await createAppSessionCookieValue({ uid: "synthetic", email: "synthetic@example.test" });
      headers.set("Cookie", `${APP_SESSION_COOKIE_NAME}=${session.value}`);
    }
    if (bearer === "without-totp") doubles.verifyIdToken.mockResolvedValue({ uid: "synthetic", email: "synthetic@example.test", email_verified: true, firebase: { sign_in_provider: "password" } });
    if (!noBearer && !invalidBearer && bearer !== "without-totp") {
      doubles.verifyIdToken.mockResolvedValue({
        uid: "synthetic", email: "synthetic@example.test", email_verified: true,
        ...(bearer === "password-with-custom-proof" ? { app_totp_enrolled: true, admin: true, adminRole: "owner" } : {}),
        firebase: bearer === "without-mfa-proof" || bearer === "password-with-custom-proof" ? { sign_in_provider: "password" }
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
      version: route === "cashflow/view" ? CASHFLOW_SERVER_PILOT_VERSION : CASHFLOW_SHADOW_VERSION,
      kind: "view", asOfMs: Date.now(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      inputHash: "a".repeat(64), itemsHash: "b".repeat(64), monthsHash: "c".repeat(64),
      options: {
        scopeFilter: "combined", productFilter: "all", tipsterMode: false, showPastYears: false,
        intelligentPredictionEnabled: false, contractNumberQuery: "",
      },
    } : { uid: "synthetic-admin", email: "admin@example.test", role: "owner", admin: true, mfaVerified: true };
    const request = new NextRequest(`https://app.example.test/api/${route.replace(/\[[^\]]+\]/g, "test-id")}`, {
      method, headers, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });
    const response: Response = await routeModule[method](request, {
      params: Promise.resolve({ slug: "test-client", postId: "test-post", commentId: "test-comment" }),
    });
    expect(noBearer || invalidBearer ? [401] : [401, 403]).toContain(response.status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(doubles.databaseAccess).not.toHaveBeenCalled();
    if (route === "auth/session" && method === "POST") {
      expect(doubles.createDeniedAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "denied", source: "web", identityVerified: false, email: null }));
    } else {
      expect(doubles.createDeniedAudit).not.toHaveBeenCalled();
    }
    expect(doubles.networkAccess).not.toHaveBeenCalled();
    if (noBearer) expect(doubles.verifyIdToken).not.toHaveBeenCalled();
    for (const call of doubles.verifyIdToken.mock.calls) expect(call[1]).toBe(true);
  });
});

it("keeps decrypted authenticated responses out of browser and shared caches", () => {
  const response = NextResponse.json({ private: "synthetic" }, { headers: { "Cache-Control": "public, max-age=3600", Vary: "Origin" } });
  withRateLimitHeaders(response, { rateLimit: {} } as AuthedRateLimitContext);
  expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  expect(response.headers.get("Vary")).toBe("Origin, Authorization, Cookie");
  const wildcard = NextResponse.json({}, { headers: { Vary: "*" } });
  withRateLimitHeaders(wildcard, { rateLimit: {} } as AuthedRateLimitContext);
  expect(wildcard.headers.get("Vary")).toBe("*");
});
