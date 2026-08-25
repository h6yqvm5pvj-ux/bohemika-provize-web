import { describe, expect, it } from "vitest";

import { shouldImpersonateApiRequest } from "./adminImpersonation";

describe("shouldImpersonateApiRequest", () => {
  it.each([
    ["/api/mailbox/compose", "POST"],
    ["/api/export-produkce/share", "POST"],
    ["/api/plan-produkce/share", "POST"],
    ["/api/team-message", "POST"],
    ["/api/online-card/office-photo", "POST"],
    ["/api/online-card/analytics", "GET"],
    ["/api/intranet/wall/post-1/comments", "POST"],
  ])("scopes %s %s to the represented user", (pathname, method) => {
    expect(shouldImpersonateApiRequest(pathname, method)).toBe(true);
  });

  it.each([
    ["/api/user/profile", "GET", true],
    ["/api/user/profile", "PATCH", false],
    ["/api/mailbox", "GET", true],
    ["/api/mailbox", "PATCH", true],
    ["/api/mailbox", "POST", false],
    ["/api/auth/sessions", "GET", false],
    ["/api/push/token", "POST", false],
  ])("applies the intended policy to %s %s", (pathname, method, expected) => {
    expect(shouldImpersonateApiRequest(pathname, method)).toBe(expected);
  });
});
