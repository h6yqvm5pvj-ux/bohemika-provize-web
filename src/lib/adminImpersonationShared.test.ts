import { describe, expect, it } from "vitest";

import {
  hasImpersonationHeaderValue,
  normalizeImpersonationEmail,
  shouldRejectUnsupportedImpersonation,
} from "./adminImpersonationShared";

describe("admin impersonation header parsing", () => {
  it("normalizes a valid target email", () => {
    expect(normalizeImpersonationEmail(" Petra.Janackova@Bohemika.eu ")).toBe(
      "petra.janackova@bohemika.eu"
    );
  });

  it("distinguishes an absent header from a malformed non-empty header", () => {
    expect(hasImpersonationHeaderValue(null)).toBe(false);
    expect(hasImpersonationHeaderValue("   ")).toBe(false);
    expect(hasImpersonationHeaderValue("not-an-email")).toBe(true);
    expect(normalizeImpersonationEmail("not-an-email")).toBe("");
  });

  it("fails closed when a guarded endpoint did not opt into impersonation", () => {
    expect(
      shouldRejectUnsupportedImpersonation("petra.janackova@bohemika.eu", undefined)
    ).toBe(true);
    expect(
      shouldRejectUnsupportedImpersonation("petra.janackova@bohemika.eu", false)
    ).toBe(true);
    expect(
      shouldRejectUnsupportedImpersonation("petra.janackova@bohemika.eu", true)
    ).toBe(false);
    expect(shouldRejectUnsupportedImpersonation(null, undefined)).toBe(false);
  });
});
