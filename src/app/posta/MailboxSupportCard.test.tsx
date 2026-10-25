// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxSupportCard } from "./MailboxSupportCard";
import { isMailboxSupportConversation, MAILBOX_SUPPORT_RECIPIENT } from "./mailboxSupport";
import type { MailboxItem } from "./postaTypes";

const message = (metadata: MailboxItem["metadata"] = {}): MailboxItem => ({
  id: "message", type: "direct_message", title: "Zpráva", body: "Odpověď podpory",
  deepLink: "/posta", read: false, createdAtMs: 1000, readAtMs: null,
  metadata: { senderEmail: MAILBOX_SUPPORT_RECIPIENT.email, recipientEmail: "advisor@example.test", ...metadata },
});

describe("support chat entry", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

  it("opens the canonical support recipient from an empty mailbox without creating a fake message", async () => {
    const open = vi.fn();
    await act(async () => root.render(<MailboxSupportCard messages={[]} unreadCount={0} selected={false} onOpen={open} />));
    expect(container.textContent).toContain("Podpora");
    expect(container.textContent).toContain("Napiš nám");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(open).not.toHaveBeenCalled();
    await act(async () => container.querySelector("button")!.click());
    expect(open).toHaveBeenCalledExactlyOnceWith(MAILBOX_SUPPORT_RECIPIENT);
  });

  it("keeps the latest reply and unread count when reopening an existing conversation", async () => {
    const messages = [message({ messageText: "Starší odpověď" }), { ...message({ messageText: "Novější odpověď" }), id: "new", createdAtMs: 2000 }];
    await act(async () => root.render(<MailboxSupportCard messages={messages} unreadCount={2} selected onOpen={() => {}} />));
    expect(container.textContent).toContain("Novější odpověď");
    expect(container.textContent).not.toContain("Starší odpověď");
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[aria-label="2 nepřečtených zpráv"]')).not.toBeNull();
  });

  it("recognizes only direct support counterparts and keeps the operator's customer conversations distinct", () => {
    expect(isMailboxSupportConversation(message())).toBe(true);
    expect(isMailboxSupportConversation(message({ mailboxDirection: "sent", senderEmail: "advisor@example.test", recipientEmail: MAILBOX_SUPPORT_RECIPIENT.email }))).toBe(true);
    expect(isMailboxSupportConversation(message({ mailboxDirection: "received", senderEmail: "advisor@example.test", recipientEmail: MAILBOX_SUPPORT_RECIPIENT.email }))).toBe(false);
    expect(isMailboxSupportConversation(message({ groupConversation: true }))).toBe(false);
    expect(isMailboxSupportConversation(message({ tipsterTip: true }))).toBe(false);
    expect(isMailboxSupportConversation({ ...message(), title: "Nový tip - pojištění" })).toBe(false);
    expect(isMailboxSupportConversation(message({ senderEmail: "fake@example.test", senderName: "Podpora" }))).toBe(false);
  });
});
