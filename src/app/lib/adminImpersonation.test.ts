import { describe, expect, it } from "vitest";

import {
  ADMIN_IMPERSONATION_HEADER,
  shouldImpersonateApiRequest,
  withDefaultAdminImpersonationHeader,
} from "./adminImpersonation";

describe("shouldImpersonateApiRequest", () => {
  it.each([
    ["/api/mailbox/compose", "POST"],
    ["/api/mailbox/activity", "GET"],
    ["/api/mailbox/activity", "POST"],
    ["/api/mailbox/conversation", "GET"],
    ["/api/mailbox/conversation", "PATCH"],
    ["/api/mailbox/message", "POST"],
    ["/api/mailbox/message", "PATCH"],
    ["/api/mailbox/message", "DELETE"],
    ["/api/mailbox/stream", "GET"],
    ["/api/export-produkce/share", "POST"],
    ["/api/plan-produkce/share", "POST"],
    ["/api/team-message", "POST"],
    ["/api/online-card/office-photo", "POST"],
    ["/api/online-card/analytics", "GET"],
    ["/api/intranet/wall/post-1/comments", "POST"],
    ["/api/commission-statements", "GET"],
    ["/api/tool-usage", "GET"],
    ["/api/tool-usage", "POST"],
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

describe("withDefaultAdminImpersonationHeader", () => {
  it("adds the current represented user when the request has no fixed scope", () => {
    const headers = withDefaultAdminImpersonationHeader(
      { Accept: "application/json" },
      "petra.janackova@bohemika.eu"
    );

    expect(headers.get(ADMIN_IMPERSONATION_HEADER)).toBe(
      "petra.janackova@bohemika.eu"
    );
  });

  it("keeps an explicitly captured request scope", () => {
    const headers = withDefaultAdminImpersonationHeader(
      { [ADMIN_IMPERSONATION_HEADER]: "jakub.pokorny@bohemika.eu" },
      "petra.janackova@bohemika.eu"
    );

    expect(headers.get(ADMIN_IMPERSONATION_HEADER)).toBe(
      "jakub.pokorny@bohemika.eu"
    );
  });
});
