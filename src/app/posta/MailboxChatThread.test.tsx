import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MailboxChatThread } from "./MailboxChatThread";
import type { MailboxItem } from "./postaTypes";

const message = (
  id: string,
  createdAtMs: number,
  direction: "received" | "sent",
  text: string,
  recipientReadAtMs?: number,
  deliveredAtMs?: number
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
    ...(deliveredAtMs ? { deliveredAtMs } : {}),
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

    expect(html).toContain("Přečteno");
    expect(html).not.toContain(">Odesláno<");
  });

  it("distinguishes delivered messages from legacy sent messages", () => {
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[message("delivered", 1_000, "sent", "Doručená zpráva", undefined, 1_500)]}
      />
    );

    expect(html).toContain("Doručeno");
    expect(html).not.toContain(">Odesláno<");
  });

  it("shows one Czech day separator per calendar day", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[
          message("yesterday", yesterday.getTime(), "received", "Včerejší zpráva"),
          message("today-1", today.getTime(), "sent", "Dnešní zpráva"),
          message("today-2", today.getTime() + 60_000, "received", "Další dnešní zpráva"),
        ]}
      />
    );

    expect(html.match(/>Včera</g)).toHaveLength(1);
    expect(html.match(/>Dnes</g)).toHaveLength(1);
  });

  it("offers retry for a failed outgoing message", () => {
    const failed = {
      ...message("failed", Date.now(), "sent", "Neodeslaná zpráva"),
      clientDeliveryStatus: "failed" as const,
      clientDeliveryError: "Síť není dostupná.",
    };
    const html = renderToStaticMarkup(
      <MailboxChatThread messages={[failed]} onRetryMessage={() => undefined} />
    );

    expect(html).toContain("Nepodařilo se odeslat");
    expect(html).toContain("Zkusit znovu");
  });

  it("renders synchronized emoji reactions and marks the current user's reaction", () => {
    const reacted = message("reaction", Date.now(), "received", "Reakce");
    reacted.metadata = {
      ...reacted.metadata,
      reactions: [
        {
          emoji: "👍",
          userEmails: ["jakub@example.cz", "stanislava@example.cz"],
        },
      ],
    };
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[reacted]}
        currentUserEmail="jakub@example.cz"
        reactionEmojis={["👍", "❤️"]}
        onToggleReaction={async () => undefined}
      />
    );

    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain(">2</span>");
    expect(html).toContain("Přidat reakci");
  });

  it("offers message actions only for a persisted sent message", () => {
    const sentHtml = renderToStaticMarkup(
      <MailboxChatThread
        messages={[message("own", Date.now(), "sent", "Moje zpráva")]}
        onEditMessage={async () => undefined}
        onDeleteMessage={async () => undefined}
      />
    );
    const receivedHtml = renderToStaticMarkup(
      <MailboxChatThread
        messages={[message("foreign", Date.now(), "received", "Cizí zpráva")]}
        onEditMessage={async () => undefined}
        onDeleteMessage={async () => undefined}
      />
    );

    expect(sentHtml).toContain("Další akce se zprávou");
    expect(receivedHtml).not.toContain("Další akce se zprávou");
  });

  it("renders image thumbnails and PDF preview actions", () => {
    const withAttachments = message("attachments", Date.now(), "sent", "Přílohy");
    withAttachments.metadata = {
      ...withAttachments.metadata,
      attachments: [
        {
          id: "image",
          name: "foto.png",
          url: "https://example.com/foto.png",
          contentType: "image/png",
          sizeBytes: 1_024,
        },
        {
          id: "pdf",
          name: "smlouva.pdf",
          url: "https://example.com/smlouva.pdf",
          contentType: "application/pdf",
          sizeBytes: 2_048,
        },
      ],
    };
    const html = renderToStaticMarkup(<MailboxChatThread messages={[withAttachments]} />);

    expect(html).toContain("Zobrazit obrázek foto.png");
    expect(html).toContain("Zobrazit náhled souboru smlouva.pdf");
  });

  it("offers older history and keeps authenticated attachments lazy", () => {
    const lazy = message("lazy", Date.now(), "received", "Starší zpráva");
    lazy.metadata = {
      ...lazy.metadata,
      attachments: [
        {
          id: "private-image",
          name: "interni.png",
          url: "/api/mailbox/attachment?messageId=lazy&attachmentId=private-image",
          contentType: "image/png",
          sizeBytes: 4_096,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[lazy]}
        hasOlderMessages
        onLoadOlderMessages={async () => undefined}
        onLoadAttachment={async () => "blob:private-image"}
      />
    );

    expect(html).toContain("Načíst starší zprávy");
    expect(html).toContain("Načíst přílohu interni.png");
    expect(html).not.toContain("src=\"/api/mailbox/attachment");
  });

  it("shows pinned messages and reply reminders", () => {
    const important = {
      ...message("important", Date.now(), "sent", "Ozvi se klientovi"),
      pinnedAtMs: Date.now(),
      replyReminderAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000,
    };
    const html = renderToStaticMarkup(
      <MailboxChatThread
        messages={[important]}
        onTogglePin={async () => undefined}
        onSetReminder={async () => undefined}
      />
    );

    expect(html).toContain("Připnuté zprávy");
    expect(html).toContain("Připnuto");
    expect(html).toContain("Připomenout");
    expect(html).toContain("Další akce se zprávou");
  });

  it("renders a group title, sender and aggregate read state", () => {
    const group = message("group", Date.now(), "received", "Aktualizace");
    group.metadata = {
      ...group.metadata,
      conversationId: "group_1234567890",
      groupConversation: true,
      groupName: "Tým hypotéky",
      senderName: "Petra Nováková",
      senderEmail: "petra@example.cz",
      participantEmails: ["petra@example.cz", "jakub@example.cz", "jan@example.cz"],
      participants: [
        { email: "petra@example.cz", name: "Petra Nováková" },
        { email: "jakub@example.cz", name: "Jakub Rauscher" },
        { email: "jan@example.cz", name: "Jan Novák" },
      ],
    };
    const html = renderToStaticMarkup(
      <MailboxChatThread messages={[group]} showHeader />
    );

    expect(html).toContain("Tým hypotéky");
    expect(html).toContain("3 účastníků");
    expect(html).toContain("Petra Nováková");
  });
});
