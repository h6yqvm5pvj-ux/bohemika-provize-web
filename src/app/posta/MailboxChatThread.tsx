"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  CheckCheck,
  Bell,
  BellOff,
  CircleAlert,
  Download,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  RotateCcw,
  SmilePlus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import {
  formatDateTime,
  formatFileSize,
  formatMailboxMessageDay,
  formatMailboxMessageTime,
  isSentMailboxItem,
  mailboxMessageDayKey,
  nameFromEmail,
  normalizeEmail,
  parseMailboxAttachments,
  parseMailboxReactions,
} from "./postaHelpers";
import type { MailboxAttachment, MailboxItem } from "./postaTypes";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";

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

const metadataEmails = (item: MailboxItem, key: string): string[] => {
  const value = item.metadata?.[key];
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeEmail).filter(Boolean))];
};

const counterpartForMessage = (item: MailboxItem) => {
  if (item.metadata?.groupConversation === true) {
    const participants = Array.isArray(item.metadata.participants)
      ? item.metadata.participants.length
      : 0;
    return {
      email: participants > 0 ? `${participants} účastníků` : "Skupinový chat",
      name: metadataText(item, "groupName") || "Skupinová konverzace",
      profileAvatar: "",
    };
  }
  const sent = isSentMailboxItem(item);
  const email = normalizeEmail(
    sent ? item.metadata?.recipientEmail : item.metadata?.senderEmail
  );
  const storedName = metadataText(item, sent ? "recipientName" : "senderName");
  return {
    email,
    name: storedName || (email ? nameFromEmail(email) : "Uživatel"),
    profileAvatar: normalizeProfileAvatar(
      item.metadata?.[sent ? "recipientAvatar" : "senderAvatar"]
    ),
  };
};

const isImageAttachment = (name: string, contentType: string) =>
  contentType.toLowerCase().startsWith("image/") ||
  /\.(avif|gif|jpe?g|png|webp)$/i.test(name);

const isPdfAttachment = (name: string, contentType: string) =>
  contentType.toLowerCase() === "application/pdf" || /\.pdf$/i.test(name);

function LazyMailboxAttachment({
  messageId,
  file,
  sent,
  deliveryStatus,
  bareImage = false,
  onLoad,
  onPreview,
}: {
  messageId: string;
  file: MailboxAttachment;
  sent: boolean;
  deliveryStatus: MailboxItem["clientDeliveryStatus"];
  bareImage?: boolean;
  onLoad?: (messageId: string, attachment: MailboxAttachment) => Promise<string>;
  onPreview: (attachment: MailboxAttachment) => void;
}) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState(
    file.url && !file.url.startsWith("/api/") ? file.url : ""
  );
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    resolvedUrl ? "ready" : "idle"
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const loadingPromiseRef = useRef<Promise<string> | null>(null);
  const image = isImageAttachment(file.name, file.contentType);
  const pdf = isPdfAttachment(file.name, file.contentType);

  const ensureLoaded = useCallback(async (): Promise<string> => {
    if (resolvedUrl) return resolvedUrl;
    if (!file.url || !file.url.startsWith("/api/") || !onLoad) return "";
    if (loadingPromiseRef.current) return loadingPromiseRef.current;
    setLoadState("loading");
    const pending = onLoad(messageId, file)
      .then((url) => {
        if (!url) throw new Error("Přílohu se nepodařilo načíst.");
        setResolvedUrl(url);
        setLoadState("ready");
        return url;
      })
      .catch((error) => {
        setLoadState("error");
        throw error;
      })
      .finally(() => {
        loadingPromiseRef.current = null;
      });
    loadingPromiseRef.current = pending;
    return pending;
  }, [file, messageId, onLoad, resolvedUrl]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || resolvedUrl || !file.url.startsWith("/api/") || !onLoad) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void ensureLoaded().catch(() => undefined);
      },
      { rootMargin: "160px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [file.url, onLoad, resolvedUrl, ensureLoaded]);

  const attachmentClass = `flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
    sent
      ? "border-white/20 bg-white/10 text-white hover:bg-white/15"
      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 hover:bg-violet-50"
  }`;
  const pending = deliveryStatus === "sending";
  const failed = deliveryStatus === "failed" || loadState === "error";
  const ready = Boolean(resolvedUrl);

  const openAttachment = async () => {
    try {
      const url = await ensureLoaded();
      if (!url) return;
      const resolved = { ...file, url };
      if (image || pdf) onPreview(resolved);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Chybový stav je zobrazen přímo na kartě a další kliknutí načtení zopakuje.
    }
  };

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => void openAttachment()}
      className={
        ready && image
          ? bareImage
            ? "block w-[min(360px,78vw)] overflow-hidden rounded-2xl text-left"
            : `block w-[min(320px,68vw)] overflow-hidden rounded-xl border text-left transition ${
                sent
                  ? "border-white/20 bg-white/10 hover:bg-white/15"
                  : "border-slate-200 bg-slate-50 hover:border-violet-300"
              }`
          : bareImage && image
            ? "grid aspect-[4/3] w-[min(360px,78vw)] place-items-center overflow-hidden rounded-2xl bg-slate-100 text-slate-500"
          : `${attachmentClass} ${!ready && pending ? "opacity-75" : ""}`
      }
      aria-label={
        ready && image
          ? `Zobrazit obrázek ${file.name}`
          : ready && pdf
            ? `Zobrazit náhled souboru ${file.name}`
            : `${ready ? "Otevřít" : "Načíst"} přílohu ${file.name}`
      }
    >
      {ready && image ? (
        <>
          <span
            className={`relative block w-full ${bareImage ? "bg-transparent" : "h-36 bg-slate-100"}`}
            style={
              bareImage
                ? { aspectRatio: imageAspectRatio ? String(imageAspectRatio) : "4 / 3" }
                : undefined
            }
          >
            <Image
              src={resolvedUrl}
              alt={file.name}
              fill
              unoptimized
              sizes={bareImage ? "min(360px, 78vw)" : "320px"}
              className={bareImage ? "object-contain" : "object-cover"}
              onLoad={(event) => {
                if (!bareImage) return;
                const imageElement = event.currentTarget;
                if (imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0) {
                  setImageAspectRatio(imageElement.naturalWidth / imageElement.naturalHeight);
                }
              }}
            />
          </span>
          {!bareImage ? (
            <span className="flex min-w-0 items-center gap-2 px-2.5 py-2">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{file.name}</span>
              <span className={`shrink-0 text-[10px] ${sent ? "text-violet-100" : "text-slate-500"}`}>
                {formatFileSize(file.sizeBytes)}
              </span>
            </span>
          ) : null}
        </>
      ) : bareImage && image ? (
        failed ? (
          <CircleAlert className="h-5 w-5 text-rose-500" aria-hidden="true" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" aria-hidden="true" />
        )
      ) : (
        <>
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sent ? "bg-white/15 text-white" : image ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
            {image ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{file.name}</span>
            <span className={`block text-[10px] ${sent ? "text-violet-100" : "text-slate-500"}`}>
              {ready
                ? formatFileSize(file.sizeBytes)
                : failed
                  ? "Načtení selhalo · zkusit znovu"
                  : pending
                    ? "Odesílám přílohu…"
                    : loadState === "loading"
                      ? "Načítám přílohu…"
                      : `Načíst · ${formatFileSize(file.sizeBytes)}`}
            </span>
          </span>
          {ready ? (
            pdf ? <Eye className="h-3.5 w-3.5 shrink-0 opacity-75" /> : <Download className="h-3.5 w-3.5 shrink-0 opacity-75" />
          ) : failed ? (
            <CircleAlert className="h-3.5 w-3.5 shrink-0 text-rose-300" />
          ) : loadState === "loading" || pending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-75" />
          ) : (
            <Download className="h-3.5 w-3.5 shrink-0 opacity-75" />
          )}
        </>
      )}
    </button>
  );
}

export function MailboxChatThread({
  messages,
  showHeader = false,
  firstUnreadMessageId = null,
  presenceLabel,
  online = false,
  typing = false,
  onRetryMessage,
  currentUserEmail = "",
  reactionEmojis = [],
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages,
  onLoadAttachment,
  onTogglePin,
  onSetReminder,
}: {
  messages: MailboxItem[];
  showHeader?: boolean;
  firstUnreadMessageId?: string | null;
  presenceLabel?: string;
  online?: boolean;
  typing?: boolean;
  onRetryMessage?: (messageId: string) => void;
  currentUserEmail?: string;
  reactionEmojis?: readonly string[];
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void>;
  onEditMessage?: (messageId: string, text: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => Promise<void>;
  onLoadAttachment?: (messageId: string, attachment: MailboxAttachment) => Promise<string>;
  onTogglePin?: (messageId: string, pinned: boolean) => Promise<void>;
  onSetReminder?: (messageId: string, remindAtMs: number | null) => Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrolledUnreadMarkerRef = useRef<string | null>(null);
  const initializedScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const previousFirstMessageIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const loadingOlderRequestRef = useRef(false);
  const [attachmentPreview, setAttachmentPreview] = useState<MailboxAttachment | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [messageActionBusyId, setMessageActionBusyId] = useState<string | null>(null);
  const [reactionBusyKey, setReactionBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ messageId: string; text: string } | null>(null);
  const latest = messages[messages.length - 1] ?? null;
  const pinnedMessages = messages.filter((message) => Boolean(message.pinnedAtMs));
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const scrollContainer = rootRef.current?.parentElement;
      const unreadMarker = rootRef.current?.querySelector<HTMLElement>("[data-unread-marker]");
      const firstMessageId = messages[0]?.id ?? null;
      const lastMessageId = messages[messages.length - 1]?.id ?? null;
      const prepended =
        Boolean(prependAnchorRef.current) &&
        previousFirstMessageIdRef.current !== null &&
        previousFirstMessageIdRef.current !== firstMessageId;
      if (scrollContainer && prepended && prependAnchorRef.current) {
        const anchor = prependAnchorRef.current;
        scrollContainer.scrollTop =
          anchor.scrollTop + (scrollContainer.scrollHeight - anchor.scrollHeight);
        prependAnchorRef.current = null;
      } else if (
        firstUnreadMessageId &&
        unreadMarker &&
        scrolledUnreadMarkerRef.current !== firstUnreadMessageId
      ) {
        scrolledUnreadMarkerRef.current = firstUnreadMessageId;
        unreadMarker.scrollIntoView({ block: "center" });
      } else if (
        scrollContainer &&
        (!initializedScrollRef.current ||
          (previousLastMessageIdRef.current !== lastMessageId && nearBottomRef.current))
      ) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
      initializedScrollRef.current = true;
      previousFirstMessageIdRef.current = firstMessageId;
      previousLastMessageIdRef.current = lastMessageId;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [firstUnreadMessageId, messages, typing]);
  useEffect(() => {
    const scrollContainer = rootRef.current?.parentElement;
    if (!scrollContainer) return;

    const handleScroll = () => {
      nearBottomRef.current =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 96;
      if (
        scrollContainer.scrollTop > 96 ||
        !hasOlderMessages ||
        loadingOlderMessages ||
        loadingOlderRequestRef.current ||
        !onLoadOlderMessages
      ) return;

      prependAnchorRef.current = {
        scrollHeight: scrollContainer.scrollHeight,
        scrollTop: scrollContainer.scrollTop,
      };
      loadingOlderRequestRef.current = true;
      void onLoadOlderMessages().finally(() => {
        loadingOlderRequestRef.current = false;
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [hasOlderMessages, loadingOlderMessages, onLoadOlderMessages]);
  useEffect(() => {
    if (!attachmentPreview && !reactionPickerMessageId && !messageMenuId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAttachmentPreview(null);
      setReactionPickerMessageId(null);
      setMessageMenuId(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-mailbox-message-popover]")) return;
      setReactionPickerMessageId(null);
      setMessageMenuId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [attachmentPreview, messageMenuId, reactionPickerMessageId]);
  if (!latest) return null;
  const counterpart = counterpartForMessage(latest);
  const viewerEmail = normalizeEmail(currentUserEmail);

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!onToggleReaction) return;
    const busyKey = `${messageId}:${emoji}`;
    setReactionBusyKey(busyKey);
    setActionError(null);
    try {
      await onToggleReaction(messageId, emoji);
      setReactionPickerMessageId(null);
    } catch (error) {
      setActionError({
        messageId,
        text: error instanceof Error ? error.message : "Reakci se nepodařilo uložit.",
      });
    } finally {
      setReactionBusyKey(null);
    }
  };

  const saveEditedMessage = async (messageId: string) => {
    if (!onEditMessage) return;
    setMessageActionBusyId(messageId);
    setActionError(null);
    try {
      await onEditMessage(messageId, editText);
      setEditingMessageId(null);
      setEditText("");
    } catch (error) {
      setActionError({
        messageId,
        text: error instanceof Error ? error.message : "Zprávu se nepodařilo upravit.",
      });
    } finally {
      setMessageActionBusyId(null);
    }
  };

  const deleteOwnMessage = async (messageId: string) => {
    if (!onDeleteMessage) return;
    if (!window.confirm("Smazat tuto zprávu všem účastníkům? Tuto akci nelze vrátit.")) return;
    setMessageMenuId(null);
    setMessageActionBusyId(messageId);
    setActionError(null);
    try {
      await onDeleteMessage(messageId);
    } catch (error) {
      setActionError({
        messageId,
        text: error instanceof Error ? error.message : "Zprávu se nepodařilo smazat.",
      });
    } finally {
      setMessageActionBusyId(null);
    }
  };

  const runMessageAction = async (
    messageId: string,
    action: () => Promise<void>,
    fallbackError: string
  ) => {
    setMessageMenuId(null);
    setMessageActionBusyId(messageId);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError({
        messageId,
        text: error instanceof Error ? error.message : fallbackError,
      });
    } finally {
      setMessageActionBusyId(null);
    }
  };

  return (
    <>
    <div ref={rootRef} className="mx-auto w-full max-w-4xl px-3 py-3 sm:px-6 sm:py-6">
      {showHeader ? (
        <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-5">
          <span className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-inner ring-1 ring-slate-200 ${latest.metadata?.groupConversation === true ? "bg-violet-100 text-violet-700" : "bg-white"}`}>
            {latest.metadata?.groupConversation === true ? (
              <UsersRound className="h-5 w-5" />
            ) : (
              <>
                <ProfileAvatar
                  src={counterpart.profileAvatar}
                  name={counterpart.name}
                  className="h-full w-full rounded-2xl text-5xl"
                  fallbackClassName="bg-sky-100 text-sky-700"
                  sizes="48px"
                />
                <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
              </>
            )}
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

      {pinnedMessages.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-2.5">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
            Připnuté zprávy
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pinnedMessages.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => document.getElementById(`mailbox-message-${message.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
                className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
              >
                <Pin className="h-3 w-3 shrink-0" />
                <span className="truncate">{metadataText(message, "messageText") || message.body}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3 sm:space-y-4">
        {hasOlderMessages || loadingOlderMessages ? (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => onLoadOlderMessages?.()}
              disabled={loadingOlderMessages}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-800 disabled:opacity-60"
            >
              {loadingOlderMessages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {loadingOlderMessages ? "Načítám starší zprávy…" : "Načíst starší zprávy"}
            </button>
          </div>
        ) : null}
        {messages.map((message, index) => {
          const sent = isSentMailboxItem(message);
          const groupConversation = message.metadata?.groupConversation === true;
          const groupCreatedEvent = message.metadata?.groupCreatedEvent === true;
          const messageSenderName =
            metadataText(message, "senderName") ||
            nameFromEmail(normalizeEmail(message.metadata?.senderEmail));
          const metadataMessageText = metadataText(message, "messageText");
          const bodyText = message.body.trim();
          const bodyIsAttachmentPlaceholder =
            bodyText === "Příloha bez textu." || bodyText === "Bez textu.";
          const messageText =
            metadataMessageText || (bodyIsAttachmentPlaceholder ? "" : bodyText);
          const text = messageText || "Bez textu.";
          const attachments = [
            ...parseMailboxAttachments(message),
            ...(message.clientAttachments ?? []).map((file) => ({ ...file, url: "" })),
          ];
          const containsOnlyImages =
            !messageText &&
            attachments.length > 0 &&
            attachments.every((file) => isImageAttachment(file.name, file.contentType));
          const recipientReadAtMs = sent
            ? metadataMillis(message, "recipientReadAtMs")
            : null;
          const deliveredAtMs = sent
            ? metadataMillis(message, "deliveredAtMs")
            : null;
          const editedAtMs = metadataMillis(message, "editedAtMs");
          const reactions = parseMailboxReactions(message);
          const deliveryStatus = message.clientDeliveryStatus;
          const persisted = !deliveryStatus;
          const canReact = persisted && Boolean(onToggleReaction) && reactionEmojis.length > 0;
          const canManageOwn =
            sent && persisted && Boolean(onEditMessage || onDeleteMessage);
          const canOpenMenu =
            persisted && Boolean(onTogglePin || (sent && onSetReminder) || canManageOwn);
          const editing = editingMessageId === message.id;
          const renderBareImages = containsOnlyImages && !editing;
          const actionBusy = messageActionBusyId === message.id;
          const pinned = Boolean(message.pinnedAtMs);
          const reminderAtMs = message.replyReminderAtMs ?? null;
          const groupRecipientEmails = groupConversation
            ? metadataEmails(message, "participantEmails").filter(
                (email) => email !== normalizeEmail(message.metadata?.senderEmail)
              )
            : [];
          const groupReadCount = groupConversation
            ? metadataEmails(message, "readByEmails").filter((email) =>
                groupRecipientEmails.includes(email)
              ).length
            : 0;
          const previousMessage = index > 0 ? messages[index - 1] : null;
          const showDaySeparator =
            !previousMessage ||
            mailboxMessageDayKey(previousMessage.createdAtMs) !==
              mailboxMessageDayKey(message.createdAtMs);

          if (groupCreatedEvent) {
            return (
              <div key={message.id} id={`mailbox-message-${message.id}`}>
                {showDaySeparator ? (
                  <div className="my-3 flex items-center gap-3 sm:my-5" role="separator" aria-label={formatMailboxMessageDay(message.createdAtMs)}>
                    <span className="h-px flex-1 bg-slate-200" />
                    <time
                      dateTime={message.createdAtMs ? new Date(message.createdAtMs).toISOString() : undefined}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm"
                    >
                      {formatMailboxMessageDay(message.createdAtMs)}
                    </time>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                ) : null}
                {message.id === firstUnreadMessageId ? <span data-unread-marker /> : null}
                <div className="flex justify-center py-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                    <UsersRound className="h-3.5 w-3.5" />
                    Skupina byla vytvořena · {formatMailboxMessageTime(message.createdAtMs)}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={message.id} id={`mailbox-message-${message.id}`}>
              {showDaySeparator ? (
                <div className="my-3 flex items-center gap-3 sm:my-5" role="separator" aria-label={formatMailboxMessageDay(message.createdAtMs)}>
                  <span className="h-px flex-1 bg-slate-200" />
                  <time
                    dateTime={message.createdAtMs ? new Date(message.createdAtMs).toISOString() : undefined}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm"
                  >
                    {formatMailboxMessageDay(message.createdAtMs)}
                  </time>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              ) : null}
              {message.id === firstUnreadMessageId ? (
                <div data-unread-marker className="my-3 flex items-center gap-3 sm:my-5" role="separator" aria-label="Nové zprávy">
                  <span className="h-px flex-1 bg-violet-200" />
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">Nové zprávy</span>
                  <span className="h-px flex-1 bg-violet-200" />
                </div>
              ) : null}
              <div className={`flex ${sent ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[92%] flex-col sm:max-w-[78%] ${sent ? "items-end" : "items-start"}`}>
                  <div
                    data-message-image-only={renderBareImages ? "true" : undefined}
                    className={
                      renderBareImages
                        ? "space-y-2"
                        : `rounded-[18px] px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.07)] sm:rounded-[20px] sm:px-4 sm:py-3 ${
                            sent
                              ? "rounded-br-md bg-violet-700 text-[#fff]"
                              : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                          }`
                    }
                  >
                  {!renderBareImages && index === 0 && message.title ? (
                    <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${sent ? "text-violet-100" : "text-violet-700"}`}>
                      {message.title}
                    </p>
                  ) : null}
                  {groupConversation && !sent && messageSenderName ? (
                    <p className="mb-1 text-[10px] font-bold text-violet-700">
                      {messageSenderName}
                    </p>
                  ) : null}
                  {editing ? (
                    <div className="min-w-[min(360px,68vw)] space-y-2">
                      <textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value.slice(0, 4_000))}
                        rows={3}
                        autoFocus
                        disabled={actionBusy}
                        className="max-h-48 min-h-24 w-full resize-y rounded-xl border border-white/30 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-white"
                        aria-label="Upravit text zprávy"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] text-violet-100">{editText.length}/4000</span>
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditText("");
                              setActionError(null);
                            }}
                            disabled={actionBusy}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                          >
                            Zrušit
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEditedMessage(message.id)}
                            disabled={actionBusy || (!editText.trim() && attachments.length === 0)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-violet-800 transition hover:bg-violet-50 disabled:opacity-50"
                          >
                            {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Uložit
                          </button>
                        </span>
                      </div>
                    </div>
                  ) : !renderBareImages ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 sm:text-[15px]">
                      {text}
                    </p>
                  ) : null}

                  {attachments.length > 0 ? (
                    <div className={renderBareImages ? "space-y-2" : "mt-3 space-y-2"}>
                      {attachments.map((file) => (
                        <LazyMailboxAttachment
                          key={file.id}
                          messageId={message.id}
                          file={file}
                          sent={sent}
                          deliveryStatus={deliveryStatus}
                          bareImage={renderBareImages}
                          onLoad={onLoadAttachment}
                          onPreview={setAttachmentPreview}
                        />
                      ))}
                    </div>
                  ) : null}
                  </div>

                  {reactions.length > 0 || canReact ? (
                    <div className={`mt-1.5 flex flex-wrap items-center gap-1 ${sent ? "justify-end" : "justify-start"}`}>
                      {reactions.map((reaction) => {
                        const active = viewerEmail
                          ? reaction.userEmails.includes(viewerEmail)
                          : false;
                        const busy = reactionBusyKey === `${message.id}:${reaction.emoji}`;
                        return (
                          <button
                            key={reaction.emoji}
                            type="button"
                            onClick={() => void toggleReaction(message.id, reaction.emoji)}
                            disabled={!canReact || reactionBusyKey !== null}
                            className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold transition disabled:opacity-60 ${
                              active
                                ? "border-violet-300 bg-violet-100 text-violet-900"
                                : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50"
                            }`}
                            aria-label={`${active ? "Odebrat" : "Přidat"} reakci ${reaction.emoji}`}
                            aria-pressed={active}
                          >
                            <span className={busy ? "animate-pulse" : ""}>{reaction.emoji}</span>
                            <span>{reaction.userEmails.length}</span>
                          </button>
                        );
                      })}
                      {canReact ? (
                        <div className="relative" data-mailbox-message-popover>
                          <button
                            type="button"
                            onClick={() => {
                              setReactionPickerMessageId((current) =>
                                current === message.id ? null : message.id
                              );
                              setMessageMenuId(null);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                            aria-label="Přidat reakci"
                            aria-expanded={reactionPickerMessageId === message.id}
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </button>
                          {reactionPickerMessageId === message.id ? (
                            <div className={`absolute bottom-full z-30 mb-2 flex gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_14px_36px_rgba(15,23,42,0.2)] ${sent ? "right-0" : "left-0"}`}>
                              {reactionEmojis.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(message.id, emoji)}
                                  disabled={reactionBusyKey !== null}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-base transition hover:bg-violet-50 disabled:opacity-50"
                                  aria-label={`Reagovat ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-[10px] font-medium ${sent ? "justify-end text-slate-500" : "text-slate-400"}`}>
                  <time dateTime={message.createdAtMs ? new Date(message.createdAtMs).toISOString() : undefined}>
                    {formatMailboxMessageTime(message.createdAtMs)}
                  </time>
                  {editedAtMs ? (
                    <span title={`Upraveno ${formatDateTime(editedAtMs)}`}>Upraveno</span>
                  ) : null}
                  {pinned ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700" title="Připnutá zpráva">
                      <Pin className="h-3 w-3" />
                      Připnuto
                    </span>
                  ) : null}
                  {reminderAtMs ? (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${reminderAtMs <= Date.now() ? "text-rose-700" : "text-sky-700"}`}
                      title={`Připomenout ${formatDateTime(reminderAtMs)}, pokud nikdo neodpoví`}
                    >
                      <Bell className="h-3 w-3" />
                      {reminderAtMs <= Date.now() ? "Čeká na odpověď" : `Připomenout ${formatDateTime(reminderAtMs)}`}
                    </span>
                  ) : null}
                  {sent ? (
                    deliveryStatus === "failed" ? (
                      <>
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-700" title={message.clientDeliveryError || "Zprávu se nepodařilo odeslat."}>
                          <CircleAlert className="h-3.5 w-3.5" />
                          Nepodařilo se odeslat
                        </span>
                        {onRetryMessage ? (
                          <button
                            type="button"
                            onClick={() => onRetryMessage(message.id)}
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-bold text-rose-700 transition hover:bg-rose-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Zkusit znovu
                          </button>
                        ) : null}
                      </>
                    ) : deliveryStatus === "sending" ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Odesílá se
                      </span>
                    ) : groupConversation && groupRecipientEmails.length > 0 && groupReadCount > 0 ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${groupReadCount === groupRecipientEmails.length ? "text-violet-700" : "text-slate-500"}`}>
                        <CheckCheck className="h-3.5 w-3.5" />
                        {groupReadCount === groupRecipientEmails.length
                          ? "Přečteno všemi"
                          : `Přečteno ${groupReadCount}/${groupRecipientEmails.length}`}
                      </span>
                    ) : recipientReadAtMs ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-violet-700" title={`Přečteno ${formatDateTime(recipientReadAtMs)}`}>
                        <CheckCheck className="h-3.5 w-3.5" />
                        Přečteno
                      </span>
                    ) : deliveryStatus === "delivered" || deliveredAtMs ? (
                      <span className="inline-flex items-center gap-1 text-slate-500" title={`Doručeno ${formatDateTime(deliveredAtMs ?? message.createdAtMs)}`}>
                        <CheckCheck className="h-3.5 w-3.5" />
                        Doručeno
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500" title={`Odesláno ${formatDateTime(message.createdAtMs)}`}>
                        <Check className="h-3.5 w-3.5" />
                        Odesláno
                      </span>
                    )
                  ) : null}
                  {canOpenMenu ? (
                    <div className="relative" data-mailbox-message-popover>
                      <button
                        type="button"
                        onClick={() => {
                          setMessageMenuId((current) => current === message.id ? null : message.id);
                          setReactionPickerMessageId(null);
                        }}
                        disabled={actionBusy}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        aria-label="Další akce se zprávou"
                        aria-expanded={messageMenuId === message.id}
                      >
                        {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                      </button>
                      {messageMenuId === message.id ? (
                        <div className="absolute bottom-full right-0 z-30 mb-2 w-60 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 text-xs shadow-[0_14px_36px_rgba(15,23,42,0.2)]">
                          {onTogglePin ? (
                            <button
                              type="button"
                              onClick={() => void runMessageAction(
                                message.id,
                                () => onTogglePin(message.id, !pinned),
                                pinned ? "Zprávu se nepodařilo odepnout." : "Zprávu se nepodařilo připnout."
                              )}
                              className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 transition hover:bg-amber-50 hover:text-amber-900"
                            >
                              {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              {pinned ? "Odepnout zprávu" : "Připnout zprávu"}
                            </button>
                          ) : null}
                          {sent && onSetReminder ? (
                            reminderAtMs ? (
                              <button
                                type="button"
                                onClick={() => void runMessageAction(
                                  message.id,
                                  () => onSetReminder(message.id, null),
                                  "Připomenutí se nepodařilo zrušit."
                                )}
                                className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-sky-800 transition hover:bg-sky-50"
                              >
                                <BellOff className="h-3.5 w-3.5" />
                                Zrušit připomenutí
                              </button>
                            ) : (
                              <div className="rounded-xl border border-slate-100 p-1.5">
                                <p className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                  Pokud nikdo neodpoví
                                </p>
                                {[1, 3, 7].map((days) => (
                                  <button
                                    key={days}
                                    type="button"
                                    onClick={() => void runMessageAction(
                                      message.id,
                                      () => onSetReminder(message.id, Date.now() + days * 24 * 60 * 60 * 1000),
                                      "Připomenutí se nepodařilo nastavit."
                                    )}
                                    className="inline-flex w-full items-center gap-2 rounded-lg px-2 py-1.5 font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-900"
                                  >
                                    <Bell className="h-3.5 w-3.5" />
                                    Připomeň za {days === 1 ? "1 den" : days === 3 ? "3 dny" : "7 dní"}
                                  </button>
                                ))}
                              </div>
                            )
                          ) : null}
                          {sent && onEditMessage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditText(text);
                                setMessageMenuId(null);
                                setActionError(null);
                              }}
                              className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Upravit zprávu
                            </button>
                          ) : null}
                          {sent && onDeleteMessage ? (
                            <button
                              type="button"
                              onClick={() => void deleteOwnMessage(message.id)}
                              className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-rose-700 transition hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Smazat zprávu
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                  {actionError?.messageId === message.id ? (
                    <p className="mt-1 max-w-sm px-1 text-[10px] font-semibold text-rose-700" role="alert">
                      {actionError.text}
                    </p>
                  ) : null}
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
    {attachmentPreview ? (
      <div className="fixed inset-0 z-[140] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Náhled ${attachmentPreview.name}`}>
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setAttachmentPreview(null)}
          aria-label="Zavřít náhled přílohy"
        />
        <section className="relative z-[141] flex h-[min(88vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
          <header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4 py-2 text-white">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{attachmentPreview.name}</span>
              <span className="block text-[11px] text-slate-400">{formatFileSize(attachmentPreview.sizeBytes)}</span>
            </span>
            <a
              href={attachmentPreview.url}
              download={attachmentPreview.name}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              Stáhnout
            </a>
            <button
              type="button"
              onClick={() => setAttachmentPreview(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Zavřít náhled"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="relative min-h-0 flex-1 bg-slate-900">
            {isImageAttachment(attachmentPreview.name, attachmentPreview.contentType) ? (
              <Image
                src={attachmentPreview.url}
                alt={attachmentPreview.name}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
              />
            ) : (
              <iframe
                src={attachmentPreview.url}
                title={`Náhled ${attachmentPreview.name}`}
                className="h-full w-full bg-white"
              />
            )}
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
