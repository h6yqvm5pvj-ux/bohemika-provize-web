import { afterEach, describe, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/passwordChangeEmail", () => ({ retryPasswordChangedNotices: run }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("password notification retry authorization", () => {
  it("denies absent configuration even outside production", async () => {
    vi.stubEnv("CRON_SECRET", ""); const response = await GET(new Request("https://bohemka.app/api/cron/password-change-notices"));
    expect(response.status).toBe(401); expect(run).not.toHaveBeenCalled();
  });
  it("denies invalid credentials and only runs with the configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "synthetic-cron-secret"); run.mockResolvedValue({ checked: 1, sent: 1 });
    expect((await GET(new Request("https://bohemka.app/api/cron/password-change-notices", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    const response = await GET(new Request("https://bohemka.app/api/cron/password-change-notices", { headers: { authorization: "Bearer synthetic-cron-secret" } }));
    expect(await response.json()).toEqual({ ok: true, checked: 1, sent: 1 }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
