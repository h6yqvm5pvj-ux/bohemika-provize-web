"use client";

import { CircleHelp } from "lucide-react";
import { isSentMailboxItem } from "./postaHelpers";
import { MAILBOX_SUPPORT_RECIPIENT } from "./mailboxSupport";
import type { MailboxItem, RecipientOption } from "./postaTypes";

export function MailboxSupportCard({ messages, unreadCount, selected, onOpen }: {
  messages: MailboxItem[];
  unreadCount: number;
  selected: boolean;
  onOpen: (recipient: RecipientOption) => void;
}) {
  const latest = messages.reduce<MailboxItem | null>((current, item) =>
    !current || (item.createdAtMs ?? 0) > (current.createdAtMs ?? 0) ? item : current, null);
  const text = latest && (typeof latest.metadata?.messageText === "string" ? latest.metadata.messageText : latest.body);

  return (
    <button
      type="button"
      onClick={() => onOpen(MAILBOX_SUPPORT_RECIPIENT)}
      aria-label="Otevřít chat Podpora"
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 border-b border-violet-100 px-4 py-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet-600 ${
        selected ? "bg-violet-100 shadow-[inset_4px_0_0_#6d28d9]" : "bg-violet-50/60 hover:bg-violet-100/70"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 ring-1 ring-violet-200">
        <CircleHelp className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-slate-900">Podpora</span>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-violet-700 px-1.5 py-0.5 text-[10px] font-bold text-white" aria-label={`${unreadCount} nepřečtených zpráv`}>{unreadCount}</span>
          ) : <span className="text-[10px] font-semibold text-violet-600">Jsme tu pro tebe</span>}
        </span>
        <span className="mt-1 block truncate text-xs leading-5 text-slate-500">
          {text ? `${latest && isSentMailboxItem(latest) ? "Ty: " : ""}${text}` : "Napiš nám, s čím potřebuješ pomoct."}
        </span>
      </span>
    </button>
  );
}
