import { describe, expect, it } from "vitest";

import { formatMailboxPresence } from "./postaPresence";

describe("formatMailboxPresence", () => {
  const nowMs = 2_000_000_000_000;

  it("prioritizes typing state", () => {
    expect(formatMailboxPresence({ lastActiveAtMs: null, nowMs, typing: true })).toEqual({
      label: "Píše…",
      online: true,
      typing: true,
    });
  });

  it("shows recent users as active", () => {
    expect(formatMailboxPresence({ lastActiveAtMs: nowMs - 9 * 60_000, nowMs }).online).toBe(true);
  });

  it("formats older activity", () => {
    expect(formatMailboxPresence({ lastActiveAtMs: nowMs - 42 * 60_000, nowMs }).label).toBe(
      "Aktivní před 42 min"
    );
  });
});
