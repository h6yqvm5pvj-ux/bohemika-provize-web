"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Bell,
  CheckCheck,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  MailOpen,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Settings2,
  SquarePen,
  Trash2,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import { AppLayout } from "@/components/AppLayout";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";
import { MailboxChatComposer } from "./MailboxChatComposer";
import { MailboxChatThread } from "./MailboxChatThread";
import { MailboxGroupManager } from "./MailboxGroupManager";
import {
  COMPOSE_FILES_MAX_COUNT,
  COMPOSE_MESSAGE_MAX_LEN,
  COMPOSE_SUBJECT_MAX_LEN,
  EMAIL_RE,
  MESSAGE_REACTION_EMOJIS,
} from "./postaConstants";
import {
  formatDateTime,
  formatFileSize,
  isSentMailboxItem,
  isTipsterTipMailboxItem,
  nameFromEmail,
  normalizeEmail,
  parseMailboxAttachments,
  sentRecipientText,
  tipsterTipCategoryText,
  tipsterTipDetailId,
  tipsterTipListTitle,
  tipsterTipSenderText,
  toReplySubject,
} from "./postaHelpers";
import { buildMailboxPreviewHtml } from "./postaPreview";
import { formatMailboxPresence } from "./postaPresence";
import type {
  MailboxActivityResponse,
  MailboxAttachment,
  MailboxComposeResponse,
  MailboxConversationResponse,
  MailboxDeleteResponse,
  MailboxItem,
  MailboxMessageMutationResponse,
  MailboxPageCursor,
  MailboxPatchResponse,
  MailboxResponse,
  MailboxSharedPreviewResponse,
  MailFilterMode,
  RecipientOption,
  UserSearchResponse,
} from "./postaTypes";
import styles from "./postaWall.module.css";

type MailboxDisplayRow =
  | {
      kind: "item";
      key: string;
      item: MailboxItem;
    }
  | {
      kind: "group";
      key: string;
      title: string;
      body: string;
      items: MailboxItem[];
      unreadCount: number;
      latestCreatedAtMs: number | null;
      latestItem: MailboxItem;
    };

type MailboxChatListRow =
  | {
      kind: "item";
      key: string;
      item: MailboxItem;
    }
  | {
      kind: "conversation";
      key: string;
      counterpartName: string;
      counterpartEmail: string;
      counterpartAvatar: string;
      latestItem: MailboxItem;
      items: MailboxItem[];
      unreadCount: number;
      totalMessageCount: number;
    };

type QuickReplyAttempt = {
  clientId: string;
  clientRequestId: string;
  conversationKey: string;
  recipient: RecipientOption;
  recipients?: RecipientOption[];
  groupName?: string;
  conversationId?: string;
  participants?: RecipientOption[];
  subject: string;
  text: string;
  files: File[];
  createdAtMs: number;
  status: "sending" | "delivered" | "failed";
  error?: string;
  messageId?: string;
  deliveredAtMs?: number;
};

type ConversationHistoryState = {
  key: string;
  messages: MailboxItem[];
  nextCursor: MailboxPageCursor | null;
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
};

const createClientRequestId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const normalizeRecipientSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const createDirectConversationId = async (
  firstEmail: string,
  secondEmail: string
): Promise<string> => {
  const participants = [normalizeEmail(firstEmail), normalizeEmail(secondEmail)].sort();
  if (!participants[0] || !participants[1] || participants[0] === participants[1]) {
    throw new Error("Konverzaci se nepodařilo otevřít.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("Tento prohlížeč nepodporuje zabezpečené otevření chatu.");
  }
  const source = `bohemika-mailbox-conversation:v1\n${participants[0]}\n${participants[1]}`;
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  );
  const base64Url = btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `dm_${base64Url.slice(0, 32)}`;
};

const localFileKey = (file: File): string =>
  `${file.name}-${file.size}-${file.lastModified}`;

function MailboxActionMenu({
  children,
  label = "Další akce",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-800"
        aria-label={label}
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

const normalizeGroupText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const pluralCount = (count: number, one: string, few: string, many: string): string => {
  if (count === 1) return `${count} ${one}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
};

const mailboxMetadataText = (item: MailboxItem, key: string): string => {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
};

const weeklyTeamReportHref = (
  item: MailboxItem,
  embedded = false
): string => {
  const params = new URLSearchParams({ source: "weekly-report" });
  const reportId = mailboxMetadataText(item, "reportId");
  if (reportId) params.set("reportId", reportId);
  if (embedded) params.set("embed", "mailbox");
  return `/muj-tym/tydenni-report?${params.toString()}`;
};

const isStandardDirectMailboxItem = (item: MailboxItem): boolean =>
  item.type === "direct_message" && !isTipsterTipMailboxItem(item);

const isGroupMailboxItem = (item: MailboxItem): boolean =>
  item.metadata?.groupConversation === true;

const mailboxParticipants = (item: MailboxItem): RecipientOption[] => {
  const raw = item.metadata?.participants;
  if (!Array.isArray(raw)) return [];
  const byEmail = new Map<string, RecipientOption>();
  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const row = entry as Record<string, unknown>;
    const email = normalizeEmail(row.email);
    if (!email || !EMAIL_RE.test(email)) return;
    const name =
      typeof row.name === "string" && row.name.trim()
        ? row.name.trim()
        : nameFromEmail(email);
    byEmail.set(email, {
      email,
      name,
      profileAvatar: normalizeProfileAvatar(row.profileAvatar),
    });
  });
  return [...byEmail.values()];
};

const directMessageCounterpart = (
  item: MailboxItem
): { email: string; name: string; profileAvatar: string } => {
  if (isGroupMailboxItem(item)) {
    const participants = mailboxParticipants(item);
    const groupName = mailboxMetadataText(item, "groupName");
    return {
      email: pluralCount(participants.length, "účastník", "účastníci", "účastníků"),
      name: groupName || "Skupinová konverzace",
      profileAvatar: "",
    };
  }
  const sent = isSentMailboxItem(item);
  const email = normalizeEmail(
    sent ? item.metadata?.recipientEmail : item.metadata?.senderEmail
  );
  const storedName = mailboxMetadataText(
    item,
    sent ? "recipientName" : "senderName"
  );
  return {
    email,
    name: storedName || (email ? nameFromEmail(email) : "Uživatel"),
    profileAvatar: normalizeProfileAvatar(
      item.metadata?.[sent ? "recipientAvatar" : "senderAvatar"]
    ),
  };
};

const directMessageConversationKey = (item: MailboxItem): string => {
  if (!isStandardDirectMailboxItem(item)) return `item:${item.id}`;
  const conversationId = mailboxMetadataText(item, "conversationId");
  if (conversationId) return `conversation:${conversationId}`;
  const counterpart = directMessageCounterpart(item);
  return counterpart.email
    ? `chat:${counterpart.email}`
    : `chat-name:${normalizeGroupText(counterpart.name)}:${item.id}`;
};

const buildMailboxChatListRows = (
  visibleItems: MailboxItem[],
  allItems: MailboxItem[]
): MailboxChatListRow[] => {
  const allThreads = new Map<string, MailboxItem[]>();
  allItems.forEach((item) => {
    if (!isStandardDirectMailboxItem(item)) return;
    const key = directMessageConversationKey(item);
    const thread = allThreads.get(key) ?? [];
    thread.push(item);
    allThreads.set(key, thread);
  });
  allThreads.forEach((thread) => {
    thread.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  });

  const visibleThreads = new Map<string, MailboxItem[]>();
  const emitted = new Set<string>();
  const rows: MailboxChatListRow[] = [];
  visibleItems.forEach((item) => {
    if (!isStandardDirectMailboxItem(item)) return;
    const key = directMessageConversationKey(item);
    const thread = visibleThreads.get(key) ?? [];
    thread.push(item);
    visibleThreads.set(key, thread);
  });

  visibleItems.forEach((item) => {
    if (!isStandardDirectMailboxItem(item)) {
      rows.push({ kind: "item", key: item.id, item });
      return;
    }
    const key = directMessageConversationKey(item);
    if (emitted.has(key)) return;
    emitted.add(key);
    const visibleThread = visibleThreads.get(key) ?? [item];
    const entireThread = allThreads.get(key) ?? visibleThread;
    const latestItem = entireThread[0] ?? item;
    const counterpart = directMessageCounterpart(latestItem);
    rows.push({
      kind: "conversation",
      key,
      counterpartName: counterpart.name,
      counterpartEmail: counterpart.email,
      counterpartAvatar: counterpart.profileAvatar,
      latestItem,
      items: visibleThread,
      unreadCount: visibleThread.filter(
        (message) => !isSentMailboxItem(message) && !message.read
      ).length,
      totalMessageCount: entireThread.length,
    });
  });

  return rows;
};

const mailboxGroupKey = (item: MailboxItem): string | null => {
  if (isSentMailboxItem(item)) return null;
  if (item.type === "online_card_meeting_request") return "type:online-card-meeting-request";
  if (item.type === "weekly_team_report") return "type:weekly-team-report";
  if (isTipsterTipMailboxItem(item)) return `tipster:${normalizeGroupText(tipsterTipCategoryText(item))}`;

  const normalizedTitle = normalizeGroupText(item.title);
  const normalizedBody = normalizeGroupText(item.body);
  if (
    /nova smlouva|nove smlouvy|nova produkce|smlouva v tymu|smlouvy v tymu/.test(normalizedTitle) ||
    /nova smlouva|nove smlouvy|smlouva v tymu|smlouvy v tymu/.test(normalizedBody)
  ) {
    return "type:team-contracts";
  }

  if (item.type === "direct_message") {
    const senderEmail = normalizeEmail(mailboxMetadataText(item, "senderEmail"));
    return senderEmail ? `direct:${senderEmail}` : null;
  }

  if (item.type && item.type !== "generic") return `type:${item.type}`;
  return normalizedTitle ? `title:${normalizedTitle}` : null;
};

const mailboxGroupTitle = (key: string, items: MailboxItem[]): string => {
  const count = items.length;
  if (key === "type:online-card-meeting-request") {
    return pluralCount(count, "nová žádost o schůzku", "nové žádosti o schůzku", "nových žádostí o schůzku");
  }
  if (key === "type:weekly-team-report") {
    return pluralCount(count, "týdenní report", "týdenní reporty", "týdenních reportů");
  }
  if (key === "type:team-contracts") {
    return pluralCount(count, "nová smlouva v týmu", "nové smlouvy v týmu", "nových smluv v týmu");
  }
  if (key.startsWith("tipster:")) {
    return pluralCount(count, "nový tip", "nové tipy", "nových tipů");
  }
  if (key.startsWith("direct:")) {
    const first = items[0];
    const senderName = first ? mailboxMetadataText(first, "senderName") : "";
    const senderEmail = first ? normalizeEmail(mailboxMetadataText(first, "senderEmail")) : "";
    const sender = senderName || (senderEmail ? nameFromEmail(senderEmail) : "odesílatele");
    return pluralCount(count, `zpráva od ${sender}`, `zprávy od ${sender}`, `zpráv od ${sender}`);
  }
  return pluralCount(count, "podobná notifikace", "podobné notifikace", "podobných notifikací");
};

const mailboxGroupBody = (items: MailboxItem[], unreadCount: number): string => {
  const latest = items[0];
  const unreadText =
    unreadCount > 0
      ? pluralCount(unreadCount, "nepřečtená", "nepřečtené", "nepřečtených")
      : "vše přečtené";
  return latest ? `${unreadText} • poslední: ${latest.title}` : unreadText;
};

const SNOOZE_DAY_MS = 24 * 60 * 60 * 1000;

const snoozeUntilAfterDays = (days: number): number => Date.now() + days * SNOOZE_DAY_MS;

const isMailboxSnoozed = (item: MailboxItem, nowMs = Date.now()): boolean =>
  typeof item.snoozedUntilMs === "number" &&
  Number.isFinite(item.snoozedUntilMs) &&
  item.snoozedUntilMs > nowMs;

const isMailboxArchived = (item: MailboxItem): boolean =>
  typeof item.archivedAtMs === "number" &&
  Number.isFinite(item.archivedAtMs) &&
  item.archivedAtMs > 0;

const formatSnoozedUntil = (item: MailboxItem): string =>
  item.snoozedUntilMs ? `Odloženo do ${formatDateTime(item.snoozedUntilMs)}` : "";

const formatMailboxListDate = (value: number | null): string => {
  if (!value || !Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "2-digit" as const }),
  }).format(date);
};

const buildMailboxDisplayRows = (items: MailboxItem[], groupEnabled: boolean): MailboxDisplayRow[] => {
  if (!groupEnabled) {
    return items.map((item) => ({ kind: "item", key: item.id, item }));
  }

  const groups = new Map<string, MailboxItem[]>();
  const itemGroupKeys = new Map<string, string>();
  items.forEach((item) => {
    const key = mailboxGroupKey(item);
    if (!key) return;
    const next = groups.get(key) ?? [];
    next.push(item);
    groups.set(key, next);
    itemGroupKeys.set(item.id, key);
  });

  const emittedGroups = new Set<string>();
  const rows: MailboxDisplayRow[] = [];
  items.forEach((item) => {
    const groupKey = itemGroupKeys.get(item.id);
    const groupItems = groupKey ? groups.get(groupKey) ?? [] : [];
    if (!groupKey || groupItems.length < 2) {
      rows.push({ kind: "item", key: item.id, item });
      return;
    }
    if (emittedGroups.has(groupKey)) return;
    emittedGroups.add(groupKey);
    const unreadCount = groupItems.filter((row) => !row.read).length;
    rows.push({
      kind: "group",
      key: groupKey,
      title: mailboxGroupTitle(groupKey, groupItems),
      body: mailboxGroupBody(groupItems, unreadCount),
      items: groupItems,
      unreadCount,
      latestCreatedAtMs: groupItems[0]?.createdAtMs ?? null,
      latestItem: groupItems[0],
    });
  });
  return rows;
};

export default function PostaPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MailboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mailFilter, setMailFilter] = useState<MailFilterMode>("all");
  const [mailSearch, setMailSearch] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [snoozingIds, setSnoozingIds] = useState<string[]>([]);
  const [archivingIds, setArchivingIds] = useState<string[]>([]);
  const [snoozeNowMs, setSnoozeNowMs] = useState(() => Date.now());
  const [previewItem, setPreviewItem] = useState<MailboxItem | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewAttachmentBlobUrls, setPreviewAttachmentBlobUrls] = useState<Record<string, string>>({});
  const previewAttachmentBlobUrlsRef = useRef<string[]>([]);
  const [sharedExportPreviewHtml, setSharedExportPreviewHtml] = useState<string | null>(null);
  const [sharedExportPreviewLoading, setSharedExportPreviewLoading] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [composeGroupMode, setComposeGroupMode] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeErrorText, setComposeErrorText] = useState<string | null>(null);
  const [composeRecipientQuery, setComposeRecipientQuery] = useState("");
  const [composeSelectedRecipients, setComposeSelectedRecipients] = useState<RecipientOption[]>([]);
  const [composeSuggestions, setComposeSuggestions] = useState<RecipientOption[]>([]);
  const [composeSuggestionsLoading, setComposeSuggestionsLoading] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState("");
  const [quickReplyFiles, setQuickReplyFiles] = useState<File[]>([]);
  const [quickReplySubmitting, setQuickReplySubmitting] = useState(false);
  const [quickReplyErrorText, setQuickReplyErrorText] = useState<string | null>(null);
  const [quickReplySuccessText, setQuickReplySuccessText] = useState<string | null>(null);
  const [quickReplyAttempts, setQuickReplyAttempts] = useState<QuickReplyAttempt[]>([]);
  const [conversationUnreadStartId, setConversationUnreadStartId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationHistoryState | null>(null);
  const [groupConversation, setGroupConversation] = useState<MailboxConversationResponse | null>(null);
  const [groupConversationLoading, setGroupConversationLoading] = useState(false);
  const [groupConversationError, setGroupConversationError] = useState<string | null>(null);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupMuteSaving, setGroupMuteSaving] = useState(false);
  const [chatActivity, setChatActivity] = useState<{
    lastActiveAtMs: number | null;
    typing: boolean;
    checkedAtMs: number;
  }>({ lastActiveAtMs: null, typing: false, checkedAtMs: 0 });
  const composeLookupSeq = useRef(0);
  const composeSearchCacheRef = useRef(new Map<string, RecipientOption[]>());
  const composeSearchAbortRef = useRef<AbortController | null>(null);
  const openedDeepLinkMessageIdRef = useRef<string>("");
  const pendingDeepLinkMessageIdRef = useRef<string>("");
  const mailboxLoadSequenceRef = useRef(0);
  const conversationLoadSequenceRef = useRef(0);
  const groupConversationLoadSequenceRef = useRef(0);
  const attachmentBlobUrlCacheRef = useRef(new Map<string, string>());
  const attachmentLoadPromiseRef = useRef(new Map<string, Promise<string>>());
  const typingLastSentAtRef = useRef(0);
  const typingWasActiveRef = useRef(false);
  const typingIdleTimerRef = useRef<number | null>(null);
  const markingReadIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      setUser(null);
      setAuthReady(true);
    }, 5000);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setUser(fbUser ?? null);
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    setItems([]);
    setUnreadCount(0);
    setSelectedIds([]);
    setSelectMode(false);
    setExpandedGroupKeys([]);
    setPreviewItem(null);
    setPreviewModalOpen(false);
    setSharedExportPreviewHtml(null);
    setComposeModalOpen(false);
    setComposeGroupMode(false);
    setQuickReplyAttempts([]);
    setConversationUnreadStartId(null);
    setConversationHistory(null);
    setGroupConversation(null);
    setGroupConversationLoading(false);
    setGroupConversationError(null);
    setGroupManagerOpen(false);
    conversationLoadSequenceRef.current += 1;
    groupConversationLoadSequenceRef.current += 1;
    attachmentBlobUrlCacheRef.current.clear();
    attachmentLoadPromiseRef.current.clear();
    setChatActivity({ lastActiveAtMs: null, typing: false, checkedAtMs: 0 });
    previewAttachmentBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewAttachmentBlobUrlsRef.current = [];
    setPreviewAttachmentBlobUrls({});
  }, [effectiveEmail]);

  const loadMailbox = useCallback(async (options?: { silent?: boolean }) => {
    const currentUser = auth.currentUser;
    const scopeEmail = effectiveEmail;
    if (!currentUser || !scopeEmail) return;
    const sequence = ++mailboxLoadSequenceRef.current;
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await fetchAuthedJsonOrThrow<MailboxResponse>(
        currentUser,
        "/api/mailbox?limit=80",
        { method: "GET" }
      );
      if (
        effectiveUserEmail(auth.currentUser?.email) !== scopeEmail ||
        sequence !== mailboxLoadSequenceRef.current
      ) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(
        typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount)
          ? Math.max(0, Math.floor(data.unreadCount))
          : 0
      );
    } catch (err: any) {
      if (!options?.silent && effectiveUserEmail(auth.currentUser?.email) === scopeEmail) {
        setError(err?.message || "Poštu se nepodařilo načíst.");
      }
    } finally {
      if (!options?.silent && effectiveUserEmail(auth.currentUser?.email) === scopeEmail) {
        setLoading(false);
      }
    }
  }, [effectiveEmail]);

  const mailboxScopeIsCurrent = useCallback(
    () =>
      Boolean(effectiveEmail) &&
      effectiveUserEmail(auth.currentUser?.email) === effectiveEmail,
    [effectiveEmail]
  );

  const loadConversationHistoryPage = useCallback(async ({
    conversationId,
    key,
    cursor = null,
    older = false,
  }: {
    conversationId: string;
    key: string;
    cursor?: MailboxPageCursor | null;
    older?: boolean;
  }) => {
    const currentUser = auth.currentUser;
    const scopeEmail = effectiveEmail;
    if (!currentUser || !scopeEmail) return;
    const sequence = older
      ? conversationLoadSequenceRef.current
      : ++conversationLoadSequenceRef.current;
    setConversationHistory((current) => ({
      key,
      messages: current?.key === key ? current.messages : [],
      nextCursor: older && current?.key === key ? current.nextCursor : null,
      hasMore: older && current?.key === key ? current.hasMore : true,
      loading: !older,
      loadingOlder: older,
      error: null,
    }));

    const params = new URLSearchParams({ conversationId, limit: "30" });
    if (cursor) {
      params.set("cursorMs", String(cursor.createdAtMs));
      params.set("cursorId", cursor.id);
    }

    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxResponse>(
        currentUser,
        `/api/mailbox?${params.toString()}`,
        { method: "GET" }
      );
      if (
        sequence !== conversationLoadSequenceRef.current ||
        effectiveUserEmail(auth.currentUser?.email) !== scopeEmail
      ) return;
      const pageItems = Array.isArray(payload.items) ? payload.items : [];
      setConversationHistory((current) => {
        if (!current || current.key !== key) return current;
        const merged = new Map<string, MailboxItem>();
        if (older) current.messages.forEach((message) => merged.set(message.id, message));
        pageItems.forEach((message) => merged.set(message.id, message));
        return {
          key,
          messages: [...merged.values()].sort(
            (a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0)
          ),
          nextCursor: payload.nextCursor ?? null,
          hasMore: payload.hasMore === true,
          loading: false,
          loadingOlder: false,
          error: null,
        };
      });
    } catch (historyError) {
      if (sequence !== conversationLoadSequenceRef.current) return;
      setConversationHistory((current) =>
        current?.key === key
          ? {
              ...current,
              loading: false,
              loadingOlder: false,
              error:
                historyError instanceof Error
                  ? historyError.message
                  : "Historii se nepodařilo načíst.",
            }
          : current
      );
    }
  }, [effectiveEmail]);

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }
    void loadMailbox();

    const intervalId = window.setInterval(() => {
      void loadMailbox({ silent: true });
    }, 120_000);

    const onFocus = () => {
      void loadMailbox({ silent: true });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, effectiveEmail, loadMailbox, user]);

  useEffect(() => {
    if (!authReady || !user || !effectiveEmail) return;
    let stopped = false;
    let abortController: AbortController | null = null;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadMailbox({ silent: true });
      }, 120);
    };

    const connect = async () => {
      if (stopped) return;
      abortController = new AbortController();
      try {
        const request = async (forceRefresh: boolean) => {
          const token = await user.getIdToken(forceRefresh);
          return fetch("/api/mailbox/stream", {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: abortController?.signal,
          });
        };
        let response = await request(false);
        if (response.status === 401) response = await request(true);
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          events.forEach((event) => {
            if (event.split("\n").some((line) => line.trim() === "event: mailbox")) {
              scheduleRefresh();
            }
          });
        }
      } catch (streamError) {
        if (!stopped && !(streamError instanceof DOMException && streamError.name === "AbortError")) {
          console.warn("Realtime pošty se znovu připojí:", streamError);
        }
      } finally {
        if (!stopped) reconnectTimer = window.setTimeout(() => void connect(), 1500);
      }
    };

    void connect();
    return () => {
      stopped = true;
      abortController?.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [authReady, effectiveEmail, loadMailbox, user]);

  const receivedItems = useMemo(() => items.filter((item) => !isSentMailboxItem(item)), [items]);
  const activeReceivedItems = useMemo(() => {
    return receivedItems.filter((item) => !isMailboxArchived(item) && !isMailboxSnoozed(item, snoozeNowMs));
  }, [receivedItems, snoozeNowMs]);
  const activeChatItems = useMemo(
    () => items.filter(
      (item) =>
        isStandardDirectMailboxItem(item) &&
        !isMailboxArchived(item) &&
        !isMailboxSnoozed(item, snoozeNowMs)
    ),
    [items, snoozeNowMs]
  );
  const activeSystemItems = useMemo(
    () => activeReceivedItems.filter((item) => !isStandardDirectMailboxItem(item)),
    [activeReceivedItems]
  );
  const snoozedItems = useMemo(() => {
    return receivedItems.filter((item) => !isMailboxArchived(item) && isMailboxSnoozed(item, snoozeNowMs));
  }, [receivedItems, snoozeNowMs]);
  const archivedItems = useMemo(() => items.filter(isMailboxArchived), [items]);
  const visibleItems = useMemo(() => {
    if (mailFilter === "system") {
      return activeSystemItems;
    }
    if (mailFilter === "snoozed") {
      return snoozedItems;
    }
    if (mailFilter === "archived") {
      return archivedItems;
    }
    if (mailFilter === "unread") {
      return activeChatItems.filter((item) => !isSentMailboxItem(item) && !item.read);
    }
    return activeChatItems;
  }, [activeChatItems, activeSystemItems, archivedItems, mailFilter, snoozedItems]);

  const filteredVisibleItems = useMemo(() => {
    const query = normalizeGroupText(mailSearch);
    if (!query) return visibleItems;
    return visibleItems.filter((item) => {
      const metadata = item.metadata ?? {};
      const searchable = [
        item.title,
        item.body,
        typeof metadata.senderName === "string" ? metadata.senderName : "",
        typeof metadata.senderEmail === "string" ? metadata.senderEmail : "",
        typeof metadata.recipientName === "string" ? metadata.recipientName : "",
        typeof metadata.recipientEmail === "string" ? metadata.recipientEmail : "",
      ].join(" ");
      return normalizeGroupText(searchable).includes(query);
    });
  }, [mailSearch, visibleItems]);

  const visibleRows = useMemo(
    () => buildMailboxDisplayRows(filteredVisibleItems, false),
    [filteredVisibleItems]
  );
  const chatListRows = useMemo(
    () => buildMailboxChatListRows(filteredVisibleItems, items),
    [filteredVisibleItems, items]
  );

  useEffect(() => {
    const availableGroupKeys = new Set(
      visibleRows.filter((row) => row.kind === "group").map((row) => row.key)
    );
    setExpandedGroupKeys((prev) => {
      const next = prev.filter((key) => availableGroupKeys.has(key));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleRows]);

  useEffect(() => {
    const nowMs = Date.now();
    const nextSnoozeMs = receivedItems.reduce<number | null>((next, item) => {
      const untilMs = item.snoozedUntilMs;
      if (typeof untilMs !== "number" || !Number.isFinite(untilMs) || untilMs <= nowMs) return next;
      return next === null ? untilMs : Math.min(next, untilMs);
    }, null);
    if (!nextSnoozeMs) return;

    const timeoutMs = Math.min(Math.max(nextSnoozeMs - nowMs + 500, 1000), 2_147_483_647);
    const timeoutId = window.setTimeout(() => setSnoozeNowMs(Date.now()), timeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [receivedItems, snoozeNowMs]);

  useEffect(() => {
    if (!composeModalOpen || !user) {
      composeSearchAbortRef.current?.abort();
      composeSearchAbortRef.current = null;
      setComposeSuggestions([]);
      setComposeSuggestionsLoading(false);
      return;
    }

    const query = composeRecipientQuery.trim();
    if (query.length < 2) {
      composeSearchAbortRef.current?.abort();
      composeSearchAbortRef.current = null;
      setComposeSuggestions([]);
      setComposeSuggestionsLoading(false);
      return;
    }

    composeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    composeSearchAbortRef.current = controller;
    const seq = ++composeLookupSeq.current;
    const normalizedQuery = normalizeRecipientSearch(query);
    const cacheKey = `${effectiveEmail}:${normalizedQuery}`;
    const exactCached = composeSearchCacheRef.current.get(cacheKey);
    if (exactCached) {
      setComposeSuggestions(exactCached);
      setComposeSuggestionsLoading(false);
      return () => controller.abort();
    }

    const cachedPrefix = [...composeSearchCacheRef.current.entries()]
      .filter(([key]) => key.startsWith(`${effectiveEmail}:`) && cacheKey.startsWith(key))
      .sort(([first], [second]) => second.length - first.length)[0]?.[1];
    const optimisticSuggestions = cachedPrefix?.filter((option) => {
      const searchable = normalizeRecipientSearch(`${option.name} ${option.email}`);
      return searchable.includes(normalizedQuery);
    }) ?? [];
    setComposeSuggestions(optimisticSuggestions);
    setComposeSuggestionsLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(query)}`,
          { method: "GET", signal: controller.signal }
        );
        if (seq !== composeLookupSeq.current) return;

        const rows = Array.isArray(payload?.users) ? payload.users : [];
        const nextSuggestions = rows
          .map((row): RecipientOption | null => {
            const email = normalizeEmail(row.email);
            if (!email) return null;
            const name =
              typeof row.name === "string" && row.name.trim().length > 0
                ? row.name.trim()
                : nameFromEmail(email);
            return {
              email,
              name,
              profileAvatar: normalizeProfileAvatar(row.profileAvatar),
            } satisfies RecipientOption;
          })
          .filter((row): row is RecipientOption => row !== null);
        composeSearchCacheRef.current.set(cacheKey, nextSuggestions);
        setComposeSuggestions(nextSuggestions);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Načtení našeptávání příjemce v poště selhalo:", err);
        if (seq !== composeLookupSeq.current) return;
        setComposeSuggestions([]);
      } finally {
        if (seq === composeLookupSeq.current) {
          setComposeSuggestionsLoading(false);
        }
      }
    }, 70);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      if (composeSearchAbortRef.current === controller) {
        composeSearchAbortRef.current = null;
      }
    };
  }, [composeModalOpen, composeRecipientQuery, effectiveEmail, user]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const activeConversationKey =
    previewItem && isStandardDirectMailboxItem(previewItem)
      ? directMessageConversationKey(previewItem)
      : "";
  const activeConversationId = previewItem
    ? mailboxMetadataText(previewItem, "conversationId")
    : "";
  const activeConversationIsGroup = Boolean(
    previewItem && isStandardDirectMailboxItem(previewItem) && isGroupMailboxItem(previewItem)
  );
  const chatPreviewOpen = Boolean(
    previewModalOpen && previewItem && isStandardDirectMailboxItem(previewItem)
  );

  useEffect(() => {
    if (!chatPreviewOpen) return;
    const scrollY = window.scrollY;
    const previousBody = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overscrollBehavior: document.body.style.overscrollBehavior,
    };
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBody.overflow;
      document.body.style.position = previousBody.position;
      document.body.style.top = previousBody.top;
      document.body.style.width = previousBody.width;
      document.body.style.overscrollBehavior = previousBody.overscrollBehavior;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [chatPreviewOpen]);

  useEffect(() => {
    if (!activeConversationKey || !activeConversationId) {
      setConversationHistory(null);
      return;
    }
    void loadConversationHistoryPage({
      conversationId: activeConversationId,
      key: activeConversationKey,
    });
  }, [activeConversationId, activeConversationKey, loadConversationHistoryPage]);

  const syncGroupConversation = useCallback((payload: MailboxConversationResponse) => {
    const conversationId = payload.conversationId ?? "";
    if (!conversationId) return;
    setGroupConversation(payload);
    const metadataUpdate = {
      groupName: payload.groupName ?? "Skupinová konverzace",
      groupOwnerEmail: payload.ownerEmail ?? "",
      participants: payload.participants ?? [],
      participantEmails: payload.participantEmails ?? [],
      groupMuted: payload.muted === true,
      groupActive: payload.active !== false,
    };
    const updateItem = (item: MailboxItem): MailboxItem =>
      mailboxMetadataText(item, "conversationId") === conversationId
        ? { ...item, metadata: { ...(item.metadata ?? {}), ...metadataUpdate } }
        : item;
    setItems((current) => current.map(updateItem));
    setConversationHistory((current) =>
      current ? { ...current, messages: current.messages.map(updateItem) } : current
    );
    setPreviewItem((current) => (current ? updateItem(current) : current));
  }, []);

  useEffect(() => {
    if (!user || !activeConversationId || !activeConversationIsGroup) {
      groupConversationLoadSequenceRef.current += 1;
      setGroupConversation(null);
      setGroupConversationLoading(false);
      setGroupConversationError(null);
      setGroupManagerOpen(false);
      return;
    }
    const sequence = ++groupConversationLoadSequenceRef.current;
    setGroupConversation(null);
    setGroupConversationLoading(true);
    setGroupConversationError(null);
    void fetchAuthedJsonOrThrow<MailboxConversationResponse>(
      user,
      `/api/mailbox/conversation?conversationId=${encodeURIComponent(activeConversationId)}`,
      { method: "GET" }
    )
      .then((payload) => {
        if (sequence !== groupConversationLoadSequenceRef.current) return;
        syncGroupConversation(payload);
      })
      .catch((cause) => {
        if (sequence !== groupConversationLoadSequenceRef.current) return;
        setGroupConversationError(
          cause instanceof Error ? cause.message : "Nastavení skupiny se nepodařilo načíst."
        );
      })
      .finally(() => {
        if (sequence === groupConversationLoadSequenceRef.current) {
          setGroupConversationLoading(false);
        }
      });
  }, [activeConversationId, activeConversationIsGroup, syncGroupConversation, user]);

  const selectedConversationMessages = useMemo(() => {
    if (!previewItem || !isStandardDirectMailboxItem(previewItem)) return [];
    const conversationKey = directMessageConversationKey(previewItem);
    const merged = new Map<string, MailboxItem>();
    const pagedHistoryActive = conversationHistory?.key === conversationKey;
    const newestPagedMessageMs = pagedHistoryActive
      ? conversationHistory.messages.reduce(
          (latest, message) => Math.max(latest, message.createdAtMs ?? 0),
          0
        )
      : 0;
    if (pagedHistoryActive) {
      conversationHistory.messages.forEach((message) => merged.set(message.id, message));
    }
    items.forEach((item) => {
      if (
        isStandardDirectMailboxItem(item) &&
        directMessageConversationKey(item) === conversationKey &&
        (!pagedHistoryActive ||
          conversationHistory.loading ||
          (item.createdAtMs ?? 0) >= newestPagedMessageMs)
      ) {
        merged.set(item.id, item);
      }
    });
    return [...merged.values()].sort(
      (a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0)
    );
  }, [conversationHistory, items, previewItem]);

  const loadOlderConversationMessages = useCallback(async () => {
    if (
      !conversationHistory?.hasMore ||
      conversationHistory.loadingOlder ||
      !conversationHistory.nextCursor ||
      !activeConversationId ||
      !activeConversationKey
    ) return;
    await loadConversationHistoryPage({
      conversationId: activeConversationId,
      key: activeConversationKey,
      cursor: conversationHistory.nextCursor,
      older: true,
    });
  }, [
    activeConversationId,
    activeConversationKey,
    conversationHistory,
    loadConversationHistoryPage,
  ]);

  const previewItemWithBlobAttachments = useMemo<MailboxItem | null>(() => {
    if (!previewItem) return null;
    if (previewItem.type !== "direct_message") return previewItem;
    const metadata = previewItem.metadata ?? {};
    if (!Array.isArray(metadata.attachments)) return previewItem;
    const attachments = metadata.attachments.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      const blobUrl = id ? previewAttachmentBlobUrls[id] : "";
      return blobUrl
        ? {
            ...row,
            url: blobUrl,
          }
        : row;
    });
    return {
      ...previewItem,
      metadata: {
        ...metadata,
        attachments,
      },
    };
  }, [previewAttachmentBlobUrls, previewItem]);

  const selectedConversationMessagesWithBlobAttachments = useMemo(
    () =>
      selectedConversationMessages.map((message) => {
        if (!Array.isArray(message.metadata?.attachments)) return message;
        return {
          ...message,
          metadata: {
            ...message.metadata,
            attachments: message.metadata.attachments.map((entry) => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
              const row = entry as Record<string, unknown>;
              const id = typeof row.id === "string" ? row.id.trim() : "";
              const blobUrl = id ? previewAttachmentBlobUrls[id] : "";
              return blobUrl ? { ...row, url: blobUrl } : row;
            }),
          },
        } satisfies MailboxItem;
      }),
    [previewAttachmentBlobUrls, selectedConversationMessages]
  );

  const chatThreadMessages = useMemo<MailboxItem[]>(() => {
    if (!previewItem || !isStandardDirectMailboxItem(previewItem)) {
      return selectedConversationMessagesWithBlobAttachments;
    }
    const conversationKey = directMessageConversationKey(previewItem);
    const loadedMessageIds = new Set(
      selectedConversationMessages.map((message) =>
        mailboxMetadataText(message, "messageId")
      )
    );
    const localMessages = quickReplyAttempts
      .filter(
        (attempt) =>
          attempt.conversationKey === conversationKey &&
          (!attempt.messageId || !loadedMessageIds.has(attempt.messageId))
      )
      .map<MailboxItem>((attempt) => ({
        id: attempt.clientId,
        type: "direct_message",
        title: attempt.subject,
        body: attempt.text || "Příloha bez textu.",
        deepLink: "/posta",
        read: true,
        createdAtMs: attempt.createdAtMs,
        readAtMs: attempt.createdAtMs,
        metadata: {
          mailboxDirection: "sent",
          senderEmail: effectiveEmail,
          senderName: user?.displayName || (effectiveEmail ? nameFromEmail(effectiveEmail) : "Ty"),
          recipientEmail: attempt.recipient.email,
          recipientName: attempt.recipient.name,
          ...(attempt.recipients && attempt.recipients.length > 1
            ? {
                recipientEmails: attempt.recipients.map((recipient) => recipient.email),
                participants: attempt.participants ?? attempt.recipients,
                participantEmails: (attempt.participants ?? attempt.recipients).map(
                  (participant) => participant.email
                ),
                groupConversation: true,
                groupName: attempt.groupName || "Skupinová konverzace",
              }
            : {}),
          ...(attempt.conversationId ? { conversationId: attempt.conversationId } : {}),
          messageText: attempt.text,
          ...(attempt.messageId ? { messageId: attempt.messageId } : {}),
          ...(attempt.deliveredAtMs ? { deliveredAtMs: attempt.deliveredAtMs } : {}),
        },
        clientDeliveryStatus: attempt.status,
        clientDeliveryError: attempt.error,
        clientAttachments: attempt.files.map((file, index) => ({
          id: `${attempt.clientId}-file-${index}`,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        })),
      }));
    return [...selectedConversationMessagesWithBlobAttachments, ...localMessages].sort(
      (a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0)
    );
  }, [
    effectiveEmail,
    previewItem,
    quickReplyAttempts,
    selectedConversationMessages,
    selectedConversationMessagesWithBlobAttachments,
    user?.displayName,
  ]);

  useEffect(() => {
    const loadedMessageIds = new Set(
      items.map((item) => mailboxMetadataText(item, "messageId")).filter(Boolean)
    );
    if (loadedMessageIds.size === 0) return;
    setQuickReplyAttempts((current) => {
      const next = current.filter(
        (attempt) => !attempt.messageId || !loadedMessageIds.has(attempt.messageId)
      );
      return next.length === current.length ? current : next;
    });
  }, [items]);

  const mailboxPreviewHtml = useMemo(() => {
    if (!previewItemWithBlobAttachments) return null;
    if (previewItemWithBlobAttachments.type === "production_export_share" && sharedExportPreviewHtml) {
      return sharedExportPreviewHtml;
    }
    return buildMailboxPreviewHtml(previewItemWithBlobAttachments);
  }, [previewItemWithBlobAttachments, sharedExportPreviewHtml]);
  const weeklyReportPreviewHref =
    previewItem?.type === "weekly_team_report"
      ? weeklyTeamReportHref(previewItem, true)
      : null;

  const loadChatAttachment = useCallback(async (
    messageId: string,
    attachment: MailboxAttachment
  ): Promise<string> => {
    if (!attachment.url.startsWith("/api/")) return attachment.url;
    if (!user) throw new Error("Pro načtení přílohy se znovu přihlas.");
    const cacheKey = `${messageId}:${attachment.id}`;
    const cached = attachmentBlobUrlCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const pending = attachmentLoadPromiseRef.current.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      let token = await user.getIdToken();
      let response = await fetch(attachment.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        token = await user.getIdToken(true);
        response = await fetch(attachment.url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!response.ok) throw new Error("Přílohu se nepodařilo načíst.");
      const objectUrl = URL.createObjectURL(await response.blob());
      attachmentBlobUrlCacheRef.current.set(cacheKey, objectUrl);
      previewAttachmentBlobUrlsRef.current.push(objectUrl);
      setPreviewAttachmentBlobUrls((current) => ({
        ...current,
        [attachment.id]: objectUrl,
      }));
      return objectUrl;
    })().finally(() => {
      attachmentLoadPromiseRef.current.delete(cacheKey);
    });
    attachmentLoadPromiseRef.current.set(cacheKey, request);
    return request;
  }, [user]);

  useEffect(() => {
    previewAttachmentBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewAttachmentBlobUrlsRef.current = [];
    setPreviewAttachmentBlobUrls({});

    attachmentBlobUrlCacheRef.current.clear();
    attachmentLoadPromiseRef.current.clear();

    if (
      !previewItem ||
      previewItem.type !== "direct_message" ||
      isStandardDirectMailboxItem(previewItem) ||
      !user
    ) return undefined;
    const attachmentItems = [previewItem];
    const attachmentMap = new Map(
      attachmentItems
        .flatMap((message) => parseMailboxAttachments(message))
        .filter((attachment) => attachment.url.startsWith("/api/"))
        .map((attachment) => [attachment.id, attachment] as const)
    );
    const attachments = [...attachmentMap.values()];
    if (attachments.length === 0) return undefined;

    let cancelled = false;
    const createdUrls: string[] = [];

    void (async () => {
      try {
        const token = await user.getIdToken();
        const entries = await Promise.all(
          attachments.map(async (attachment) => {
            const response = await fetch(attachment.url, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (!response.ok) return null;
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            createdUrls.push(objectUrl);
            return [attachment.id, objectUrl] as const;
          })
        );
        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        const nextUrls: Record<string, string> = {};
        entries.forEach((entry) => {
          if (!entry) return;
          nextUrls[entry[0]] = entry[1];
        });
        previewAttachmentBlobUrlsRef.current = createdUrls;
        setPreviewAttachmentBlobUrls(nextUrls);
      } catch {
        if (!cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          previewAttachmentBlobUrlsRef.current = [];
          setPreviewAttachmentBlobUrls({});
        }
      }
    })();

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
      if (previewAttachmentBlobUrlsRef.current === createdUrls) {
        previewAttachmentBlobUrlsRef.current = [];
      }
    };
  }, [previewItem, user]);

  const quickReplyRecipients = useMemo<RecipientOption[]>(() => {
    if (!previewItem || previewItem.type !== "direct_message") return [];
    if (isStandardDirectMailboxItem(previewItem)) {
      if (isGroupMailboxItem(previewItem)) {
        if (
          groupConversation?.conversationId !== activeConversationId ||
          groupConversation.active === false
        ) return [];
        return (groupConversation.participants ?? []).filter(
          (participant) => participant.email !== effectiveEmail
        );
      }
      const counterpart = directMessageCounterpart(previewItem);
      if (!counterpart.email || !EMAIL_RE.test(counterpart.email)) return [];
      return [counterpart];
    }
    if (isSentMailboxItem(previewItem)) return [];
    const metadata = previewItem.metadata ?? {};
    const senderEmail = normalizeEmail(metadata.senderEmail);
    if (!senderEmail || !EMAIL_RE.test(senderEmail)) return [];
    const senderName =
      typeof metadata.senderName === "string" && metadata.senderName.trim().length > 0
        ? metadata.senderName.trim()
        : nameFromEmail(senderEmail);
    return [{
      email: senderEmail,
      name: senderName,
    }];
  }, [activeConversationId, effectiveEmail, groupConversation, previewItem]);

  const quickReplyRecipient = useMemo<RecipientOption | null>(() => {
    if (quickReplyRecipients.length === 0 || !previewItem) return null;
    if (isGroupMailboxItem(previewItem)) {
      return {
        email: quickReplyRecipients[0]!.email,
        name:
          groupConversation?.groupName ||
          mailboxMetadataText(previewItem, "groupName") ||
          `Skupina (${quickReplyRecipients.length + 1})`,
      };
    }
    return quickReplyRecipients[0] ?? null;
  }, [groupConversation?.groupName, previewItem, quickReplyRecipients]);

  const quickReplyIsGroup = Boolean(previewItem && isGroupMailboxItem(previewItem));

  const quickReplyEnabled = Boolean(
    previewItem && isStandardDirectMailboxItem(previewItem) && quickReplyRecipient
  );

  const updateTypingState = useCallback(
    (typing: boolean) => {
      if (!user || !quickReplyRecipient || !quickReplyEnabled || quickReplyIsGroup) return;
      if (typingIdleTimerRef.current !== null) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }

      if (typing) {
        typingWasActiveRef.current = true;
        typingIdleTimerRef.current = window.setTimeout(() => {
          typingWasActiveRef.current = false;
          typingLastSentAtRef.current = 0;
          void fetchAuthedJsonOrThrow(user, "/api/mailbox/activity", {
            method: "POST",
            body: JSON.stringify({ email: quickReplyRecipient.email, typing: false }),
          }).catch(() => undefined);
        }, 6_000);
        const nowMs = Date.now();
        if (nowMs - typingLastSentAtRef.current < 2_500) return;
        typingLastSentAtRef.current = nowMs;
      } else {
        if (!typingWasActiveRef.current) return;
        typingWasActiveRef.current = false;
        typingLastSentAtRef.current = 0;
      }

      void fetchAuthedJsonOrThrow(user, "/api/mailbox/activity", {
        method: "POST",
        body: JSON.stringify({ email: quickReplyRecipient.email, typing }),
      }).catch(() => undefined);
    }, [quickReplyEnabled, quickReplyIsGroup, quickReplyRecipient, user]
  );

  useEffect(() => {
    if (!user || !quickReplyRecipient || !quickReplyEnabled || quickReplyIsGroup) {
      setChatActivity({ lastActiveAtMs: null, typing: false, checkedAtMs: 0 });
      return;
    }
    let cancelled = false;
    const loadActivity = async () => {
      try {
        const payload = await fetchAuthedJsonOrThrow<MailboxActivityResponse>(
          user,
          `/api/mailbox/activity?email=${encodeURIComponent(quickReplyRecipient.email)}`,
          { method: "GET" }
        );
        if (cancelled) return;
        setChatActivity({
          lastActiveAtMs:
            typeof payload.lastActiveAtMs === "number" && Number.isFinite(payload.lastActiveAtMs)
              ? payload.lastActiveAtMs
              : null,
          typing: payload.typing === true,
          checkedAtMs:
            typeof payload.serverNowMs === "number" && Number.isFinite(payload.serverNowMs)
              ? payload.serverNowMs
              : Date.now(),
        });
      } catch {
        if (!cancelled) {
          setChatActivity((current) => ({ ...current, typing: false, checkedAtMs: Date.now() }));
        }
      }
    };
    void loadActivity();
    const intervalId = window.setInterval(() => void loadActivity(), 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [quickReplyEnabled, quickReplyIsGroup, quickReplyRecipient, user]);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current !== null) window.clearTimeout(typingIdleTimerRef.current);
      updateTypingState(false);
    };
  }, [updateTypingState]);

  const chatPresence = useMemo(
    () => {
      if (quickReplyIsGroup && previewItem) {
        const count = groupConversation?.participants?.length ?? mailboxParticipants(previewItem).length;
        return {
          label: pluralCount(count, "účastník", "účastníci", "účastníků"),
          online: false,
          typing: false,
        };
      }
      return formatMailboxPresence({
        lastActiveAtMs: chatActivity.lastActiveAtMs,
        nowMs: chatActivity.checkedAtMs || Date.now(),
        typing: chatActivity.typing,
      });
    },
    [chatActivity, groupConversation?.participants?.length, previewItem, quickReplyIsGroup]
  );

  const closePreviewModal = () => {
    setGroupManagerOpen(false);
    previewAttachmentBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewAttachmentBlobUrlsRef.current = [];
    attachmentBlobUrlCacheRef.current.clear();
    attachmentLoadPromiseRef.current.clear();
    setPreviewAttachmentBlobUrls({});
    setPreviewItem(null);
    setPreviewModalOpen(false);
    setSharedExportPreviewHtml(null);
    setSharedExportPreviewLoading(false);
    setQuickReplyText("");
    setQuickReplyFiles([]);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    setQuickReplySubmitting(false);
  };

  const markItemsRead = useCallback(async (ids: string[]) => {
    const currentUser = auth.currentUser;
    const pendingIds = ids.filter((id) => !markingReadIdsRef.current.has(id));
    if (!currentUser || pendingIds.length === 0 || !mailboxScopeIsCurrent()) return;
    pendingIds.forEach((id) => markingReadIdsRef.current.add(id));
    setSaving(true);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify({ ids: pendingIds }),
        }
      );
      if (!mailboxScopeIsCurrent()) return;
      setItems((prev) =>
        prev.map((item) =>
          pendingIds.includes(item.id)
            ? { ...item, read: true, readAtMs: item.readAtMs ?? Date.now() }
            : item
        )
      );
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      }
    } catch (err: any) {
      setError(err?.message || "Nepodařilo se označit zprávu jako přečtenou.");
    } finally {
      pendingIds.forEach((id) => markingReadIdsRef.current.delete(id));
      setSaving(false);
    }
  }, [mailboxScopeIsCurrent]);

  useEffect(() => {
    if (!previewItem || !isStandardDirectMailboxItem(previewItem)) return;
    const unreadMessages = selectedConversationMessages.filter(
      (message) => !isSentMailboxItem(message) && !message.read
    );
    if (unreadMessages.length === 0) return;
    setConversationUnreadStartId((current) => current ?? unreadMessages[0]?.id ?? null);
    void markItemsRead(unreadMessages.map((message) => message.id));
  }, [markItemsRead, previewItem, selectedConversationMessages]);

  const markAllRead = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || unreadCount <= 0 || !mailboxScopeIsCurrent()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify({ markAllRead: true }),
        }
      );
      if (!mailboxScopeIsCurrent()) return;
      setItems((prev) => prev.map((item) => ({ ...item, read: true, readAtMs: item.readAtMs ?? Date.now() })));
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      } else {
        setUnreadCount(0);
      }
    } catch (err: any) {
      setError(err?.message || "Nepodařilo se označit zprávy jako přečtené.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMailboxItems = async (ids: string[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser || ids.length === 0 || !mailboxScopeIsCurrent()) return;

    setDeletingIds((prev) => [...new Set([...prev, ...ids])]);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxDeleteResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        }
      );
      if (!mailboxScopeIsCurrent()) return;
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      }
      if (previewItem && ids.includes(previewItem.id)) {
        closePreviewModal();
      }
    } catch (err: any) {
      setError(err?.message || "Nepodařilo se smazat zprávu.");
    } finally {
      setDeletingIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const snoozeMailboxItems = async (ids: string[], snoozeUntilMs: number | null) => {
    const currentUser = auth.currentUser;
    if (!currentUser || ids.length === 0 || !mailboxScopeIsCurrent()) return;

    setSnoozingIds((prev) => [...new Set([...prev, ...ids])]);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify(
            snoozeUntilMs
              ? { ids, snoozeUntilMs }
              : { ids, clearSnooze: true }
          ),
        }
      );
      if (!mailboxScopeIsCurrent()) return;
      const nowMs = Date.now();
      setSnoozeNowMs(nowMs);
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id)
            ? {
                ...item,
                snoozedUntilMs: snoozeUntilMs,
                snoozedAtMs: snoozeUntilMs ? nowMs : null,
              }
            : item
        )
      );
      if (previewItem && ids.includes(previewItem.id)) {
        setPreviewItem({
          ...previewItem,
          snoozedUntilMs: snoozeUntilMs,
          snoozedAtMs: snoozeUntilMs ? nowMs : null,
        });
      }
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (snoozeUntilMs ? "Nepodařilo se odložit zprávu." : "Nepodařilo se vrátit odloženou zprávu.")
      );
    } finally {
      setSnoozingIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const archiveMailboxItems = async (ids: string[], archived: boolean) => {
    const currentUser = auth.currentUser;
    if (!currentUser || ids.length === 0 || !mailboxScopeIsCurrent()) return;

    setArchivingIds((prev) => [...new Set([...prev, ...ids])]);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify({ ids, archived }),
        }
      );
      if (!mailboxScopeIsCurrent()) return;
      const nowMs = Date.now();
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id)
            ? {
                ...item,
                archivedAtMs: archived ? nowMs : null,
                snoozedUntilMs: archived ? null : item.snoozedUntilMs,
                snoozedAtMs: archived ? null : item.snoozedAtMs,
              }
            : item
        )
      );
      if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
        setUnreadCount(Math.max(0, Math.floor(payload.unreadCount)));
      }
    } catch (err: any) {
      setError(err?.message || (archived ? "Nepodařilo se archivovat zprávu." : "Nepodařilo se vrátit zprávu z archivu."));
    } finally {
      setArchivingIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const archivePreviewItem = async (archived: boolean) => {
    if (!previewItem) return;
    const ids = isStandardDirectMailboxItem(previewItem)
      ? items
          .filter(
            (item) =>
              isStandardDirectMailboxItem(item) &&
              directMessageConversationKey(item) ===
                directMessageConversationKey(previewItem)
          )
          .map((item) => item.id)
      : [previewItem.id];
    await archiveMailboxItems(ids, archived);
    closePreviewModal();
  };

  const deletePreviewItem = async () => {
    if (!previewItem) return;
    const ids = isStandardDirectMailboxItem(previewItem)
      ? items
          .filter(
            (item) =>
              isStandardDirectMailboxItem(item) &&
              directMessageConversationKey(item) ===
                directMessageConversationKey(previewItem)
          )
          .map((item) => item.id)
      : [previewItem.id];
    await deleteMailboxItems(ids);
    closePreviewModal();
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const visibleItemIds = useMemo(
    () => filteredVisibleItems.map((item) => item.id),
    [filteredVisibleItems]
  );
  const selectedVisibleCount = useMemo(
    () => selectedIds.filter((id) => visibleItemIds.includes(id)).length,
    [selectedIds, visibleItemIds]
  );
  const allVisibleSelected =
    filteredVisibleItems.length > 0 && selectedVisibleCount === filteredVisibleItems.length;

  const toggleExpandedGroup = (key: string) => {
    setExpandedGroupKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const renderMailboxItemCard = (item: MailboxItem, index: number) => {
    const isSent = isSentMailboxItem(item);
    const isTipsterTip = isTipsterTipMailboxItem(item);
    const sentTo = isSent ? sentRecipientText(item) : "";
    const deleting = deletingIds.includes(item.id);
    const snoozed = isMailboxSnoozed(item);
    const archived = isMailboxArchived(item);
    const snoozing = snoozingIds.includes(item.id);
    const archiving = archivingIds.includes(item.id);
    const attachments = item.type === "direct_message" ? parseMailboxAttachments(item) : [];
    const isDirectMessage = item.type === "direct_message";
    const itemTitle = isTipsterTip ? tipsterTipListTitle(item) : item.title;
    const itemBody = isTipsterTip ? tipsterTipSenderText(item) : item.body;
    const senderName = mailboxMetadataText(item, "senderName");
    const senderEmail = mailboxMetadataText(item, "senderEmail");
    const correspondent = isSent
      ? sentTo || "Odeslaná zpráva"
      : isDirectMessage
      ? senderName || (senderEmail ? nameFromEmail(senderEmail) : "Kolega")
      : "Bohemka.App";
    const selected = previewItem?.id === item.id;

    return (
      <div
        key={item.id}
        className={`${styles.mailCard} ${styles.mailItemCard} group relative w-full border-b border-slate-200/80 text-left transition focus-within:z-40 ${
          archived
            ? "bg-slate-50/80 hover:bg-slate-100"
          : isTipsterTip
            ? "bg-violet-50/55 hover:bg-violet-50"
          : selected
            ? "bg-violet-100/80 shadow-[inset_4px_0_0_#6d28d9]"
          : item.read
            ? "bg-white hover:bg-slate-50"
            : "bg-violet-50/70 hover:bg-violet-100/70"
        }`}
        style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
      >
        <button
          type="button"
          onClick={() => {
            if (selectMode) {
              toggleSelected(item.id);
              return;
            }
            void openItem(item);
          }}
          className="flex w-full min-w-0 items-start gap-3 px-3 py-3 pr-12 text-left sm:px-4"
        >
          {selectMode ? (
            <span
              className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                selectedIds.includes(item.id)
                  ? "border-violet-700 bg-violet-700 text-white"
                  : "border-slate-300 bg-white text-transparent"
              }`}
            >
              ✓
            </span>
          ) : (
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isDirectMessage
                  ? "bg-sky-100 text-sky-700"
                  : item.read
                  ? "bg-slate-100 text-slate-500"
                  : "bg-violet-100 text-violet-700"
              }`}
            >
              {isDirectMessage ? <Mail className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2 pr-20">
              <span className={`truncate text-sm ${item.read ? "font-semibold text-slate-700" : "font-bold text-slate-950"}`}>
                {correspondent}
              </span>
              {!item.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-violet-600" /> : null}
            </span>
            <span className={`mt-0.5 block truncate text-sm ${item.read ? "font-medium text-slate-700" : "font-bold text-slate-950"}`}>
              {itemTitle}
            </span>
            <span className="mt-0.5 block truncate text-xs leading-5 text-slate-500">{itemBody}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${isDirectMessage ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                {isDirectMessage ? "Zpráva" : "Notifikace"}
              </span>
              {attachments.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <Paperclip className="h-3 w-3" />
                  {attachments.length}
                </span>
              ) : null}
              {isTipsterTip ? <span className="text-[10px] font-bold uppercase text-violet-700">Tip</span> : null}
              {archived ? <span className="text-[10px] font-bold uppercase text-slate-500">Archiv</span> : null}
              {snoozed ? <span className="text-[10px] font-semibold text-violet-700">{formatSnoozedUntil(item)}</span> : null}
            </span>
          </span>
          <span className="shrink-0 pt-0.5 text-[11px] font-medium text-slate-500">
            {formatMailboxListDate(item.createdAtMs)}
          </span>
        </button>

        {!selectMode ? (
          <div className="absolute right-3 top-9 z-10 opacity-70 transition group-hover:opacity-100">
              <MailboxActionMenu label={`Další akce: ${itemTitle}`}>
                {archived ? (
                  <button
                    type="button"
                    onClick={() => void archiveMailboxItems([item.id], false)}
                    disabled={archiving}
                    className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Vrátit z archivu
                  </button>
                ) : null}
                {!isSent && !archived ? snoozed ? (
                  <button
                    type="button"
                    onClick={() => void snoozeMailboxItems([item.id], null)}
                    disabled={snoozing}
                    className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Zrušit připomenutí
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void snoozeMailboxItems([item.id], snoozeUntilAfterDays(1))}
                      disabled={snoozing}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                    >
                      Připomenout zítra
                    </button>
                    <button
                      type="button"
                      onClick={() => void snoozeMailboxItems([item.id], snoozeUntilAfterDays(7))}
                      disabled={snoozing}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                    >
                      Připomenout za týden
                    </button>
                  </>
                ) : null}
                {!archived ? (
                  <button
                    type="button"
                    onClick={() => void archiveMailboxItems([item.id], true)}
                    disabled={archiving}
                    className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archivovat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void deleteMailboxItems([item.id])}
                  disabled={deleting}
                  className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Mažu…" : "Smazat"}
                </button>
              </MailboxActionMenu>
          </div>
        ) : null}
      </div>
    );
  };

  const renderChatConversationCard = (
    row: Extract<MailboxChatListRow, { kind: "conversation" }>,
    index: number
  ) => {
    const latest = row.latestItem;
    const conversationItems = items.filter(
      (item) =>
        isStandardDirectMailboxItem(item) &&
        directMessageConversationKey(item) === row.key
    );
    const conversationIds = conversationItems.map((item) => item.id);
    const selected = Boolean(
      previewItem &&
        isStandardDirectMailboxItem(previewItem) &&
        directMessageConversationKey(previewItem) === row.key
    );
    const latestSent = isSentMailboxItem(latest);
    const groupConversation = isGroupMailboxItem(latest);
    const archived = conversationItems.length > 0 && conversationItems.every(isMailboxArchived);
    const snoozed = conversationItems.length > 0 && conversationItems.every((item) => isMailboxSnoozed(item));
    const archiving = conversationIds.some((id) => archivingIds.includes(id));
    const deleting = conversationIds.some((id) => deletingIds.includes(id));
    const snoozing = conversationIds.some((id) => snoozingIds.includes(id));

    return (
      <div
        key={row.key}
        className={`${styles.mailCard} group relative border-b border-slate-200/80 transition focus-within:z-[60] ${
          selected
            ? "bg-violet-100/80 shadow-[inset_4px_0_0_#6d28d9]"
            : row.unreadCount > 0
            ? "bg-violet-50/70 hover:bg-violet-100/70"
            : "bg-white hover:bg-slate-50"
        }`}
        style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
      >
        <button
          type="button"
          onClick={() => {
            if (selectMode) {
              setSelectedIds((current) => {
                const allSelected = conversationIds.every((id) => current.includes(id));
                return allSelected
                  ? current.filter((id) => !conversationIds.includes(id))
                  : [...new Set([...current, ...conversationIds])];
              });
              return;
            }
            void openItem(latest);
          }}
          className="flex w-full min-w-0 items-start gap-3 px-3 py-3.5 pr-12 text-left sm:px-4"
        >
          {selectMode ? (
            <span
              className={`mt-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                conversationIds.some((id) => selectedIds.includes(id))
                  ? "border-violet-700 bg-violet-700 text-white"
                  : "border-slate-300 bg-white text-transparent"
              }`}
            >
              ✓
            </span>
          ) : (
            <span className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-inner ring-1 ring-slate-200 ${groupConversation ? "bg-violet-100 text-violet-700" : "bg-white"}`}>
              {groupConversation ? (
                <UsersRound className="h-5 w-5" />
              ) : (
                <ProfileAvatar
                  src={row.counterpartAvatar}
                  name={row.counterpartName}
                  className="h-full w-full rounded-2xl text-[2.75rem]"
                  fallbackClassName="bg-sky-100 text-sky-700"
                  sizes="44px"
                />
              )}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2 pr-16">
              <span className={`truncate text-sm ${row.unreadCount > 0 ? "font-bold text-slate-950" : "font-semibold text-slate-700"}`}>
                {row.counterpartName}
              </span>
              {row.totalMessageCount > 1 ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {row.totalMessageCount}
                </span>
              ) : null}
              {row.unreadCount > 0 ? (
                <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-violet-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {row.unreadCount}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-slate-700">
              {latestSent ? "Ty: " : ""}{latest.title}
            </span>
            <span className="mt-0.5 block truncate text-xs leading-5 text-slate-500">
              {latestSent ? "Ty: " : ""}{mailboxMetadataText(latest, "messageText") || latest.body}
            </span>
          </span>
          <span className="shrink-0 pt-0.5 text-[11px] font-medium text-slate-500">
            {formatMailboxListDate(latest.createdAtMs)}
          </span>
        </button>

        {!selectMode ? (
          <div className="absolute right-3 top-10 z-10 opacity-70 transition group-hover:opacity-100">
            <MailboxActionMenu label={`Další akce: konverzace s ${row.counterpartName}`}>
              {archived ? (
                <button type="button" onClick={() => void archiveMailboxItems(conversationIds, false)} disabled={archiving} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50">
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Vrátit z archivu
                </button>
              ) : (
                <button type="button" onClick={() => void archiveMailboxItems(conversationIds, true)} disabled={archiving} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50">
                  <Archive className="h-3.5 w-3.5" />
                  Archivovat konverzaci
                </button>
              )}
              {!archived ? (
                snoozed ? (
                  <button type="button" onClick={() => void snoozeMailboxItems(conversationIds, null)} disabled={snoozing} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Zrušit připomenutí
                  </button>
                ) : (
                  <button type="button" onClick={() => void snoozeMailboxItems(conversationIds, snoozeUntilAfterDays(1))} disabled={snoozing} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50">
                    <Clock3 className="h-3.5 w-3.5" />
                    Připomenout zítra
                  </button>
                )
              ) : null}
              <button type="button" onClick={() => void deleteMailboxItems(conversationIds)} disabled={deleting} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Mažu…" : "Smazat konverzaci"}
              </button>
            </MailboxActionMenu>
          </div>
        ) : null}
      </div>
    );
  };

  const toggleSelectAllVisible = () => {
    if (filteredVisibleItems.length === 0) return;
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleItemIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleItemIds])]);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    await deleteMailboxItems(idsToDelete);
    setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
  };

  const openComposeModal = () => {
    composeLookupSeq.current += 1;
    setComposeModalOpen(true);
    setComposeGroupMode(false);
    setComposeErrorText(null);
    setComposeRecipientQuery("");
    setComposeSelectedRecipients([]);
    setComposeSuggestions([]);
    setComposeSuggestionsLoading(false);
  };

  const closeComposeModal = (force = false) => {
    if (composeSubmitting && !force) return;
    composeLookupSeq.current += 1;
    setComposeModalOpen(false);
    setComposeGroupMode(false);
    setComposeErrorText(null);
    setComposeSuggestions([]);
    setComposeSuggestionsLoading(false);
    setComposeSelectedRecipients([]);
    setComposeRecipientQuery("");
  };

  const handleSelectComposeSuggestion = (recipient: RecipientOption) => {
    setComposeSelectedRecipients((current) =>
      current.some((item) => item.email === recipient.email)
        ? current
        : [...current, recipient].slice(0, 11)
    );
    setComposeRecipientQuery("");
    setComposeSuggestions([]);
    setComposeErrorText(null);
  };

  const removeComposeRecipient = (email: string) => {
    setComposeSelectedRecipients((current) =>
      current.filter((recipient) => recipient.email !== email)
    );
    setComposeErrorText(null);
  };

  const handleQuickReplyFilesChange = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const current = new Map(quickReplyFiles.map((file) => [localFileKey(file), file]));
    Array.from(list).forEach((file) => {
      current.set(localFileKey(file), file);
    });
    setQuickReplyFiles([...current.values()].slice(0, COMPOSE_FILES_MAX_COUNT));
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
  };

  const removeQuickReplyFile = (target: File | string) => {
    const targetKey = typeof target === "string" ? target : localFileKey(target);
    setQuickReplyFiles((prev) => prev.filter((file) => localFileKey(file) !== targetKey));
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
  };

  const submitQuickReplyAttempt = async (attempt: QuickReplyAttempt) => {
    if (!user || !mailboxScopeIsCurrent() || quickReplySubmitting) return;
    const formData = new FormData();
    formData.set("clientRequestId", attempt.clientRequestId);
    const attemptRecipients = attempt.recipients ?? [attempt.recipient];
    formData.set("recipientEmail", attempt.recipient.email);
    if (attemptRecipients.length > 1) {
      formData.set(
        "recipientEmailsJson",
        JSON.stringify(attemptRecipients.map((recipient) => recipient.email))
      );
      if (attempt.groupName) formData.set("groupName", attempt.groupName);
      if (attempt.conversationId) formData.set("conversationId", attempt.conversationId);
    }
    formData.set("subject", attempt.subject);
    formData.set("text", attempt.text);
    attempt.files.forEach((file) => {
      formData.append("files", file);
    });

    setQuickReplySubmitting(true);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    setQuickReplyAttempts((current) =>
      current.map((item) =>
        item.clientId === attempt.clientId
          ? { ...item, status: "sending", error: undefined }
          : item
      )
    );
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxComposeResponse>(
        user,
        "/api/mailbox/compose",
        {
          method: "POST",
          body: formData,
        }
      );
      if (!mailboxScopeIsCurrent()) return;
      const deliveredAtMs =
        typeof payload.deliveredAtMs === "number" && Number.isFinite(payload.deliveredAtMs)
          ? payload.deliveredAtMs
          : Date.now();
      setQuickReplyAttempts((current) =>
        current.map((item) =>
          item.clientId === attempt.clientId
            ? {
                ...item,
                status: "delivered",
                error: undefined,
                messageId: payload.messageId,
                deliveredAtMs,
              }
            : item
        )
      );
      setQuickReplySuccessText("Zpráva byla doručena.");
      await loadMailbox({ silent: true });
    } catch (err: any) {
      const errorText = err?.message || "Zprávu se nepodařilo odeslat.";
      setQuickReplyAttempts((current) =>
        current.map((item) =>
          item.clientId === attempt.clientId
            ? { ...item, status: "failed", error: errorText }
            : item
        )
      );
      setQuickReplyErrorText("Zprávu se nepodařilo odeslat. Můžeš to zkusit znovu u bubliny.");
    } finally {
      setQuickReplySubmitting(false);
    }
  };

  const handleQuickReplySend = () => {
    if (
      !user ||
      !previewItem ||
      previewItem.type !== "direct_message" ||
      !mailboxScopeIsCurrent()
    ) return;
    if (!quickReplyRecipient) {
      setQuickReplyErrorText("U této zprávy nejde určit odesílatele.");
      return;
    }

    const messageText = quickReplyText.trim();
    if (!messageText && quickReplyFiles.length === 0) {
      setQuickReplyErrorText("Napiš text odpovědi nebo přilož soubor.");
      return;
    }

    const attempt: QuickReplyAttempt = {
      clientId: `pending-${createClientRequestId()}`,
      clientRequestId: createClientRequestId(),
      conversationKey: directMessageConversationKey(previewItem),
      recipient: quickReplyRecipient,
      recipients: quickReplyRecipients,
      groupName: quickReplyIsGroup
        ? groupConversation?.groupName || mailboxMetadataText(previewItem, "groupName") || quickReplyRecipient.name
        : undefined,
      conversationId: mailboxMetadataText(previewItem, "conversationId") || undefined,
      participants: quickReplyIsGroup
        ? groupConversation?.participants ?? mailboxParticipants(previewItem)
        : undefined,
      subject: (previewItem.metadata?.chatDraft === true
        ? "Zpráva"
        : toReplySubject(previewItem.title)
      ).slice(0, COMPOSE_SUBJECT_MAX_LEN),
      text: messageText.slice(0, COMPOSE_MESSAGE_MAX_LEN),
      files: [...quickReplyFiles],
      createdAtMs: Date.now(),
      status: "sending",
    };
    setQuickReplyAttempts((current) => [...current, attempt]);
    setQuickReplyText("");
    setQuickReplyFiles([]);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    updateTypingState(false);
    void submitQuickReplyAttempt(attempt);
  };

  const retryQuickReply = (clientId: string) => {
    const attempt = quickReplyAttempts.find((item) => item.clientId === clientId);
    if (!attempt || attempt.status !== "failed") return;
    void submitQuickReplyAttempt(attempt);
  };

  const handleToggleGroupMute = useCallback(async () => {
    if (
      !user ||
      !activeConversationId ||
      groupConversation?.conversationId !== activeConversationId ||
      groupConversation.active === false ||
      groupMuteSaving
    ) return;
    setGroupMuteSaving(true);
    setGroupConversationError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxConversationResponse>(
        user,
        "/api/mailbox/conversation",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeConversationId,
            action: "mute",
            muted: groupConversation.muted !== true,
          }),
        }
      );
      syncGroupConversation(payload);
    } catch (cause) {
      setGroupConversationError(
        cause instanceof Error ? cause.message : "Ztlumení skupiny se nepodařilo změnit."
      );
    } finally {
      setGroupMuteSaving(false);
    }
  }, [
    activeConversationId,
    groupConversation,
    groupMuteSaving,
    syncGroupConversation,
    user,
  ]);

  const handleMessageReaction = async (messageId: string, emoji: string) => {
    if (!user || !mailboxScopeIsCurrent()) return;
    const payload = await fetchAuthedJsonOrThrow<MailboxMessageMutationResponse>(
      user,
      "/api/mailbox/message",
      {
        method: "POST",
        body: JSON.stringify({ id: messageId, emoji }),
      }
    );
    const reactions = Array.isArray(payload.reactions) ? payload.reactions : [];
    setItems((current) =>
      current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              metadata: { ...(item.metadata ?? {}), reactions },
            }
          : item
      )
    );
    setConversationHistory((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((item) =>
              item.id === messageId
                ? { ...item, metadata: { ...(item.metadata ?? {}), reactions } }
                : item
            ),
          }
        : current
    );
    setPreviewItem((current) =>
      current?.id === messageId
        ? { ...current, metadata: { ...(current.metadata ?? {}), reactions } }
        : current
    );
  };

  const handleEditOwnMessage = async (messageId: string, nextText: string) => {
    if (!user || !mailboxScopeIsCurrent()) return;
    const payload = await fetchAuthedJsonOrThrow<MailboxMessageMutationResponse>(
      user,
      "/api/mailbox/message",
      {
        method: "PATCH",
        body: JSON.stringify({ id: messageId, text: nextText }),
      }
    );
    const text = typeof payload.text === "string" ? payload.text : nextText.trim();
    const editedAtMs =
      typeof payload.editedAtMs === "number" && Number.isFinite(payload.editedAtMs)
        ? payload.editedAtMs
        : Date.now();
    const updateItem = (item: MailboxItem): MailboxItem => ({
      ...item,
      body: text || "Příloha bez textu.",
      metadata: {
        ...(item.metadata ?? {}),
        messageText: text,
        editedAtMs,
      },
    });
    setItems((current) =>
      current.map((item) => item.id === messageId ? updateItem(item) : item)
    );
    setConversationHistory((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((item) =>
              item.id === messageId ? updateItem(item) : item
            ),
          }
        : current
    );
    setPreviewItem((current) =>
      current?.id === messageId ? updateItem(current) : current
    );
  };

  const handleDeleteOwnMessage = async (messageId: string) => {
    if (!user || !mailboxScopeIsCurrent()) return;
    const deletedMessage = items.find((item) => item.id === messageId) ?? null;
    await fetchAuthedJsonOrThrow<MailboxMessageMutationResponse>(
      user,
      "/api/mailbox/message",
      {
        method: "DELETE",
        body: JSON.stringify({ id: messageId }),
      }
    );
    const remainingItems = items.filter((item) => item.id !== messageId);
    setItems((current) => current.filter((item) => item.id !== messageId));
    setConversationHistory((current) =>
      current
        ? {
            ...current,
            messages: current.messages.filter((item) => item.id !== messageId),
          }
        : current
    );
    setPreviewItem((current) => {
      if (current?.id !== messageId || !deletedMessage) return current;
      if (!isStandardDirectMailboxItem(deletedMessage)) return null;
      const conversationKey = directMessageConversationKey(deletedMessage);
      return remainingItems
        .filter(
          (item) =>
            isStandardDirectMailboxItem(item) &&
            directMessageConversationKey(item) === conversationKey
        )
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))[0] ?? null;
    });
  };

  const handleToggleMessagePin = async (messageId: string, pinned: boolean) => {
    if (!user || !mailboxScopeIsCurrent()) return;
    const payload = await fetchAuthedJsonOrThrow<MailboxMessageMutationResponse>(
      user,
      "/api/mailbox/message",
      {
        method: "PATCH",
        body: JSON.stringify({ id: messageId, action: "pin", pinned }),
      }
    );
    const pinnedAtMs = pinned
      ? typeof payload.pinnedAtMs === "number" && Number.isFinite(payload.pinnedAtMs)
        ? payload.pinnedAtMs
        : Date.now()
      : null;
    const update = (item: MailboxItem): MailboxItem => ({ ...item, pinnedAtMs });
    setItems((current) =>
      current.map((item) => item.id === messageId ? update(item) : item)
    );
    setConversationHistory((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((item) =>
              item.id === messageId ? update(item) : item
            ),
          }
        : current
    );
    setPreviewItem((current) => current?.id === messageId ? update(current) : current);
  };

  const handleSetMessageReminder = async (
    messageId: string,
    remindAtMs: number | null
  ) => {
    if (!user || !mailboxScopeIsCurrent()) return;
    const payload = await fetchAuthedJsonOrThrow<MailboxMessageMutationResponse>(
      user,
      "/api/mailbox/message",
      {
        method: "PATCH",
        body: JSON.stringify({ id: messageId, action: "reminder", remindAtMs }),
      }
    );
    const nextReminderAtMs =
      typeof payload.replyReminderAtMs === "number" &&
      Number.isFinite(payload.replyReminderAtMs)
        ? payload.replyReminderAtMs
        : null;
    const nextSetAtMs =
      typeof payload.replyReminderSetAtMs === "number" &&
      Number.isFinite(payload.replyReminderSetAtMs)
        ? payload.replyReminderSetAtMs
        : null;
    const update = (item: MailboxItem): MailboxItem => ({
      ...item,
      replyReminderAtMs: nextReminderAtMs,
      replyReminderSetAtMs: nextSetAtMs,
    });
    setItems((current) =>
      current.map((item) => item.id === messageId ? update(item) : item)
    );
    setConversationHistory((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((item) =>
              item.id === messageId ? update(item) : item
            ),
          }
        : current
    );
    setPreviewItem((current) => current?.id === messageId ? update(current) : current);
  };

  const handleComposeSend = async () => {
    if (!user || !mailboxScopeIsCurrent() || !composeGroupMode) return;

    const recipients = [...composeSelectedRecipients];
    if (recipients.length < 2) {
      setComposeErrorText("Pro skupinu vyber alespoň dva další členy.");
      return;
    }

    const groupName =
      recipients.length <= 3
        ? recipients.map((recipient) => recipient.name).join(", ")
        : `${recipients.slice(0, 2).map((recipient) => recipient.name).join(", ")} +${recipients.length - 2}`;

    const formData = new FormData();
    formData.set("clientRequestId", createClientRequestId());
    formData.set("recipientEmail", recipients[0]!.email);
    formData.set(
      "recipientEmailsJson",
      JSON.stringify(recipients.map((recipient) => recipient.email))
    );
    formData.set("groupName", groupName.slice(0, 80));
    formData.set("subject", groupName.slice(0, COMPOSE_SUBJECT_MAX_LEN));
    formData.set("createGroupOnly", "true");

    setComposeSubmitting(true);
    setComposeErrorText(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxComposeResponse>(user, "/api/mailbox/compose", {
        method: "POST",
        body: formData,
      });
      if (!mailboxScopeIsCurrent()) return;
      const conversationId = typeof payload.conversationId === "string"
        ? payload.conversationId.trim()
        : "";
      const messageId = payload.senderMailboxId || payload.messageId || "";
      if (!conversationId || !messageId) {
        throw new Error("Skupina byla vytvořena, ale nepodařilo se ji otevřít.");
      }
      const createdAtMs = payload.deliveredAtMs ?? Date.now();
      const resolvedGroupName = payload.groupName?.trim() || groupName;
      const senderName = user.displayName?.trim() || nameFromEmail(effectiveEmail);
      const participants = [
        { email: effectiveEmail, name: senderName },
        ...recipients,
      ];
      const createdGroupItem: MailboxItem = {
        id: messageId,
        type: "direct_message",
        title: resolvedGroupName,
        body: "Skupina byla vytvořena.",
        deepLink: "/posta",
        read: true,
        createdAtMs,
        readAtMs: createdAtMs,
        metadata: {
          messageId,
          conversationId,
          groupConversation: true,
          groupCreatedEvent: true,
          groupName: resolvedGroupName,
          groupOwnerEmail: effectiveEmail,
          senderEmail: effectiveEmail,
          senderName,
          recipientEmail: recipients[0]!.email,
          recipientName: recipients[0]!.name,
          recipientEmails: recipients.map((recipient) => recipient.email),
          participants,
          participantEmails: participants.map((participant) => participant.email),
          mailboxDirection: "sent",
          messageText: "Skupina byla vytvořena.",
          deliveredAtMs: createdAtMs,
        },
      };
      closeComposeModal(true);
      await loadMailbox();
      await openItem(createdGroupItem);
    } catch (err: any) {
      setComposeErrorText(err?.message || "Skupinu se nepodařilo vytvořit.");
    } finally {
      setComposeSubmitting(false);
    }
  };

  const openItem = async (item: MailboxItem) => {
    if (isStandardDirectMailboxItem(item)) {
      const conversationKey = directMessageConversationKey(item);
      const unreadConversationMessages = items
        .filter(
          (message) =>
            isStandardDirectMailboxItem(message) &&
            !isSentMailboxItem(message) &&
            !message.read &&
            directMessageConversationKey(message) === conversationKey
        )
        .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
      setConversationUnreadStartId(unreadConversationMessages[0]?.id ?? null);
    } else {
      setConversationUnreadStartId(null);
      if (!item.read) void markItemsRead([item.id]);
    }
    if (isTipsterTipMailboxItem(item)) {
      const detailId = tipsterTipDetailId(item);
      if (detailId) {
        router.push(`/tipy/${encodeURIComponent(detailId)}`);
        return;
      }
    }
    setQuickReplyText("");
    setQuickReplyFiles([]);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    const openAsModal =
      typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches;
    if (item.type === "weekly_team_report") {
      if (openAsModal) {
        router.push(weeklyTeamReportHref(item));
        return;
      }
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      setPreviewModalOpen(false);
      return;
    }
    if (item.type === "direct_message") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      setPreviewModalOpen(openAsModal);
      return;
    }
    if (item.type === "online_card_meeting_request") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      setPreviewModalOpen(openAsModal);
      return;
    }
    if (item.type === "production_plan_share") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      setPreviewModalOpen(openAsModal);
      return;
    }
    if (item.type === "production_export_share") {
      setPreviewItem(item);
      setPreviewModalOpen(openAsModal);
      setSharedExportPreviewHtml(null);
      const payloadId =
        item.metadata && typeof item.metadata.payloadId === "string"
          ? item.metadata.payloadId.trim()
          : "";
      if (!payloadId) {
        setSharedExportPreviewLoading(false);
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setSharedExportPreviewLoading(false);
        return;
      }

      setSharedExportPreviewLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<MailboxSharedPreviewResponse>(
          currentUser,
          `/api/mailbox/shared-preview?payloadId=${encodeURIComponent(payloadId)}`,
          { method: "GET" }
        );
        const html = typeof payload?.html === "string" ? payload.html : "";
        if (html.trim()) {
          setSharedExportPreviewHtml(html);
        }
      } catch (err) {
        console.error("Načtení 1:1 sdíleného náhledu exportu selhalo:", err);
      } finally {
        setSharedExportPreviewLoading(false);
      }
      return;
    }
    window.location.href = item.deepLink || "/nastaveni";
  };

  const openChatWithRecipient = async (recipient: RecipientOption) => {
    if (!effectiveEmail) return;
    setComposeErrorText(null);
    const recipientEmail = normalizeEmail(recipient.email);
    const existingConversation = items
      .filter(
        (item) =>
          isStandardDirectMailboxItem(item) &&
          !isGroupMailboxItem(item) &&
          directMessageCounterpart(item).email === recipientEmail
      )
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))[0];
    if (existingConversation) {
      closeComposeModal(true);
      await openItem(existingConversation);
      return;
    }

    try {
      const conversationId = await createDirectConversationId(effectiveEmail, recipientEmail);
      const draftItem: MailboxItem = {
        id: `draft-${conversationId}`,
        type: "direct_message",
        title: "Zpráva",
        body: "",
        deepLink: "/posta",
        read: true,
        createdAtMs: null,
        readAtMs: null,
        metadata: {
          chatDraft: true,
          conversationId,
          mailboxDirection: "sent",
          senderEmail: effectiveEmail,
          senderName: nameFromEmail(effectiveEmail),
          recipientEmail,
          recipientName: recipient.name,
          messageText: "",
        },
      };
      closeComposeModal(true);
      setConversationUnreadStartId(null);
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(draftItem);
      setPreviewModalOpen(
        typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches
      );
    } catch (cause) {
      setComposeErrorText(
        cause instanceof Error ? cause.message : "Konverzaci se nepodařilo otevřít."
      );
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const messageId = (params.get("messageId") || "").trim();
    pendingDeepLinkMessageIdRef.current = messageId;
  }, []);

  useEffect(() => {
    const messageId = pendingDeepLinkMessageIdRef.current;
    if (!messageId) return;
    if (openedDeepLinkMessageIdRef.current === messageId) return;
    const targetItem = items.find((item) => item.id === messageId);
    if (!targetItem) return;

    openedDeepLinkMessageIdRef.current = messageId;
    void openItem(targetItem);

    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("messageId");
      const nextHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      window.history.replaceState({}, "", nextHref);
    }
    // `openItem` here intentionally follows current render state; guard refs prevent duplicate opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (!previewItem) return;
    setQuickReplyText("");
    setQuickReplyFiles([]);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    setQuickReplySubmitting(false);
  }, [previewItem]);

  useEffect(() => {
    if (!previewItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewModalOpen(false);
        setPreviewItem(null);
        setSharedExportPreviewHtml(null);
        setSharedExportPreviewLoading(false);
        setQuickReplyText("");
        setQuickReplyFiles([]);
        setQuickReplyErrorText(null);
        setQuickReplySuccessText(null);
        setQuickReplySubmitting(false);
        previewAttachmentBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        previewAttachmentBlobUrlsRef.current = [];
        attachmentBlobUrlCacheRef.current.clear();
        attachmentLoadPromiseRef.current.clear();
        setPreviewAttachmentBlobUrls({});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewItem]);

  useEffect(() => {
    if (!composeModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (composeSubmitting) return;
        composeLookupSeq.current += 1;
        setComposeModalOpen(false);
        setComposeErrorText(null);
        setComposeSuggestions([]);
        setComposeSuggestionsLoading(false);
        setComposeSelectedRecipients([]);
        setComposeRecipientQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composeModalOpen, composeSubmitting]);

  const previewItemArchived = previewItem
    ? isStandardDirectMailboxItem(previewItem) && selectedConversationMessages.length > 0
      ? selectedConversationMessages.every(isMailboxArchived)
      : isMailboxArchived(previewItem)
    : false;
  const activeUnreadChatItems = activeChatItems.filter(
    (item) => !isSentMailboxItem(item) && !item.read
  );
  const activeUnreadCount = activeUnreadChatItems.length;
  const activeConversationCount = buildMailboxChatListRows(
    activeChatItems,
    items
  ).length;
  const unreadConversationCount = buildMailboxChatListRows(
    activeUnreadChatItems,
    items
  ).length;
  const folderTitle: Record<MailFilterMode, string> = {
    all: "Chaty",
    unread: "Nepřečtené",
    system: "Systémová oznámení",
    snoozed: "Připomenutí",
    archived: "Archiv",
  };
  const mailFolders = [
    { id: "all" as const, label: "Chaty", count: activeConversationCount, Icon: MessageCircle },
    { id: "unread" as const, label: "Nepřečtené", count: unreadConversationCount, Icon: MailOpen },
    { id: "system" as const, label: "Systémová oznámení", count: activeSystemItems.length, Icon: Bell },
    { id: "snoozed" as const, label: "Připomenutí", count: snoozedItems.length, Icon: Clock3 },
    { id: "archived" as const, label: "Archiv", count: archivedItems.length, Icon: Archive },
  ];
  const searchPlaceholder: Record<MailFilterMode, string> = {
    all: "Hledat v chatech…",
    unread: "Hledat v nepřečtených chatech…",
    system: "Hledat v oznámeních…",
    snoozed: "Hledat v připomenutích…",
    archived: "Hledat v archivu…",
  };
  const emptyFolderTitle: Record<MailFilterMode, string> = {
    all: "Zatím tu nejsou žádné chaty",
    unread: "Všechny chaty máš přečtené",
    system: "Žádná systémová oznámení",
    snoozed: "Žádná připomenutí",
    archived: "Archiv je prázdný",
  };
  const emptyFolderDescription: Record<MailFilterMode, string> = {
    all: "Vyhledej kolegu přes Nový chat a začni konverzaci.",
    unread: "Nové zprávy se zobrazí tady.",
    system: "Nová upozornění aplikace se zobrazí tady.",
    snoozed: "Odložené zprávy a nastavená připomenutí se zobrazí tady.",
    archived: "Archivované chaty a oznámení se zobrazí tady.",
  };
  const listCountLabel =
    mailFilter === "all" || mailFilter === "unread"
      ? pluralCount(chatListRows.length, "konverzace", "konverzace", "konverzací")
      : mailFilter === "system"
      ? pluralCount(chatListRows.length, "oznámení", "oznámení", "oznámení")
      : pluralCount(chatListRows.length, "položka", "položky", "položek");
  const previewCorrespondent = previewItem
    ? isSentMailboxItem(previewItem)
      ? sentRecipientText(previewItem) || "Odeslaná zpráva"
      : mailboxMetadataText(previewItem, "senderName") ||
        (mailboxMetadataText(previewItem, "senderEmail")
          ? nameFromEmail(mailboxMetadataText(previewItem, "senderEmail"))
          : previewItem.type === "direct_message"
          ? "Kolega"
          : "Bohemka.App")
    : "";
  const standardDirectPreviewItem =
    previewItemWithBlobAttachments?.type === "direct_message" &&
    !isTipsterTipMailboxItem(previewItemWithBlobAttachments)
      ? previewItemWithBlobAttachments
      : null;
  const standardDirectMetadata = standardDirectPreviewItem?.metadata ?? {};
  const standardDirectIsEmptyDraft =
    standardDirectMetadata.chatDraft === true && chatThreadMessages.length === 0;
  const standardDirectIsSent = standardDirectPreviewItem
    ? isSentMailboxItem(standardDirectPreviewItem)
    : false;
  const standardDirectCounterpart = standardDirectPreviewItem
    ? directMessageCounterpart(standardDirectPreviewItem)
    : null;
  const standardDirectSenderEmail = normalizeEmail(standardDirectMetadata.senderEmail);
  const standardDirectRecipientEmail = normalizeEmail(standardDirectMetadata.recipientEmail);
  const standardDirectSenderName = standardDirectPreviewItem
    ? mailboxMetadataText(standardDirectPreviewItem, "senderName") ||
      (standardDirectSenderEmail ? nameFromEmail(standardDirectSenderEmail) : "Uživatel")
    : "";
  const standardDirectRecipientName = standardDirectPreviewItem
    ? mailboxMetadataText(standardDirectPreviewItem, "recipientName") ||
      (standardDirectRecipientEmail ? nameFromEmail(standardDirectRecipientEmail) : "Uživatel")
    : "";
  const standardDirectMessageText = standardDirectPreviewItem
    ? mailboxMetadataText(standardDirectPreviewItem, "messageText") || standardDirectPreviewItem.body.trim()
    : "";
  const standardDirectAttachments = standardDirectPreviewItem
    ? parseMailboxAttachments(standardDirectPreviewItem)
    : [];
  const renderStandardDirectMessage = (showSubject: boolean) => {
    if (!standardDirectPreviewItem) return null;
    if (chatThreadMessages.length > 0) {
      return (
        <MailboxChatThread
          messages={chatThreadMessages}
          showHeader={showSubject}
          firstUnreadMessageId={conversationUnreadStartId}
          presenceLabel={chatPresence.label}
          online={chatPresence.online}
          typing={chatPresence.typing}
          onRetryMessage={retryQuickReply}
          currentUserEmail={effectiveEmail}
          reactionEmojis={MESSAGE_REACTION_EMOJIS}
          onToggleReaction={handleMessageReaction}
          onEditMessage={handleEditOwnMessage}
          onDeleteMessage={handleDeleteOwnMessage}
          hasOlderMessages={
            conversationHistory?.key === activeConversationKey &&
            conversationHistory.hasMore
          }
          loadingOlderMessages={
            conversationHistory?.key === activeConversationKey &&
            (conversationHistory.loadingOlder || conversationHistory.loading)
          }
          onLoadOlderMessages={loadOlderConversationMessages}
          onLoadAttachment={loadChatAttachment}
          onTogglePin={handleToggleMessagePin}
          onSetReminder={handleSetMessageReminder}
        />
      );
    }
    if (standardDirectIsEmptyDraft) {
      return (
        <div className="grid min-h-full place-items-center px-6 py-12 text-center">
          <div>
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
              <MessageCircle className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Začni konverzaci</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
              Napiš první zprávu pro {standardDirectCounterpart?.name || "vybraného uživatele"}.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className={`${styles.standardMessage} mx-auto w-full max-w-3xl px-5 py-5 sm:px-7 sm:py-6`}>
        {showSubject ? (
          <div className="mb-6 border-b border-slate-200 pb-5">
            <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
              {standardDirectIsSent ? "Odeslaná zpráva" : "Přijatá zpráva"}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-3xl">
              {standardDirectPreviewItem.title || "Zpráva"}
            </h2>
          </div>
        ) : null}

        <div className="flex items-start gap-3">
          <ProfileAvatar
            src={mailboxMetadataText(standardDirectPreviewItem, "senderAvatar")}
            name={standardDirectSenderName}
            className="h-11 w-11 rounded-2xl text-[2.75rem] shadow-inner ring-1 ring-slate-200"
            fallbackClassName="bg-sky-100 text-sky-700"
            sizes="44px"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 truncate text-sm font-bold text-slate-950 sm:text-base">
                {standardDirectSenderName}
                {standardDirectSenderEmail ? (
                  <span className="ml-1.5 font-normal text-slate-500">&lt;{standardDirectSenderEmail}&gt;</span>
                ) : null}
              </p>
              <time className="shrink-0 text-xs font-medium text-slate-500">
                {formatDateTime(standardDirectPreviewItem.createdAtMs)}
              </time>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              Komu: <span className="font-medium text-slate-700">{standardDirectRecipientName}</span>
              {standardDirectRecipientEmail ? ` <${standardDirectRecipientEmail}>` : ""}
            </p>
          </div>
        </div>

        <article className="mt-6 min-h-[180px] whitespace-pre-wrap break-words border-t border-slate-100 pt-6 text-[15px] leading-7 text-slate-800 sm:text-base">
          {standardDirectMessageText || "Bez textu."}
        </article>

        {standardDirectAttachments.length > 0 ? (
          <section className="mt-8 border-t border-slate-200 pt-5">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-violet-700" />
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                {pluralCount(standardDirectAttachments.length, "příloha", "přílohy", "příloh")}
              </h3>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {standardDirectAttachments.map((file) => {
                const isImage = file.contentType.toLowerCase().startsWith("image/") || /\.(jpe?g|png|gif|webp|avif)$/i.test(file.name);
                const attachmentReady = !file.url.startsWith("/api/");
                const content = (
                  <>
                    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isImage ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                      {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">{file.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {attachmentReady ? formatFileSize(file.sizeBytes) : "Načítám přílohu…"}
                      </span>
                    </span>
                    {attachmentReady ? <Download className="h-4 w-4 shrink-0 text-slate-400" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500" />}
                  </>
                );
                return attachmentReady ? (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-violet-300 hover:bg-violet-50"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={file.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 opacity-75">
                    {content}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    );
  };

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="text-sm text-slate-700">Načítám přihlášení…</div>
      </main>
    );
  }

  if (!user) {
    return <AppLayout active="home">{null}</AppLayout>;
  }

  return (
    <AppLayout active="home">
      <div className={`${styles.postaPage} relative min-h-[100dvh] w-full overflow-x-hidden bg-white`}>
        <div className={styles.canvas} aria-hidden="true">
          <span className={styles.mesh} />
          <span className={styles.grain} />
        </div>

        <div className="relative z-10 w-full min-w-0 text-slate-900">
          <section className={`${styles.mailShell} min-h-[100dvh] w-full overflow-hidden bg-white`}>
            <header className={`${styles.mailTopbar} flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5`}>
              <div className="flex min-w-[190px] flex-1 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#020617_0%,#312060_55%,#7c3aed_100%)] text-white shadow-[0_12px_26px_rgba(88,28,135,0.25)]">
                  <Mail className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">Komunikace</p>
                  <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-950">Pošta</h1>
                </div>
              </div>

              <label className={`${styles.mailSearch} relative order-3 w-full sm:order-none sm:w-[min(34vw,430px)]`}>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={mailSearch}
                  onChange={(event) => setMailSearch(event.target.value)}
                  placeholder={searchPlaceholder[mailFilter]}
                  aria-label={searchPlaceholder[mailFilter].replace("…", "")}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
                {mailSearch ? (
                  <button
                    type="button"
                    onClick={() => setMailSearch("")}
                    aria-label="Vymazat hledání"
                    className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </label>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadMailbox()}
                  disabled={loading || saving}
                  aria-label="Obnovit poštu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((current) => {
                      const next = !current;
                      if (!next) setSelectedIds([]);
                      return next;
                    });
                  }}
                  disabled={loading}
                  className={`hidden h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition sm:inline-flex ${
                    selectMode
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  <CheckCheck className="h-4 w-4" />
                  {selectMode ? "Hotovo" : "Označit"}
                </button>
              </div>
            </header>

            <div className={`${styles.mailWorkspace} grid min-w-0 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_330px_minmax(0,1fr)]`}>
              <aside className={`${styles.mailFolderRail} border-b border-slate-200 bg-slate-50/80 p-3 lg:border-b-0 lg:border-r sm:p-4`}>
                <button
                  type="button"
                  onClick={openComposeModal}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-3 text-sm font-bold !text-white shadow-[0_10px_24px_rgba(109,40,217,0.24)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:opacity-60`}
                >
                  <SquarePen className="h-4 w-4" />
                  Nový chat
                </button>

                <nav className={`${styles.mailFolderNav} mt-4 flex gap-2 overflow-x-auto lg:block lg:space-y-1.5`} aria-label="Složky pošty">
                  {mailFolders.map(({ id, label, count, Icon }) => {
                    const active = mailFilter === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setMailFilter(id);
                          setSelectMode(false);
                          setSelectedIds([]);
                        }}
                        className={`flex min-w-[145px] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition lg:w-full lg:min-w-0 ${
                          active
                            ? "bg-violet-700 !text-white shadow-[0_6px_14px_rgba(109,40,217,0.24)] hover:bg-violet-800"
                            : "text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active ? "bg-white/18 text-white" : id === "unread" && count > 0 ? "bg-violet-100 text-violet-800" : "bg-slate-200/80 text-slate-600"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <div className="mt-5 hidden rounded-2xl border border-violet-100 bg-white p-3 lg:block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Stav schránky</span>
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-violet-100 px-2 text-xs font-bold text-violet-800">{activeUnreadCount}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {activeUnreadCount === 0 ? "Všechny chaty máš přečtené." : `Čeká na tebe ${pluralCount(activeUnreadCount, "nová zpráva", "nové zprávy", "nových zpráv")}.`}
                  </p>
                  {activeUnreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => void markItemsRead(activeUnreadChatItems.map((item) => item.id))}
                      disabled={saving}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 transition hover:text-violet-900 disabled:opacity-50"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Označit vše jako přečtené
                    </button>
                  ) : null}
                </div>
              </aside>

              <section className={`${styles.mailMessageList} flex min-w-0 flex-col border-slate-200 bg-white xl:border-r`}>
                <div className="flex min-h-[70px] items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-[-0.015em] text-slate-950">{folderTitle[mailFilter]}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {mailSearch
                        ? `${chatListRows.length} výsledků hledání`
                        : listCountLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {mailFilter === "unread" && activeUnreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void markItemsRead(activeUnreadChatItems.map((item) => item.id))}
                        disabled={saving}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Vše přečteno
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectMode((current) => {
                          const next = !current;
                          if (!next) setSelectedIds([]);
                          return next;
                        });
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 sm:hidden"
                      aria-label={selectMode ? "Ukončit výběr" : "Označit zprávy"}
                    >
                      <CheckCheck className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {selectMode ? (
                  <div className="flex flex-wrap items-center gap-2 border-b border-violet-200 bg-violet-50 px-3 py-2">
                    <span className="mr-auto text-xs font-bold text-violet-900">Označeno {selectedVisibleCount}/{filteredVisibleItems.length}</span>
                    <button type="button" onClick={toggleSelectAllVisible} disabled={filteredVisibleItems.length === 0} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
                      {allVisibleSelected ? "Odznačit vše" : "Označit vše"}
                    </button>
                    <button type="button" onClick={() => void archiveMailboxItems(selectedIds.filter((id) => visibleItemIds.includes(id)), mailFilter !== "archived")} disabled={selectedVisibleCount === 0 || archivingIds.length > 0} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
                      <Archive className="h-3.5 w-3.5" />
                      {mailFilter === "archived" ? "Vrátit" : "Archivovat"}
                    </button>
                    <button type="button" onClick={() => void deleteSelected()} disabled={selectedVisibleCount === 0 || deletingIds.length > 0} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                      Smazat
                    </button>
                  </div>
                ) : null}

                <div className={`${styles.mailListScroll} min-h-0 overflow-y-auto`}>
                  {error ? (
                    <div className="m-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
                  ) : null}
                  {loading ? (
                    <div className="divide-y divide-slate-200">
                      {[0, 1, 2, 3, 4].map((idx) => <div key={idx} className="h-[108px] animate-pulse bg-slate-100/75" />)}
                    </div>
                  ) : filteredVisibleItems.length === 0 ? (
                    <div className="grid min-h-[420px] place-items-center px-6 text-center">
                      <div>
                        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                          {mailSearch ? <Search className="h-6 w-6" /> : mailFilter === "all" ? <MessageCircle className="h-6 w-6" /> : <MailOpen className="h-6 w-6" />}
                        </span>
                        <h3 className="mt-4 text-lg font-bold text-slate-900">{mailSearch ? "Nic jsme nenašli" : emptyFolderTitle[mailFilter]}</h3>
                        <p className="mt-1 text-sm text-slate-500">{mailSearch ? "Zkus jiný výraz nebo hledání vymaž." : emptyFolderDescription[mailFilter]}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {chatListRows.map((row, index) =>
                        row.kind === "conversation"
                          ? renderChatConversationCard(row, index)
                          : renderMailboxItemCard(row.item, index)
                      )}
                    </div>
                  )}
                </div>
              </section>

              <aside className={`${styles.mailDetailPane} hidden min-w-0 flex-col bg-slate-50/65 xl:flex`}>
                {previewItem && (mailboxPreviewHtml || weeklyReportPreviewHref || standardDirectPreviewItem) ? (
                  <>
                    <div className="border-b border-slate-200 bg-white px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {standardDirectPreviewItem ? (
                            <span className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-slate-200 ${isGroupMailboxItem(standardDirectPreviewItem) ? "bg-violet-100 text-violet-700" : "bg-white"}`}>
                              {isGroupMailboxItem(standardDirectPreviewItem) ? (
                                <UsersRound className="h-5 w-5" />
                              ) : (
                                <>
                                  <ProfileAvatar
                                    src={standardDirectCounterpart?.profileAvatar}
                                    name={standardDirectCounterpart?.name}
                                    className="h-full w-full rounded-2xl text-[2.75rem]"
                                    fallbackClassName="bg-sky-100 text-sky-700"
                                    sizes="44px"
                                  />
                                  <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${chatPresence.online ? "bg-emerald-500" : "bg-slate-300"}`} />
                                </>
                              )}
                            </span>
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">
                              {standardDirectPreviewItem ? "Konverzace" : previewCorrespondent}
                            </p>
                            <h2 className="mt-1 line-clamp-2 text-lg font-bold leading-6 text-slate-950">
                              {standardDirectCounterpart?.name || previewItem.title}
                            </h2>
                            {standardDirectCounterpart?.email ? (
                              <p className={`mt-0.5 truncate text-xs font-semibold ${chatPresence.online ? "text-emerald-700" : "text-slate-500"}`}>
                                {chatPresence.label}
                                <span className="ml-1 font-normal text-slate-400">· {standardDirectCounterpart.email}</span>
                              </p>
                            ) : !standardDirectPreviewItem ? (
                              <p className="mt-1 text-xs text-slate-500">{formatDateTime(previewItem.createdAtMs)}</p>
                            ) : null}
                          </div>
                        </div>
                        <button type="button" onClick={closePreviewModal} aria-label="Zavřít zprávu" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!standardDirectIsEmptyDraft ? (
                          <button type="button" onClick={() => void archivePreviewItem(!previewItemArchived)} disabled={archivingIds.includes(previewItem.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50">
                            {previewItemArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            {previewItemArchived ? "Vrátit" : "Archivovat"}
                          </button>
                        ) : null}
                        {activeConversationIsGroup && groupConversation?.active !== false ? (
                          <button
                            type="button"
                            onClick={() => void handleToggleGroupMute()}
                            disabled={groupConversationLoading || groupMuteSaving || !groupConversation}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
                          >
                            {groupMuteSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : groupConversation?.muted ? (
                              <Volume2 className="h-3.5 w-3.5" />
                            ) : (
                              <VolumeX className="h-3.5 w-3.5" />
                            )}
                            {groupConversation?.muted ? "Zapnout upozornění" : "Ztlumit"}
                          </button>
                        ) : null}
                        {activeConversationIsGroup && groupConversation?.canManage ? (
                          <button
                            type="button"
                            onClick={() => setGroupManagerOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Správa skupiny
                          </button>
                        ) : null}
                        {!standardDirectIsEmptyDraft ? (
                          <MailboxActionMenu label="Další akce s otevřenou konverzací">
                            <button
                              type="button"
                              onClick={() => void deletePreviewItem()}
                              disabled={deletingIds.includes(previewItem.id)}
                              className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {standardDirectPreviewItem ? "Smazat konverzaci" : "Smazat zprávu"}
                            </button>
                          </MailboxActionMenu>
                        ) : null}
                        {!standardDirectPreviewItem ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (previewItem.type === "weekly_team_report") {
                                router.push(weeklyTeamReportHref(previewItem));
                                return;
                              }
                              setPreviewModalOpen(true);
                            }}
                            className="ml-auto rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
                          >
                            Otevřít celé
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
                      {standardDirectPreviewItem ? (
                        renderStandardDirectMessage(false)
                      ) : weeklyReportPreviewHref ? (
                        <iframe
                          src={weeklyReportPreviewHref ?? undefined}
                          referrerPolicy="same-origin"
                          title="Týdenní report týmu"
                          className="h-full w-full bg-[#07010a]"
                        />
                      ) : previewItem.type === "production_export_share" && sharedExportPreviewLoading ? (
                        <div className="grid h-full place-items-center text-sm font-medium text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Načítám náhled…</div>
                      ) : (
                        <iframe
                          srcDoc={mailboxPreviewHtml ?? undefined}
                          sandbox={previewItem.type === "online_card_meeting_request" ? "allow-popups allow-top-navigation-by-user-activation" : "allow-popups"}
                          referrerPolicy="no-referrer"
                          title="Náhled vybrané zprávy"
                          className="h-full w-full bg-white"
                        />
                      )}
                    </div>
                    {quickReplyEnabled && quickReplyRecipient ? (
                      <MailboxChatComposer
                        recipientName={quickReplyRecipient.name}
                        text={quickReplyText}
                        files={quickReplyFiles}
                        submitting={quickReplySubmitting}
                        error={quickReplyErrorText}
                        success={quickReplySuccessText}
                        onTextChange={(value) => {
                          setQuickReplyText(value);
                          setQuickReplyErrorText(null);
                          setQuickReplySuccessText(null);
                        }}
                        onFilesAdded={handleQuickReplyFilesChange}
                        onRemoveFile={removeQuickReplyFile}
                        onSend={() => void handleQuickReplySend()}
                        onTypingChange={updateTypingState}
                      />
                    ) : activeConversationIsGroup && groupConversation?.active === false ? (
                      <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-semibold text-amber-800">
                        Ze skupiny jsi byl odebrán. Dosavadní historii můžeš dál zobrazit.
                      </div>
                    ) : activeConversationIsGroup && groupConversationError ? (
                      <div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs font-semibold text-rose-700">
                        {groupConversationError}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="grid h-full place-items-center px-8 text-center">
                    <div>
                      <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[22px] border border-violet-100 bg-white text-violet-700 shadow-[0_12px_30px_rgba(88,28,135,0.10)]">
                        <MailOpen className="h-7 w-7" />
                      </span>
                      <h3 className="mt-5 text-lg font-bold text-slate-900">Vyber chat nebo oznámení</h3>
                      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">Konverzace nebo detail oznámení se zobrazí tady.</p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>

        <div className="hidden">
          <section
            className={`${styles.heroPanel} ${styles.mailHero} rounded-[26px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-5`}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex min-w-0 items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-800 shadow-[0_10px_28px_rgba(124,58,237,0.14)]">
                  <Mail className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Komunikace
                  </div>

                  <h1 className="mt-2 text-3xl font-bold tracking-[-0.025em] text-slate-950 sm:text-4xl">
                    Pošta
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-600 sm:text-base">
                    Zprávy od kolegů a systémová upozornění na jednom místě.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className={`${styles.heroStats} grid w-full grid-cols-3 gap-2 text-xs sm:w-auto`}>
                  <div className="rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3 py-2">
                    <div className="font-semibold uppercase tracking-[0.12em] text-slate-500">Nepřečtené</div>
                    <div className="mt-1 text-lg font-bold leading-none text-violet-800">{unreadCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/90 bg-white/88 px-3 py-2">
                    <div className="font-semibold uppercase tracking-[0.12em] text-slate-500">Chaty</div>
                    <div className="mt-1 text-lg font-bold leading-none text-slate-950">{activeConversationCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/90 bg-white/88 px-3 py-2">
                    <div className="font-semibold uppercase tracking-[0.12em] text-slate-500">Systémové</div>
                    <div className="mt-1 text-lg font-bold leading-none text-slate-950">{activeSystemItems.length}</div>
                  </div>
                </div>

                <div className={`${styles.heroActions} flex flex-wrap items-center gap-2 xl:justify-end`}>
                <button
                  type="button"
                  onClick={openComposeModal}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-slate-900/80 bg-slate-950 px-4 py-2.5 text-sm font-bold !text-white shadow-[0_14px_34px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:brightness-90`}
                >
                  <SquarePen className="h-4 w-4" />
                  Nový chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((prev) => {
                      const next = !prev;
                      if (!next) setSelectedIds([]);
                      return next;
                    });
                  }}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:brightness-90 ${
                    selectMode
                      ? "border-slate-900 bg-slate-950 !text-white shadow-[0_12px_28px_rgba(15,23,42,0.22)]"
                      : "border-slate-300/80 bg-white/90 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 hover:border-slate-500 hover:bg-white"
                  }`}
                >
                  Označit
                </button>
                <button
                  type="button"
                  onClick={() => void loadMailbox()}
                  disabled={loading || saving}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-slate-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Obnovit
                </button>
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={saving || unreadCount <= 0}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-violet-600 bg-[linear-gradient(135deg,#8b5cf6_0%,#6d28d9_60%,#4c1d95_100%)] px-4 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_30px_rgba(109,40,217,0.24)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:brightness-90`}
                >
                  <CheckCheck className="h-4 w-4" />
                  Vše přečteno
                </button>
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.mailListPanel} overflow-visible rounded-[30px] border border-slate-200/90 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.08)]`}>
            <div className={`${styles.filterBar} flex flex-wrap items-center justify-between gap-3 rounded-t-[30px] border-b border-slate-200/80 bg-white px-4 py-3 sm:px-5`}>
              <div className={`${styles.filterTabs} inline-flex items-center rounded-2xl bg-slate-100 p-1`}>
                <button
                  type="button"
                  onClick={() => setMailFilter("all")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "all"
                      ? "bg-[linear-gradient(135deg,#020617_0%,#211442_58%,#6d28d9_100%)] !text-white shadow-[0_8px_18px_rgba(88,28,135,0.2)]"
                      : "text-slate-700 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  Chaty
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("unread")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "unread"
                      ? "bg-[linear-gradient(135deg,#020617_0%,#211442_58%,#6d28d9_100%)] !text-white shadow-[0_8px_18px_rgba(88,28,135,0.2)]"
                      : "text-slate-700 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  Jen nepřečtené
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("snoozed")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "snoozed"
                      ? "bg-[linear-gradient(135deg,#020617_0%,#211442_58%,#6d28d9_100%)] !text-white shadow-[0_8px_18px_rgba(88,28,135,0.2)]"
                      : "text-slate-700 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  Odložené
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("archived")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "archived"
                      ? "bg-[linear-gradient(135deg,#020617_0%,#211442_58%,#6d28d9_100%)] !text-white shadow-[0_8px_18px_rgba(88,28,135,0.2)]"
                      : "text-slate-700 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  Archiv
                </button>
              </div>

              <div className={`${styles.visibleCount} rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500`}>
                Zobrazeno: <strong className="text-violet-800">{visibleItems.length}</strong>
              </div>
            </div>

            <div className={`${styles.mailListBody} rounded-b-[30px] bg-slate-50/55 p-3 sm:p-4`}>
            {selectMode ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-200 bg-violet-50/70 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-900">
                  Označeno: {selectedVisibleCount}/{visibleItems.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={visibleItems.length === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allVisibleSelected ? "Odznačit vše" : "Označit vše"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    disabled={selectedIds.length === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Vyčistit výběr
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void archiveMailboxItems(
                        selectedIds.filter((id) => visibleItemIds.includes(id)),
                        mailFilter !== "archived"
                      )
                    }
                    disabled={selectedVisibleCount === 0 || archivingIds.length > 0}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mailFilter === "archived" ? (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    {mailFilter === "archived" ? "Vrátit" : "Archivovat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSelected()}
                    disabled={selectedIds.length === 0 || deletingIds.length > 0}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Smazat označené
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-200/90 bg-rose-50/95 px-3 py-2 text-sm text-rose-700 shadow-[0_8px_20px_rgba(251,113,133,0.15)]">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-[76px] animate-pulse rounded-[20px] border border-slate-200/85 bg-slate-100/80"
                  />
                ))}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="rounded-[24px] border border-violet-200 bg-white px-6 py-10 text-center shadow-[0_14px_34px_rgba(88,28,135,0.08)]">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-800 shadow-[0_10px_28px_rgba(124,58,237,0.16)]">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Schránka je čistá</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                  Ve vybraném filtru zatím nejsou žádné zprávy.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {visibleRows.map((row, index) => {
                  if (row.kind === "item") return renderMailboxItemCard(row.item, index);

                  const expanded = expandedGroupKeys.includes(row.key);
                  const rowIds = row.items.map((item) => item.id);
                  const groupArchived = row.items.every((item) => isMailboxArchived(item));
                  const groupArchiving = row.items.some((item) => archivingIds.includes(item.id));
                  const groupDeleting = row.items.some((item) => deletingIds.includes(item.id));
                  const groupSnoozed = row.items.every((item) => isMailboxSnoozed(item));
                  const groupSnoozing = row.items.some((item) => snoozingIds.includes(item.id));
                  const groupIsDirectMessage = row.items.every(
                    (item) => item.type === "direct_message"
                  );
                  const GroupKindIcon = groupIsDirectMessage ? Mail : Bell;
                  return (
                    <div key={row.key} className="space-y-2">
                      <div className={`${styles.groupCard} relative rounded-[20px] border border-violet-200 bg-[linear-gradient(145deg,#f7f2ff_0%,#ffffff_62%)] px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] focus-within:z-40`}>
                        <span
                          className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#020617_0%,#6d28d9_100%)]"
                          aria-hidden="true"
                        />
                        <div className={`${styles.groupCardInner} flex items-center justify-between gap-4 pl-2`}>
                          <button
                            type="button"
                            onClick={() => toggleExpandedGroup(row.key)}
                            className={`${styles.groupCardMain} min-w-0 flex-1 text-left`}
                            aria-expanded={expanded}
                          >
                            <div className={`${styles.groupTitleRow} flex min-w-0 items-center gap-2`}>
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                                <GroupKindIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                                  groupIsDirectMessage
                                    ? "border-sky-200 bg-sky-50 text-sky-700"
                                    : "border-violet-200 bg-violet-50 text-violet-700"
                                }`}
                              >
                                <GroupKindIcon className="h-3 w-3" aria-hidden="true" />
                                {groupIsDirectMessage ? "Zpráva" : "Notifikace"}
                              </span>
                              <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">
                                {row.title}
                              </p>
                              {row.unreadCount > 0 ? (
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                                  {pluralCount(row.unreadCount, "nová", "nové", "nových")}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-700">{row.body}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Poslední {formatDateTime(row.latestCreatedAtMs)}
                            </p>
                          </button>

                          <div className={`${styles.groupCardActions} flex shrink-0 items-center justify-end gap-2`}>
                            <MailboxActionMenu label={`Další akce: ${row.title}`}>
                              {groupArchived ? (
                                <button
                                  type="button"
                                  onClick={() => void archiveMailboxItems(rowIds, false)}
                                  disabled={groupArchiving}
                                  className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                                >
                                  <ArchiveRestore className="h-3.5 w-3.5" />
                                  Vrátit z archivu
                                </button>
                              ) : groupSnoozed ? (
                                <button
                                  type="button"
                                  onClick={() => void snoozeMailboxItems(rowIds, null)}
                                  disabled={groupSnoozing}
                                  className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Zrušit připomenutí
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void snoozeMailboxItems(rowIds, snoozeUntilAfterDays(1))}
                                    disabled={groupSnoozing}
                                    className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                                  >
                                    Připomenout zítra
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void snoozeMailboxItems(rowIds, snoozeUntilAfterDays(7))}
                                    disabled={groupSnoozing}
                                    className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                                  >
                                    Připomenout za týden
                                  </button>
                                </>
                              )}
                              {!groupArchived ? (
                                <button
                                  type="button"
                                  onClick={() => void archiveMailboxItems(rowIds, true)}
                                  disabled={groupArchiving}
                                  className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900 disabled:opacity-50"
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                  Archivovat
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void deleteMailboxItems(rowIds)}
                                disabled={groupDeleting}
                                className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {groupDeleting ? "Mažu…" : "Smazat"}
                              </button>
                            </MailboxActionMenu>
                            <button
                              type="button"
                              onClick={() => toggleExpandedGroup(row.key)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                              aria-expanded={expanded}
                            >
                              {expanded ? "Sbalit" : "Rozbalit"}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => void openItem(row.latestItem)}
                              className="rounded-full border border-violet-700 bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(109,40,217,0.2)] transition hover:border-violet-800 hover:bg-violet-800"
                            >
                              Otevřít poslední
                            </button>
                          </div>
                        </div>
                      </div>

                      {expanded ? (
                        <div className={`${styles.groupChildren} space-y-2 pl-3 sm:pl-5`}>
                          {row.items.map((item, childIndex) =>
                            renderMailboxItemCard(item, index + childIndex + 1)
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </section>
        </div>

        {composeModalOpen && (
          <div className="fixed inset-0 z-[95]">
            <button
              type="button"
              aria-label={composeGroupMode ? "Zavřít vytvoření skupiny" : "Zavřít nový chat"}
              onClick={() => closeComposeModal()}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            />

            <div className="relative z-[96] flex min-h-full items-center justify-center p-4">
              <section
                className="relative w-full max-w-lg overflow-hidden rounded-[30px] border border-violet-200 bg-white p-5 shadow-[0_28px_78px_rgba(88,28,135,0.22)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800">
                      {composeGroupMode ? <UsersRound className="h-3.5 w-3.5" /> : <SquarePen className="h-3.5 w-3.5" />}
                      {composeGroupMode ? "Nová skupina" : "Nový chat"}
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                      {composeGroupMode ? "Vytvořit skupinový chat" : "S kým chceš chatovat?"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {composeGroupMode
                        ? "Vyber členy a skupinu rovnou otevři. Psát začneš až v chatu."
                        : "Vyhledej kolegu a otevři společnou konverzaci."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setComposeGroupMode((current) => !current);
                        setComposeSelectedRecipients([]);
                        setComposeRecipientQuery("");
                        setComposeSuggestions([]);
                        setComposeErrorText(null);
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
                    >
                      {composeGroupMode ? <SquarePen className="h-3.5 w-3.5" /> : <UsersRound className="h-3.5 w-3.5" />}
                      {composeGroupMode ? "Zpět na nový chat" : "Vytvořit skupinu"}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => closeComposeModal()}
                    disabled={composeSubmitting}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="compose-recipient"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      {composeGroupMode ? "Členové skupiny" : "Uživatel"}
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="compose-recipient"
                        type="text"
                        value={composeRecipientQuery}
                        onChange={(event) => {
                          setComposeRecipientQuery(event.target.value);
                          setComposeErrorText(null);
                        }}
                        placeholder={composeGroupMode ? "Přidat jméno nebo e-mail" : "Koho chceš otevřít?"}
                        autoComplete="off"
                        autoFocus
                        className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                      />
                      {composeSuggestionsLoading ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
                      ) : null}
                    </div>

                    {composeSuggestions.length > 0 && (
                      <div className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_14px_30px_rgba(15,23,42,0.1)]">
                        {composeSuggestions.map((option) => (
                          <button
                            key={option.email}
                            type="button"
                            onClick={() => {
                              if (composeGroupMode) {
                                handleSelectComposeSuggestion(option);
                              } else {
                                void openChatWithRecipient(option);
                              }
                            }}
                            disabled={composeGroupMode && composeSelectedRecipients.some((recipient) => recipient.email === option.email)}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <ProfileAvatar
                                src={option.profileAvatar}
                                name={option.name}
                                alt=""
                                className="h-9 w-9 rounded-xl text-4xl ring-1 ring-slate-200"
                                fallbackClassName="bg-violet-100 text-violet-700"
                                sizes="36px"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">
                                  {option.name}
                                </span>
                                <span className="block truncate text-xs text-slate-500">
                                  {option.email}
                                </span>
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                              {composeGroupMode
                                ? composeSelectedRecipients.some((recipient) => recipient.email === option.email)
                                  ? "Přidáno"
                                  : "Přidat"
                                : "Otevřít chat"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {composeGroupMode && composeSelectedRecipients.length > 0 ? (
                      <div className="flex flex-wrap gap-2 rounded-2xl border border-violet-200 bg-violet-50/80 p-2.5">
                        {composeSelectedRecipients.map((recipient) => (
                          <span
                            key={recipient.email}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-950 ring-1 ring-violet-200"
                          >
                            <span className="truncate">{recipient.name}</span>
                            <button
                              type="button"
                              onClick={() => removeComposeRecipient(recipient.email)}
                              className="rounded-full p-0.5 text-violet-500 transition hover:bg-violet-100 hover:text-violet-900"
                              aria-label={`Odebrat příjemce ${recipient.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {composeGroupMode ? (
                    <>
                      <p className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm leading-6 text-violet-900">
                        Vyber alespoň dva další členy. Název skupiny se vytvoří z jejich jmen a později ho můžeš změnit ve správě skupiny.
                      </p>

                      {composeErrorText ? (
                        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {composeErrorText}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => closeComposeModal()}
                          disabled={composeSubmitting}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Zrušit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleComposeSend()}
                          disabled={composeSubmitting || composeSelectedRecipients.length < 2}
                          className="inline-flex items-center gap-2 rounded-xl border border-violet-700 bg-[linear-gradient(135deg,#020617_0%,#211442_52%,#6d28d9_100%)] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_30px_rgba(88,28,135,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:brightness-90 disabled:opacity-60"
                        >
                          {composeSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UsersRound className="h-4 w-4" />
                          )}
                          {composeSubmitting ? "Vytvářím…" : "Vytvořit skupinu"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {composeRecipientQuery.trim().length < 2 ? (
                        <p className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm leading-6 text-violet-900">
                          Začni psát jméno nebo e-mail. Kliknutím na uživatele se rovnou otevře váš chat.
                        </p>
                      ) : !composeSuggestionsLoading && composeSuggestions.length === 0 ? (
                        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          Žádného uživatele jsme nenašli.
                        </p>
                      ) : null}
                      {composeErrorText ? (
                        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {composeErrorText}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {previewModalOpen && previewItem && (mailboxPreviewHtml || standardDirectPreviewItem) && (
          <div className={`${styles.previewOverlay} ${standardDirectPreviewItem ? styles.chatPreviewOverlay : ""} fixed inset-0 z-[90]`}>
            <button
              type="button"
              aria-label="Zavřít náhled"
              onClick={closePreviewModal}
              className={`${styles.previewBackdrop} absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]`}
            />

            <div className={`${styles.previewWrap} ${standardDirectPreviewItem ? styles.chatPreviewWrap : ""} relative z-[91] flex min-h-full items-center justify-center p-4`}>
              <section
                className={`${styles.previewSheet} ${standardDirectPreviewItem ? styles.chatPreviewSheet : ""} w-full overflow-hidden rounded-[30px] border border-violet-300 bg-violet-50 shadow-[0_30px_82px_rgba(15,23,42,0.4)] ${
                  previewItem.type === "online_card_meeting_request" ? "max-w-[860px]" : "max-w-[980px]"
                }`}
              >
                <div className={`${styles.previewHeader} ${standardDirectPreviewItem ? styles.chatPreviewHeader : ""} flex min-h-[44px] items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(130deg,#020617_0%,#211442_58%,#6d28d9_100%)] px-3 py-1.5`}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    {standardDirectPreviewItem ? (
                      <>
                        <span className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/20 ${isGroupMailboxItem(standardDirectPreviewItem) ? "bg-violet-200 text-violet-900" : "bg-white"}`}>
                          {isGroupMailboxItem(standardDirectPreviewItem) ? (
                            <UsersRound className="h-4 w-4" />
                          ) : (
                            <ProfileAvatar
                              src={standardDirectCounterpart?.profileAvatar}
                              name={standardDirectCounterpart?.name}
                              alt=""
                              className="h-full w-full rounded-xl text-[2rem]"
                              sizes="32px"
                            />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold leading-4 text-white">
                            {standardDirectCounterpart?.name || "Konverzace"}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] font-semibold text-violet-100">
                            {chatPresence.label}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-3 rounded-full bg-violet-300" />
                        <span className="h-3 w-3 rounded-full bg-white/80" />
                        <span className="h-3 w-3 rounded-full bg-slate-950 ring-1 ring-white/30" />
                        <span className="truncate text-[12px] font-medium tracking-[0.01em] text-[#f8fafc]">
                          Bohemka.App náhled
                        </span>
                      </>
                    )}
                  </div>

                  <div className={`${styles.previewHeaderActions} flex shrink-0 items-center gap-2`}>
                    {activeConversationIsGroup && groupConversation?.active !== false ? (
                      <button
                        type="button"
                        onClick={() => void handleToggleGroupMute()}
                        disabled={groupConversationLoading || groupMuteSaving || !groupConversation}
                        className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-55"
                      >
                        {groupMuteSaving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : groupConversation?.muted ? (
                          <Volume2 className="h-3.5 w-3.5" />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {groupConversation?.muted ? "Zapnout" : "Ztlumit"}
                        </span>
                      </button>
                    ) : null}
                    {activeConversationIsGroup && groupConversation?.canManage ? (
                      <button
                        type="button"
                        onClick={() => setGroupManagerOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Správa</span>
                      </button>
                    ) : null}
                    {!standardDirectIsEmptyDraft ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void archivePreviewItem(!previewItemArchived)}
                          disabled={archivingIds.includes(previewItem.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {previewItemArchived ? (
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {previewItemArchived ? "Vrátit" : "Archivovat"}
                          </span>
                        </button>
                        <MailboxActionMenu label="Další akce s otevřenou konverzací">
                          <button
                            type="button"
                            onClick={() => void deletePreviewItem()}
                            disabled={deletingIds.includes(previewItem.id)}
                            className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {standardDirectPreviewItem ? "Smazat konverzaci" : "Smazat zprávu"}
                          </button>
                        </MailboxActionMenu>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={closePreviewModal}
                      aria-label="Zavřít náhled"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/20 text-white shadow-[0_6px_14px_rgba(2,6,23,0.35)] transition hover:bg-white/30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div
                  className={`${styles.previewContent} ${standardDirectPreviewItem ? styles.chatPreviewContent : ""} relative flex flex-col bg-violet-50 p-0 ${
                    previewItem.type === "online_card_meeting_request"
                      ? "h-[72vh] min-h-[460px]"
                      : "h-[84vh] min-h-[640px]"
                  }`}
                >
                  {standardDirectPreviewItem ? (
                    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
                      {renderStandardDirectMessage(false)}
                    </div>
                  ) : previewItem.type === "production_export_share" && sharedExportPreviewLoading ? (
                    <div className="grid h-full place-items-center text-sm font-medium text-slate-700">
                      Načítám přesný náhled exportu…
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1">
                      <iframe
                        srcDoc={mailboxPreviewHtml ?? undefined}
                        sandbox={
                          previewItem.type === "online_card_meeting_request"
                            ? "allow-popups allow-top-navigation-by-user-activation"
                            : "allow-popups"
                        }
                        referrerPolicy="no-referrer"
                        title={
                          previewItem.type === "production_export_share"
                            ? "Náhled sdíleného exportu produkce"
                            : previewItem.type === "production_plan_share"
                            ? "Náhled sdíleného plánu produkce"
                            : previewItem.type === "online_card_meeting_request"
                            ? previewItem.metadata?.inquiryKind === "travel" ? "Detail poptávky cestovního pojištění" : "Detail žádosti o schůzku"
                            : "Náhled zprávy"
                        }
                        className="h-full w-full bg-white"
                      />
                    </div>
                  )}

                  {quickReplyEnabled && quickReplyRecipient ? (
                    <MailboxChatComposer
                      recipientName={quickReplyRecipient.name}
                      text={quickReplyText}
                      files={quickReplyFiles}
                      submitting={quickReplySubmitting}
                      error={quickReplyErrorText}
                      success={quickReplySuccessText}
                      onTextChange={(value) => {
                        setQuickReplyText(value);
                        setQuickReplyErrorText(null);
                        setQuickReplySuccessText(null);
                      }}
                      onFilesAdded={handleQuickReplyFilesChange}
                      onRemoveFile={removeQuickReplyFile}
                      onSend={() => void handleQuickReplySend()}
                      onTypingChange={updateTypingState}
                    />
                  ) : activeConversationIsGroup && groupConversation?.active === false ? (
                    <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-semibold text-amber-800">
                      Ze skupiny jsi byl odebrán. Dosavadní historii můžeš dál zobrazit.
                    </div>
                  ) : activeConversationIsGroup && groupConversationError ? (
                    <div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs font-semibold text-rose-700">
                      {groupConversationError}
                    </div>
                  ) : null}

                </div>
              </section>
            </div>
          </div>
        )}

        {groupManagerOpen && user && groupConversation?.canManage ? (
          <MailboxGroupManager
            user={user}
            conversation={groupConversation}
            currentUserEmail={effectiveEmail}
            onClose={() => setGroupManagerOpen(false)}
            onChanged={syncGroupConversation}
          />
        ) : null}
      </div>
    </AppLayout>
  );
}
