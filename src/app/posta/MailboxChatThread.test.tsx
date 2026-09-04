import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MailboxChatThread } from "./MailboxChatThread";
import type { MailboxItem } from "./postaTypes";

const message = (
  id: string,
  createdAtMs: number,
  direction: "received" | "sent",
  text: string,
  recipientReadAtMs?: number
): MailboxItem => ({
  id,
  type: "direct_message",
  title: "Smlouvy DPS",
  body: text,
  deepLink: "/posta",
  read: true,
  createdAtMs,
  readAtMs: createdAtMs,
  metadata: {
    mailboxDirection: direction,
    senderName: direction === "sent" ? "Jakub Rauscher" : "Stanislava Součková",
    senderEmail: direction === "sent" ? "jakub@example.cz" : "stanislava@example.cz",
    recipientName: direction === "sent" ? "Stanislava Součková" : "Jakub Rauscher",
    recipientEmail: direction === "sent" ? "stanislava@example.cz" : "jakub@example.cz",
    messageText: text,
    ...(recipientReadAtMs ? { recipientReadAtMs } : {}),
  },
});

describe("MailboxChatThread", () => {
  it("renders received and sent messages chronologically as a chat", () => {
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[
          message("received", 1_000, "received", "První zpráva"),
          message("sent", 2_000, "sent", "Druhá zpráva"),
        ]}
      />
    );

    expect(html.indexOf("První zpráva")).toBeLessThan(html.indexOf("Druhá zpráva"));
    expect(html).toContain("Odesláno");
  });

  it("shows when the recipient viewed a sent message", () => {
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[message("seen", 1_000, "sent", "Zobrazená zpráva", 2_000)]}
      />
    );

    expect(html).toContain("Zobrazeno");
    expect(html).not.toContain(">Odesláno<");
  });
});
