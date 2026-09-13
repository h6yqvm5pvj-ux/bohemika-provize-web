import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSafeLoginNextPath } from "./authSession";

const origin = "https://application.example.test";
function location(search: string, appOrigin = origin) {
  vi.stubGlobal("window", { location: { origin: appOrigin, search } });
}
function next(value: string) {
  location(`?${new URLSearchParams({ next: value })}`);
}
afterEach(() => vi.unstubAllGlobals());

describe("safe post-login destinations", () => {
  it.each([
    ["/", "/"],
    ["/smlouvy", "/smlouvy"],
    ["/smlouvy/synthetic-id?embedded=1&tab=notes#detail", "/smlouvy/synthetic-id?embedded=1&tab=notes#detail"],
    ["  /pomucky  ", "/pomucky"],
    ["/pomucky/../smlouvy", "/smlouvy"],
    ["/smlouvy?query=Nov%C3%A1k%20Jan", "/smlouvy?query=Nov%C3%A1k%20Jan"],
    ["/smlouvy?query=https%3A%2F%2Foutside.example.test", "/smlouvy?query=https%3A%2F%2Foutside.example.test"],
    ["/pomucky#poznámky", "/pomucky#pozn%C3%A1mky"],
  ])("preserves an internal destination %j as %j", (input, expected) => {
    next(input);
    const result = resolveSafeLoginNextPath();
    expect(result).toBe(expected);
    // This is the URL normalization used by the installed Next client router.
    expect(new URL(result, `${origin}/login`).origin).toBe(origin);
  });

  it.each([
    "https://outside.example.test",
    "http://outside.example.test",
    "https://application.example.test.outside.example.test",
    "https://application.example.test@outside.example.test",
    "//outside.example.test",
    "///outside.example.test",
    "/\\outside.example.test",
    "\\\\outside.example.test",
    "/\t/outside.example.test",
    "/\n/outside.example.test",
    "/\r/outside.example.test",
    "/\u0000/outside.example.test",
    "/smlouvy\u007f",
    "javascript:alert(1)",
    "data:text/html,synthetic",
    "smlouvy",
    "/safe/..//outside.example.test",
    "/%2e%2e//outside.example.test",
    "/%5coutside.example.test",
    "/%2foutside.example.test",
    "/%09/outside.example.test",
    "/smlouvy/%zz",
    "/login",
    "/login?next=/smlouvy",
    "/login#fragment",
    "/login/",
    "/smlouvy/../login",
    "/%6cogin",
  ])("rejects unsafe or looping destination %j", (input) => {
    next(input);
    const result = resolveSafeLoginNextPath("/pomucky");
    expect(result).toBe("/pomucky");
    expect(new URL(result, `${origin}/login`).origin).toBe(origin);
  });

  it.each([
    "?next=%2F%5Coutside.example.test",
    "?next=%2F%09%2Foutside.example.test",
    "?next=%2F%250a%2Foutside.example.test",
    "?next=%2Fsafe%2F..%2F%2Foutside.example.test",
  ])("blocks encoded malicious login links %s", (search) => {
    location(search);
    expect(resolveSafeLoginNextPath()).toBe("/");
  });

  it.each(["", "?next=", "?next=%20%20"])('uses a normalized internal fallback when next is absent or empty (%s)', (search) => {
    location(search);
    expect(resolveSafeLoginNextPath("/pomucky/../smlouvy?tab=mine#list")).toBe("/smlouvy?tab=mine#list");
  });

  it.each(["//outside.example.test", "/safe/..//outside.example.test", "/\\outside.example.test", "/login"])(
    "does not trust an unsafe fallback %j", (fallback) => {
      location("");
      expect(resolveSafeLoginNextPath(fallback)).toBe("/");
    },
  );

  it("keeps the browser's actual scheme, hostname and port for local deployments", () => {
    const localOrigin = "http://127.0.0.1:3300";
    location("?next=%2Fsmlouvy%3Fembedded%3D1", localOrigin);
    expect(new URL(resolveSafeLoginNextPath(), `${localOrigin}/login`).origin).toBe(localOrigin);
  });

  it("validates the fallback during server rendering too", () => {
    vi.stubGlobal("window", undefined);
    expect(resolveSafeLoginNextPath("/smlouvy")).toBe("/smlouvy");
    expect(resolveSafeLoginNextPath("/\\outside.example.test")).toBe("/");
  });

  it("returns the root if the browser location cannot be read", () => {
    vi.stubGlobal("window", { get location() { throw new Error("Synthetic location error"); } });
    expect(resolveSafeLoginNextPath()).toBe("/");
  });
});
