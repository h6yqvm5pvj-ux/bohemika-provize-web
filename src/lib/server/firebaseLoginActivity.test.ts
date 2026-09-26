import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ get: vi.fn(), token: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({ adminDb: { doc: () => ({ get: state.get }) } }));
vi.mock("firebase-admin/app", () => ({ getApps: () => [{ options: { projectId: "demo-audit", credential: { getAccessToken: state.token } } }] }));
import { readFirebaseLoginActivity, serializeFirebaseLogin } from "./firebaseLoginActivity";
const entry = { timestamp: "2026-09-26T09:16:44.290Z", insertId: "synthetic", protoPayload: {
  methodName: "google.cloud.identitytoolkit.v1.AuthenticationService.SignInWithPassword", status: { message: "INVALID_LOGIN_CREDENTIALS", code: 3 },
  request: { email: "test@example.invalid", password: "NEVER_RETURN", returnSecureToken: true },
  requestMetadata: { callerIp: "198.51.100.42", callerSuppliedUserAgent: "Chrome/140 Windows" }, response: { idToken: "NEVER_RETURN" },
} };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID", "demo-audit"); state.token.mockResolvedValue({ access_token: "synthetic-access" }); state.get.mockResolvedValue({ data: () => ({ providerStartedAtMs: Date.now() - 86400000 }) }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("parses the observed provider failure schema without exposing request/response secrets", () => {
  const result = serializeFirebaseLogin(entry); expect(result).toMatchObject({ outcome: "denied", email: "test@example.invalid", identityVerified: false, country: "", ipLabel: "198.51.100.xxx", source: "firebase" });
  expect(JSON.stringify(result)).not.toMatch(/NEVER_RETURN|password"\s*:|idToken|198\.51\.100\.42/);
});
it("never treats provider acceptance as completed application login", () => {
  expect(serializeFirebaseLogin({ ...entry, protoPayload: { ...entry.protoPayload, status: { code: 0 } } })?.outcome).toBe("provider_accepted");
  expect(serializeFirebaseLogin({ ...entry, protoPayload: { ...entry.protoPayload, status: {} } })?.outcome).toBe("provider_unknown");
  expect(serializeFirebaseLogin({ ...entry, protoPayload: { methodName: "DeleteAccount" } })).toBeNull();
});
it("only requests the dedicated view and preserves empty intermediate pages", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ entries: [], nextPageToken: "next-page" })); vi.stubGlobal("fetch", fetch);
  const result = await readFirebaseLoginActivity(90, null); expect(result.events).toEqual([]); expect(result.nextCursor).toBeTruthy();
  const body = JSON.parse(fetch.mock.calls[0][1].body); expect(body.resourceNames).toEqual(["projects/demo-audit/locations/global/buckets/_Default/views/bohemika_auth_activity"]);
  expect(result.retentionDays).toBe(30);
});
it("reports missing permission as an unavailable source, never as an empty history", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  await expect(readFirebaseLoginActivity(30, null)).rejects.toThrow("Provider audit unavailable");
});
it("rejects malformed cursors before querying the provider", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(readFirebaseLoginActivity(30, "invalid")).rejects.toThrow("INVALID_ACTIVITY_CURSOR"); expect(fetch).not.toHaveBeenCalled();
});
