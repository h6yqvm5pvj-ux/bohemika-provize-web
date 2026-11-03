import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeLoginTransition, requestLoginTransition } from "./loginTransition";

afterEach(() => {
  consumeLoginTransition();
  vi.useRealTimers();
});

describe("login animation handoff", () => {
  it("plays only once after an explicit request", () => {
    expect(consumeLoginTransition()).toBe(false);
    requestLoginTransition();
    expect(consumeLoginTransition()).toBe(true);
    expect(consumeLoginTransition()).toBe(false);
  });

  it("discards stale requests rather than playing on a later unrelated visit", () => {
    vi.useFakeTimers();
    requestLoginTransition();
    vi.advanceTimersByTime(30_000);
    expect(consumeLoginTransition()).toBe(false);
  });
});
