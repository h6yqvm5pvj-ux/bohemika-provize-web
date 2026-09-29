import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import scheduler from "../../../web-scheduler.json";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), broadcasts: vi.fn(), reminders: vi.fn() }));
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = mocks.verify; } }));
vi.mock("./adminBroadcastNotifications", () => ({ runDueScheduledAdminBroadcasts: mocks.broadcasts }));
vi.mock("./mailboxSnoozeReminders", () => ({ runDueMailboxSnoozeReminders: mocks.reminders }));
import { isAuthorizedWebCronRequest } from "./webCronAuth";
import { GET as broadcasts } from "@/app/api/cron/admin-broadcasts/route";
import { GET as reminders } from "@/app/api/cron/mailbox-snooze-reminders/route";
const token = "eyJsynthetic.payload.signature";
const request = (path: string, bearer?: string) => new NextRequest(`https://bohemka.app${path}`, {
  headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
  mocks.verify.mockResolvedValue({ getPayload: () => ({ email: scheduler.serviceAccountEmail, email_verified: true }) });
  mocks.broadcasts.mockResolvedValue({ ok: true }); mocks.reminders.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("web Scheduler authentication", () => {
  it.each(scheduler.jobs)("pins the OIDC audience for $path and accepts only its trusted identity", async job => {
    expect(await isAuthorizedWebCronRequest(request(job.path, token))).toBe(true);
    expect(mocks.verify).toHaveBeenCalledWith({ idToken: token, audience: `${scheduler.origin}${job.path}` });
    for (const payload of [{ email: "someone@example.test", email_verified: true }, { email: scheduler.serviceAccountEmail, email_verified: false }, undefined]) {
      mocks.verify.mockResolvedValue({ getPayload: () => payload });
      expect(await isAuthorizedWebCronRequest(request(job.path, token))).toBe(false);
    }
  });
  it("rejects invalid signatures, issuers, expiry and audiences reported by Google verification", async () => {
    for (const error of ["signature", "issuer", "expired", "audience"]) {
      mocks.verify.mockRejectedValue(new Error(error));
      expect(await isAuthorizedWebCronRequest(request(scheduler.jobs[0].path, token))).toBe(false);
    }
  });
  it("keeps the existing cron secret working without a Google request", async () => {
    expect(await isAuthorizedWebCronRequest(request(scheduler.jobs[0].path, "synthetic-cron-secret"))).toBe(true);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("fails closed in production with no secret, no token or an unrelated path", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(await isAuthorizedWebCronRequest(request(scheduler.jobs[0].path))).toBe(false);
    expect(await isAuthorizedWebCronRequest(request(scheduler.jobs[0].path, "wrong"))).toBe(false);
    expect(await isAuthorizedWebCronRequest(request("/api/cron/other", token))).toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each([
    { path: "/api/cron/admin-broadcasts", handle: broadcasts, work: mocks.broadcasts },
    { path: "/api/cron/mailbox-snooze-reminders", handle: reminders, work: mocks.reminders },
  ])("never runs $path before successful authentication", async ({ path, handle, work }) => {
    expect((await handle(request(path))).status).toBe(401); expect(work).not.toHaveBeenCalled();
    expect((await handle(request(path, "wrong"))).status).toBe(401); expect(work).not.toHaveBeenCalled();
    expect((await handle(request(path, token))).status).toBe(200); expect(work).toHaveBeenCalledOnce();
  });
});
