import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/activeAppSession", () => ({
  verifyActiveAppSession: vi.fn(),
}));

import { proxy } from "./proxy";

describe("sandboxed VIG renderer resources", () => {
  it.each(["bootstrap.js", "viewer.js"])(
    "allows the opaque iframe origin to load %s",
    async (filename) => {
      const response = await proxy(new NextRequest(`https://bohemka.app/models/vig/${filename}`));
      expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    },
  );

  it.each([
    "/models/vig/index.html?embed=1",
    "/models/vig/other.js",
    "/models/vig/viewer.js/other",
    "/api/online-card/meeting-request",
  ])("does not extend the script exception to %s", async (path) => {
    const response = await proxy(new NextRequest(`https://bohemka.app${path}`));
    expect(response.headers.get("Cross-Origin-Resource-Policy")).not.toBe("cross-origin");
  });

  it("keeps the viewer restricted to same-origin embedding and external scripts", async () => {
    const response = await proxy(new NextRequest("https://bohemka.app/models/vig/index.html?embed=1"));
    const directives = response.headers.get("Content-Security-Policy")!.split("; ");
    expect(directives).toContain("frame-ancestors 'self'");
    expect(directives.find((directive) => directive.startsWith("script-src "))).not.toContain("'unsafe-inline'");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
