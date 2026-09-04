"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  ImageIcon,
  Loader2,
} from "lucide-react";

import {
  formatDateTime,
  formatFileSize,
  isSentMailboxItem,
  nameFromEmail,
  normalizeEmail,
  parseMailboxAttachments,
} from "./postaHelpers";
import type { MailboxItem } from "./postaTypes";

const metadataText = (item: MailboxItem, key: string): string => {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
};

const metadataMillis = (item: MailboxItem, key: string): number | null => {
  const value = item.metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return null;
};

const counterpartForMessage = (item: MailboxItem) => {
  const sent = isSentMailboxItem(item);
  const email = normalizeEmail(
    sent ? item.metadata?.recipientEmail : item.metadata?.senderEmail
  );
  const storedName = metadataText(item, sent ? "recipientName" : "senderName");
  return {
    email,
    name: storedName || (email ? nameFromEmail(email) : "Uživatel"),
  };
};

const isImageAttachment = (name: string, contentType: string) =>
  contentType.toLowerCase().startsWith("image/") ||
  /\.(avif|gif|jpe?g|png|webp)$/i.test(name);

export function MailboxChatThread({
  messages,
  showHeader = false,
  firstUnreadMessageId = null,
  presenceLabel,
  online = false,
  typing = false,
}: {
  messages: MailboxItem[];
  showHeader?: boolean;
  firstUnreadMessageId?: string | null;
  presenceLabel?: string;
  online?: boolean;
  typing?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrolledUnreadMarkerRef = useRef<string | null>(null);
  const latest = messages[messages.length - 1] ?? null;
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const scrollContainer = rootRef.current?.parentElement;
      const unreadMarker = rootRef.current?.querySelector<HTMLElement>("[data-unread-marker]");
      if (
        firstUnreadMessageId &&
        unreadMarker &&
        scrolledUnreadMarkerRef.current !== firstUnreadMessageId
      ) {
        scrolledUnreadMarkerRef.current = firstUnreadMessageId;
        unreadMarker.scrollIntoView({ block: "center" });
      } else if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [firstUnreadMessageId, messages.length, typing]);
  if (!latest) return null;
  const counterpart = counterpartForMessage(latest);

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      {showHeader ? (
        <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-5">
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white shadow-inner ring-1 ring-slate-200">
            <Image
              src="/icons/klient.webp"
              alt="Ikona uživatele"
              fill
              sizes="48px"
              className="object-cover"
            />
            <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-slate-950">{counterpart.name}</h2>
            <p className="truncate text-xs text-slate-500">{counterpart.email}</p>
            <p className={`mt-1 text-[11px] font-semibold ${online ? "text-emerald-700" : "text-slate-500"}`}>
              {presenceLabel || `${messages.length} ${messages.length === 1 ? "zpráva" : messages.length < 5 ? "zprávy" : "zpráv"}`}
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {messages.map((message, index) => {
          const sent = isSentMailboxItem(message);
          const text = metadataText(message, "messageText") || message.body.trim() || "Bez textu.";
          const attachments = parseMailboxAttachments(message);
          const recipientReadAtMs = sent
            ? metadataMillis(message, "recipientReadAtMs")
            : null;

          return (
            <div key={message.id}>
              {message.id === firstUnreadMessageId ? (
                <div data-unread-marker className="my-5 flex items-center gap-3" role="separator" aria-label="Nové zprávy">
                  <span className="h-px flex-1 bg-violet-200" />
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">Nové zprávy</span>
                  <span className="h-px flex-1 bg-violet-200" />
                </div>
              ) : null}
              <div className={`flex ${sent ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[86%] flex-col sm:max-w-[78%] ${sent ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-[20px] px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.07)] ${
                      sent
                        ? "rounded-br-md bg-[linear-gradient(135deg,#312060_0%,#6d28d9_58%,#7c3aed_100%)] text-[#fff]"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                  {index === 0 && message.title ? (
                    <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${sent ? "text-violet-100" : "text-violet-700"}`}>
                      {message.title}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 sm:text-[15px]">
                    {text}
                  </p>

                  {attachments.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {attachments.map((file) => {
                        const ready = !file.url.startsWith("/api/");
                        const image = isImageAttachment(file.name, file.contentType);
                        const attachmentClass = `flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                          sent
                            ? "border-white/20 bg-white/10 text-white hover:bg-white/15"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                        }`;
                        const attachmentContent = (
                          <>
                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sent ? "bg-white/15 text-white" : image ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                              {image ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold">{file.name}</span>
                              <span className={`block text-[10px] ${sent ? "text-violet-100" : "text-slate-500"}`}>
                                {ready ? formatFileSize(file.sizeBytes) : "Načítám přílohu…"}
                              </span>
                            </span>
                            {ready ? <Download className="h-3.5 w-3.5 shrink-0 opacity-75" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-75" />}
                          </>
                        );
                        return ready ? (
                          <a key={file.id} href={file.url} target="_blank" rel="noreferrer noopener" className={attachmentClass}>
                            {attachmentContent}
                          </a>
                        ) : (
                          <div key={file.id} className={`${attachmentClass} opacity-75`}>
                            {attachmentContent}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  </div>

                  <div className={`mt-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium ${sent ? "justify-end text-slate-500" : "text-slate-400"}`}>
                  <span>{formatDateTime(message.createdAtMs)}</span>
                  {sent ? (
                    recipientReadAtMs ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-violet-700" title={`Zobrazeno ${formatDateTime(recipientReadAtMs)}`}>
                        <CheckCheck className="h-3.5 w-3.5" />
                        Zobrazeno {formatDateTime(recipientReadAtMs)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Check className="h-3.5 w-3.5" />
                        Odesláno
                      </span>
                    )
                  ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {typing ? (
          <div className="flex justify-start" aria-label="Uživatel píše">
            <div className="flex items-center gap-1 rounded-[18px] rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.07)]">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-2 w-2 animate-bounce rounded-full bg-violet-500"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="h-2" aria-hidden="true" />
    </div>
  );
}
