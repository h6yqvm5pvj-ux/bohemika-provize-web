import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const verify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/activeAppSession", () => ({ verifyActiveAppSession: verify }));
import { proxy } from "@/proxy";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("public email action page privacy", () => {
  it.each(["0", "1"])("loads without a session and prevents caching, indexing and referrer leakage with strict CSP %s", async (strict) => {
    vi.stubEnv("CSP_STRICT_ENFORCE", strict);
    const response = await proxy(new NextRequest("https://bohemka.app/ucet/akce?mode=verifyEmail&oobCode=synthetic"));
    expect(verify).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
