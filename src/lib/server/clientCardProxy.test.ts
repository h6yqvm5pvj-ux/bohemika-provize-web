import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/server/activeAppSession", () => ({ verifyActiveAppSession: verify }));

import { proxy } from "@/proxy";
import { APP_SESSION_COOKIE_NAME } from "@/lib/appSession";
import { clientCardHrefForName, contractReturnHrefFromClientCard } from "@/app/_klienti/clientAccess";

const href = clientCardHrefForName("Žofie Nováková", {
  ownerEmail: "advisor+team@example.test", entryId: "contract-2026", fromList: true,
})!;
const request = (path = href, userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1") =>
  new NextRequest(`https://bohemka.app${path}`, {
    headers: { "user-agent": userAgent, cookie: `${APP_SESSION_COOKIE_NAME}=test-session` },
  });

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ENABLE_CLIENTS_PAGE", undefined);
  vi.stubEnv("NEXT_PUBLIC_ENABLE_CLIENTS_PAGE", undefined);
  verify.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("production client card navigation", () => {
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
  ])("opens the enabled client card for an authenticated browser: %s", async (userAgent) => {
    const req = request(href, userAgent);
    const response = await proxy(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(verify).toHaveBeenCalledWith("test-session");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(contractReturnHrefFromClientCard(req.nextUrl.searchParams))
      .toBe("/smlouvy/advisor%2Bteam%40example.test___contract-2026?from=list");
  });

  it("uses the same enabled feature for the directory and card despite obsolete environment flags", async () => {
    vi.stubEnv("ENABLE_CLIENTS_PAGE", "0");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CLIENTS_PAGE", "0");
    for (const path of ["/klienti", "/klienti/", href]) {
      expect((await proxy(request(path))).status).toBe(200);
    }
  });

  it("still requires authentication and preserves the client and contract return context through login", async () => {
    verify.mockResolvedValue({ ok: false, reason: "invalid" });
    const response = await proxy(request());
    expect(response.status).toBe(307);
    const login = new URL(response.headers.get("location")!);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe(href);
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("does not open private cards when session verification is unavailable", async () => {
    verify.mockResolvedValue({ ok: false, reason: "unavailable" });
    expect((await proxy(request())).status).toBe(503);
  });
});
