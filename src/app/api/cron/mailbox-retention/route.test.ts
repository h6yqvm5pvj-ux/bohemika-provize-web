import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schedule from "../../../../../vercel.json";
const cleanup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/mailboxRetention", () => ({ cleanupExpiredSystemMailbox: cleanup }));
import { GET } from "./route";
const request = (authorization?: string, query = "") => new Request(`https://bohemka.app/api/cron/mailbox-retention${query}`, {
  headers: authorization ? { authorization } : {},
});
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
  cleanup.mockResolvedValue({ ok: true, retentionDays: 10, deleted: 2 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("scheduled notification cleanup", () => {
  it.each(["development", "production"])("fails closed without a configured secret in %s", async environment => {
    vi.stubEnv("NODE_ENV", environment); vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it.each([undefined, "Bearer wrong", "synthetic-cron-secret", "Basic synthetic-cron-secret", "Bearer ordinary-user-token"])("rejects unauthorized requests without reading or deleting data (%s)", async authorization => {
    expect((await GET(request(authorization))).status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("runs only the fixed retention policy after authentication and supports dry-run", async () => {
    const response = await GET(request("Bearer synthetic-cron-secret", "?days=0&ownerEmail=other%40example.test"));
    expect(response.status).toBe(200);
    expect(cleanup).toHaveBeenCalledWith({ dryRun: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    await GET(request("Bearer synthetic-cron-secret", "?dryRun=1"));
    expect(cleanup).toHaveBeenLastCalledWith({ dryRun: true });
  });
  it("never exposes private provider errors in responses or logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    cleanup.mockRejectedValue(new Error("Sensitive internal path and document content"));
    const response = await GET(request("Bearer synthetic-cron-secret"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Sensitive");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Sensitive");
  });
  it("has a daily deployment schedule", () => {
    expect(schedule.crons).toContainEqual({ path: "/api/cron/mailbox-retention", schedule: "15 2 * * *" });
  });
});
