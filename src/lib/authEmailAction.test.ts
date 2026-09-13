import { describe, expect, it } from "vitest";
import { AUTH_EMAIL_ACTION_PATH, createAuthEmailActionUrl, parseAuthEmailAction } from "./authEmailAction";

describe("email action link boundary", () => {
  it.each(["verifyEmail", "resetPassword"] as const)("keeps %s codes out of HTTP URLs and roundtrips them", (mode) => {
    const action = { mode, code: "synthetic_one-time-code" };
    const url = new URL(createAuthEmailActionUrl(action));
    expect(url.origin + url.pathname).toBe("https://bohemka.app" + AUTH_EMAIL_ACTION_PATH);
    expect(url.search).toBe("");
    expect(parseAuthEmailAction(url.search, url.hash)).toEqual(action);
  });
  it("accepts Firebase query format but does not trust a supplied project or redirect", () => {
    expect(parseAuthEmailAction("?mode=verifyEmail&oobCode=synthetic&apiKey=foreign&continueUrl=https://outside.example.test", "")).toEqual({ mode: "verifyEmail", code: "synthetic" });
  });
  it.each([
    ["", ""], ["?mode=recoverEmail&oobCode=synthetic", ""],
    ["?mode=verifyEmail&mode=resetPassword&oobCode=synthetic", ""],
    ["?mode=verifyEmail&oobCode=first&oobCode=second", ""],
    ["?mode=verifyEmail&oobCode=first", "#mode=resetPassword&oobCode=second"],
    ["", "#mode=verifyEmail&oobCode="], ["", "#mode=verifyEmail&oobCode=with%0Anewline"],
    ["", "#mode=verifyEmail&oobCode=" + "x".repeat(2049)],
  ])("rejects ambiguous or malformed parameters", (search, hash) => {
    expect(parseAuthEmailAction(search, hash)).toBeNull();
  });
});
