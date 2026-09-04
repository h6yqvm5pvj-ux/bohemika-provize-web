import { describe, expect, it } from "vitest";

import {
  mailboxConversationId,
  mailboxConversationParticipantId,
} from "./mailboxConversation";

describe("mailboxConversationId", () => {
  it("returns the same opaque id regardless of participant order", () => {
    expect(mailboxConversationId("Jakub@Example.cz", " eva@example.cz ")).toBe(
      mailboxConversationId("eva@example.cz", "jakub@example.cz")
    );
    expect(mailboxConversationId("Jakub@Example.cz", "eva@example.cz")).toMatch(
      /^dm_[A-Za-z0-9_-]{32}$/
    );
  });

  it("rejects missing or identical participants", () => {
    expect(() => mailboxConversationId("", "eva@example.cz")).toThrow();
    expect(() => mailboxConversationId("eva@example.cz", "EVA@example.cz")).toThrow();
  });
});

describe("mailboxConversationParticipantId", () => {
  it("normalizes email before hashing", () => {
    expect(mailboxConversationParticipantId(" Eva@Example.cz ")).toBe(
      mailboxConversationParticipantId("eva@example.cz")
    );
  });
});
