"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  ChevronDown,
  Layers3,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Smile,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { AppLayout } from "@/components/AppLayout";
import {
  COMPOSE_FILES_MAX_COUNT,
  COMPOSE_MESSAGE_MAX_LEN,
  COMPOSE_SUBJECT_MAX_LEN,
  EMAIL_RE,
  QUICK_EMOJIS,
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
import type {
  MailboxComposeResponse,
  MailboxDeleteResponse,
  MailboxItem,
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

const formatSnoozedUntil = (item: MailboxItem): string =>
  item.snoozedUntilMs ? `Odloženo do ${formatDateTime(item.snoozedUntilMs)}` : "";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MailboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mailFilter, setMailFilter] = useState<MailFilterMode>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [snoozingIds, setSnoozingIds] = useState<string[]>([]);
  const [snoozeNowMs, setSnoozeNowMs] = useState(() => Date.now());
  const [previewItem, setPreviewItem] = useState<MailboxItem | null>(null);
  const [previewAttachmentBlobUrls, setPreviewAttachmentBlobUrls] = useState<Record<string, string>>({});
  const previewAttachmentBlobUrlsRef = useRef<string[]>([]);
  const [sharedExportPreviewHtml, setSharedExportPreviewHtml] = useState<string | null>(null);
  const [sharedExportPreviewLoading, setSharedExportPreviewLoading] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeErrorText, setComposeErrorText] = useState<string | null>(null);
  const [composeRecipientQuery, setComposeRecipientQuery] = useState("");
  const [composeSelectedRecipient, setComposeSelectedRecipient] = useState<RecipientOption | null>(null);
  const [composeSuggestions, setComposeSuggestions] = useState<RecipientOption[]>([]);
  const [composeSuggestionsLoading, setComposeSuggestionsLoading] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessageText, setComposeMessageText] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [quickReplyText, setQuickReplyText] = useState("");
  const [quickReplyFiles, setQuickReplyFiles] = useState<File[]>([]);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [quickReplySubmitting, setQuickReplySubmitting] = useState(false);
  const [quickReplyErrorText, setQuickReplyErrorText] = useState<string | null>(null);
  const [quickReplySuccessText, setQuickReplySuccessText] = useState<string | null>(null);
  const composeLookupSeq = useRef(0);
  const composeFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickReplyFileInputRef = useRef<HTMLInputElement | null>(null);
  const openedDeepLinkMessageIdRef = useRef<string>("");
  const pendingDeepLinkMessageIdRef = useRef<string>("");

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

  const loadMailbox = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthedJsonOrThrow<MailboxResponse>(
        currentUser,
        "/api/mailbox?limit=80",
        { method: "GET" }
      );
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(
        typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount)
          ? Math.max(0, Math.floor(data.unreadCount))
          : 0
      );
    } catch (err: any) {
      setError(err?.message || "Poštu se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }
    void loadMailbox();

    const intervalId = window.setInterval(() => {
      void loadMailbox();
    }, 45_000);

    const onFocus = () => {
      void loadMailbox();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, user]);

  const receivedItems = useMemo(() => items.filter((item) => !isSentMailboxItem(item)), [items]);
  const activeReceivedItems = useMemo(() => {
    return receivedItems.filter((item) => !isMailboxSnoozed(item, snoozeNowMs));
  }, [receivedItems, snoozeNowMs]);
  const snoozedItems = useMemo(() => {
    return receivedItems.filter((item) => isMailboxSnoozed(item, snoozeNowMs));
  }, [receivedItems, snoozeNowMs]);
  const sentItems = useMemo(() => items.filter(isSentMailboxItem), [items]);

  const visibleItems = useMemo(() => {
    if (mailFilter === "sent") {
      return sentItems;
    }
    if (mailFilter === "snoozed") {
      return snoozedItems;
    }
    if (mailFilter === "unread") {
      return activeReceivedItems.filter((item) => !item.read);
    }
    return activeReceivedItems;
  }, [activeReceivedItems, mailFilter, sentItems, snoozedItems]);

  const visibleRows = useMemo(
    () => buildMailboxDisplayRows(visibleItems, !selectMode && mailFilter !== "sent"),
    [mailFilter, selectMode, visibleItems]
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
      setComposeSuggestions([]);
      setComposeSuggestionsLoading(false);
      return;
    }

    const query = composeRecipientQuery.trim();
    if (query.length < 2) {
      setComposeSuggestions([]);
      setComposeSuggestionsLoading(false);
      return;
    }

    const seq = ++composeLookupSeq.current;
    const timeoutId = window.setTimeout(async () => {
      setComposeSuggestionsLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(query)}`,
          { method: "GET" }
        );
        if (seq !== composeLookupSeq.current) return;

        const rows = Array.isArray(payload?.users) ? payload.users : [];
        const nextSuggestions = rows
          .map((row) => {
            const email = normalizeEmail(row.email);
            if (!email) return null;
            const name =
              typeof row.name === "string" && row.name.trim().length > 0
                ? row.name.trim()
                : nameFromEmail(email);
            return { email, name } satisfies RecipientOption;
          })
          .filter((row): row is RecipientOption => row !== null);
        setComposeSuggestions(nextSuggestions);
      } catch (err) {
        console.error("Načtení našeptávání příjemce v poště selhalo:", err);
        if (seq !== composeLookupSeq.current) return;
        setComposeSuggestions([]);
      } finally {
        if (seq === composeLookupSeq.current) {
          setComposeSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [composeModalOpen, composeRecipientQuery, user]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

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

  const mailboxPreviewHtml = useMemo(() => {
    if (!previewItemWithBlobAttachments) return null;
    if (previewItemWithBlobAttachments.type === "production_export_share" && sharedExportPreviewHtml) {
      return sharedExportPreviewHtml;
    }
    return buildMailboxPreviewHtml(previewItemWithBlobAttachments);
  }, [previewItemWithBlobAttachments, sharedExportPreviewHtml]);

  useEffect(() => {
    previewAttachmentBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewAttachmentBlobUrlsRef.current = [];
    setPreviewAttachmentBlobUrls({});

    if (!previewItem || previewItem.type !== "direct_message" || !user) return undefined;
    const attachments = parseMailboxAttachments(previewItem).filter((attachment) =>
      attachment.url.startsWith("/api/")
    );
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

  const quickReplyRecipient = useMemo<RecipientOption | null>(() => {
    if (!previewItem || previewItem.type !== "direct_message" || isSentMailboxItem(previewItem)) return null;
    const metadata = previewItem.metadata ?? {};
    const senderEmail = normalizeEmail(metadata.senderEmail);
    if (!senderEmail || !EMAIL_RE.test(senderEmail)) return null;
    const senderName =
      typeof metadata.senderName === "string" && metadata.senderName.trim().length > 0
        ? metadata.senderName.trim()
        : nameFromEmail(senderEmail);
    return {
      email: senderEmail,
      name: senderName,
    };
  }, [previewItem]);

  const quickReplyEnabled = Boolean(
    previewItem && previewItem.type === "direct_message" && quickReplyRecipient
  );

  const closePreviewModal = () => {
    previewAttachmentBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewAttachmentBlobUrlsRef.current = [];
    setPreviewAttachmentBlobUrls({});
    setPreviewItem(null);
    setSharedExportPreviewHtml(null);
    setSharedExportPreviewLoading(false);
    setQuickReplyText("");
    setQuickReplyFiles([]);
    if (quickReplyFileInputRef.current) quickReplyFileInputRef.current.value = "";
    setQuickReplyOpen(false);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    setQuickReplySubmitting(false);
  };

  const markItemsRead = async (ids: string[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser || ids.length === 0) return;
    setSaving(true);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxPatchResponse>(
        currentUser,
        "/api/mailbox",
        {
          method: "PATCH",
          body: JSON.stringify({ ids }),
        }
      );
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id)
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
      setSaving(false);
    }
  };

  const markAllRead = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || unreadCount <= 0) return;
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
    if (!currentUser || ids.length === 0) return;

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
    if (!currentUser || ids.length === 0) return;

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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const selectedVisibleCount = useMemo(
    () => selectedIds.filter((id) => visibleItemIds.includes(id)).length,
    [selectedIds, visibleItemIds]
  );
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;

  const toggleExpandedGroup = (key: string) => {
    setExpandedGroupKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const renderMailboxItemCard = (item: MailboxItem, index: number, compact = false) => {
    const isSent = isSentMailboxItem(item);
    const isTipsterTip = isTipsterTipMailboxItem(item);
    const sentTo = isSent ? sentRecipientText(item) : "";
    const deleting = deletingIds.includes(item.id);
    const snoozed = isMailboxSnoozed(item);
    const snoozing = snoozingIds.includes(item.id);
    const attachments = item.type === "direct_message" ? parseMailboxAttachments(item) : [];
    const itemTitle = isTipsterTip ? tipsterTipListTitle(item) : item.title;
    const itemBody = isTipsterTip ? tipsterTipSenderText(item) : item.body;

    return (
      <div
        key={item.id}
        className={`${styles.mailCard} ${styles.mailItemCard} group relative w-full overflow-hidden rounded-[20px] border ${
          compact ? "p-3" : "p-4"
        } text-left shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)] ${
          isTipsterTip
            ? "border-violet-200 bg-violet-50/70 hover:border-violet-300"
            : item.read
            ? "border-slate-200 bg-white hover:border-violet-200"
            : "border-violet-300 bg-[linear-gradient(180deg,#fbf8ff_0%,#ffffff_100%)] hover:border-violet-400"
        }`}
        style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
      >
        <span
          className={`absolute inset-y-0 left-0 w-1.5 ${
            isTipsterTip
              ? "bg-[linear-gradient(180deg,#8b5cf6_0%,#c084fc_100%)]"
              : item.read
              ? "bg-slate-200"
              : "bg-[linear-gradient(180deg,#020617_0%,#6d28d9_100%)]"
          }`}
          aria-hidden="true"
        />

        <div className={`${styles.mailCardInner} flex items-start justify-between gap-3 pl-2`}>
          <button
            type="button"
            onClick={() => {
              if (selectMode) {
                toggleSelected(item.id);
                return;
              }
              void openItem(item);
            }}
            className={`${styles.mailCardMain} min-w-0 flex-1 text-left`}
          >
            <div className={`${styles.mailTitleRow} flex items-center gap-2`}>
              {selectMode ? (
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[11px] font-bold ${
                    selectedIds.includes(item.id)
                      ? "border-violet-700 bg-violet-700 text-white"
                      : "border-slate-400 bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
              ) : null}
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isTipsterTip ? "bg-violet-500" : item.read ? "bg-slate-300" : "bg-violet-600"
                }`}
              />
              <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                {itemTitle}
              </p>
              {isSent && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                  Odeslané
                </span>
              )}
              {isTipsterTip && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                  TIP
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-700">{itemBody}</p>
            {attachments.length > 0 ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                <Paperclip className="h-3.5 w-3.5" />
                {attachments.length} {attachments.length === 1 ? "příloha" : "příloh"}
              </p>
            ) : null}
            {sentTo ? (
              <p className="mt-1 text-xs text-violet-700">{sentTo}</p>
            ) : null}
            {snoozed ? (
              <p className="mt-1 text-xs font-medium text-violet-700">{formatSnoozedUntil(item)}</p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">{formatDateTime(item.createdAtMs)}</p>
          </button>
          <div className={`${styles.mailCardActions} flex shrink-0 flex-wrap items-center justify-end gap-2`}>
            {!selectMode && !isSent ? (
              snoozed ? (
                <button
                  type="button"
                  onClick={() => void snoozeMailboxItems([item.id], null)}
                  disabled={snoozing}
                  className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Vrátit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void snoozeMailboxItems([item.id], snoozeUntilAfterDays(1))}
                    disabled={snoozing}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Připomenout zítra
                  </button>
                  <button
                    type="button"
                    onClick={() => void snoozeMailboxItems([item.id], snoozeUntilAfterDays(7))}
                    disabled={snoozing}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Připomenout za týden
                  </button>
                </>
              )
            ) : null}
            <button
              type="button"
              onClick={() => void deleteMailboxItems([item.id])}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Mažu…" : "Smazat"}
            </button>
            {!selectMode ? (
              <button
                type="button"
                onClick={() => void openItem(item)}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 transition group-hover:border-violet-500 group-hover:bg-violet-50 group-hover:text-slate-950"
              >
                Otevřít
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const toggleSelectAllVisible = () => {
    if (visibleItems.length === 0) return;
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
    setComposeErrorText(null);
    setComposeRecipientQuery("");
    setComposeSelectedRecipient(null);
    setComposeSuggestions([]);
    setComposeSuggestionsLoading(false);
    setComposeSubject("");
    setComposeMessageText("");
    setComposeFiles([]);
    if (composeFileInputRef.current) composeFileInputRef.current.value = "";
  };

  const closeComposeModal = (force = false) => {
    if (composeSubmitting && !force) return;
    composeLookupSeq.current += 1;
    setComposeModalOpen(false);
    setComposeErrorText(null);
    setComposeSuggestions([]);
    setComposeSuggestionsLoading(false);
    setComposeSelectedRecipient(null);
    setComposeRecipientQuery("");
    setComposeSubject("");
    setComposeMessageText("");
    setComposeFiles([]);
    if (composeFileInputRef.current) composeFileInputRef.current.value = "";
  };

  const handleSelectComposeSuggestion = (recipient: RecipientOption) => {
    setComposeSelectedRecipient(recipient);
    setComposeRecipientQuery(`${recipient.name} <${recipient.email}>`);
    setComposeSuggestions([]);
    setComposeErrorText(null);
  };

  const appendComposeEmoji = (emoji: string) => {
    setComposeMessageText((prev) => `${prev}${emoji}`);
  };

  const handleComposeFilesChange = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const current = new Map(composeFiles.map((file) => [`${file.name}-${file.size}`, file]));
    Array.from(list).forEach((file) => {
      current.set(`${file.name}-${file.size}`, file);
    });
    const merged = [...current.values()].slice(0, COMPOSE_FILES_MAX_COUNT);
    setComposeFiles(merged);
    if (composeFileInputRef.current) composeFileInputRef.current.value = "";
  };

  const removeComposeFile = (targetKey: string) => {
    setComposeFiles((prev) => prev.filter((file) => `${file.name}-${file.size}` !== targetKey));
  };

  const appendQuickReplyEmoji = (emoji: string) => {
    setQuickReplyText((prev) => `${prev}${emoji}`);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
  };

  const handleQuickReplyFilesChange = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const current = new Map(quickReplyFiles.map((file) => [`${file.name}-${file.size}`, file]));
    Array.from(list).forEach((file) => {
      current.set(`${file.name}-${file.size}`, file);
    });
    setQuickReplyFiles([...current.values()].slice(0, COMPOSE_FILES_MAX_COUNT));
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    if (quickReplyFileInputRef.current) quickReplyFileInputRef.current.value = "";
  };

  const removeQuickReplyFile = (targetKey: string) => {
    setQuickReplyFiles((prev) => prev.filter((file) => `${file.name}-${file.size}` !== targetKey));
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
  };

  const handleQuickReplySend = async () => {
    if (!user || !previewItem || previewItem.type !== "direct_message") return;
    if (!quickReplyRecipient) {
      setQuickReplyErrorText("U této zprávy nejde určit odesílatele.");
      return;
    }

    const messageText = quickReplyText.trim();
    if (!messageText && quickReplyFiles.length === 0) {
      setQuickReplyErrorText("Napiš text odpovědi nebo přilož soubor.");
      return;
    }

    const formData = new FormData();
    formData.set("recipientEmail", quickReplyRecipient.email);
    formData.set("subject", toReplySubject(previewItem.title).slice(0, COMPOSE_SUBJECT_MAX_LEN));
    formData.set("text", messageText.slice(0, COMPOSE_MESSAGE_MAX_LEN));
    quickReplyFiles.forEach((file) => {
      formData.append("files", file);
    });

    setQuickReplySubmitting(true);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    try {
      await fetchAuthedJsonOrThrow<MailboxComposeResponse>(user, "/api/mailbox/compose", {
        method: "POST",
        body: formData,
      });
      setQuickReplyText("");
      setQuickReplyFiles([]);
      if (quickReplyFileInputRef.current) quickReplyFileInputRef.current.value = "";
      setQuickReplyOpen(false);
      setQuickReplySuccessText(`Odpověď byla odeslána uživateli ${quickReplyRecipient.name}.`);
      await loadMailbox();
    } catch (err: any) {
      setQuickReplyErrorText(err?.message || "Rychlou odpověď se nepodařilo odeslat.");
    } finally {
      setQuickReplySubmitting(false);
    }
  };

  const handleComposeSend = async () => {
    if (!user) return;

    let recipient = composeSelectedRecipient;
    if (!recipient) {
      const exactEmail = normalizeEmail(composeRecipientQuery);
      if (exactEmail && EMAIL_RE.test(exactEmail)) {
        recipient = composeSuggestions.find((option) => option.email === exactEmail) ?? null;
      }
    }
    if (!recipient) {
      setComposeErrorText("Vyber příjemce z našeptávače.");
      return;
    }

    const subject = composeSubject.trim();
    if (!subject) {
      setComposeErrorText("Doplň předmět zprávy.");
      return;
    }

    const messageText = composeMessageText.trim();
    if (!messageText && composeFiles.length === 0) {
      setComposeErrorText("Doplň text zprávy nebo přilož soubor.");
      return;
    }

    const formData = new FormData();
    formData.set("recipientEmail", recipient.email);
    formData.set("subject", subject.slice(0, COMPOSE_SUBJECT_MAX_LEN));
    formData.set("text", messageText.slice(0, COMPOSE_MESSAGE_MAX_LEN));
    composeFiles.forEach((file) => {
      formData.append("files", file);
    });

    setComposeSubmitting(true);
    setComposeErrorText(null);
    try {
      await fetchAuthedJsonOrThrow<MailboxComposeResponse>(user, "/api/mailbox/compose", {
        method: "POST",
        body: formData,
      });
      closeComposeModal(true);
      await loadMailbox();
    } catch (err: any) {
      setComposeErrorText(err?.message || "Zprávu se nepodařilo odeslat.");
    } finally {
      setComposeSubmitting(false);
    }
  };

  const openItem = async (item: MailboxItem) => {
    if (!item.read) {
      await markItemsRead([item.id]);
    }
    if (isTipsterTipMailboxItem(item)) {
      const detailId = tipsterTipDetailId(item);
      if (detailId) {
        router.push(`/tipy/${encodeURIComponent(detailId)}`);
        return;
      }
    }
    setQuickReplyOpen(false);
    setQuickReplyText("");
    setQuickReplyFiles([]);
    if (quickReplyFileInputRef.current) quickReplyFileInputRef.current.value = "";
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    if (item.type === "weekly_team_report") {
      const reportId =
        item.metadata && typeof item.metadata.reportId === "string"
          ? item.metadata.reportId.trim()
          : "";
      const params = new URLSearchParams({ source: "weekly-report" });
      if (reportId) params.set("reportId", reportId);
      router.push(`/muj-tym/tydenni-report?${params.toString()}`);
      return;
    }
    if (item.type === "direct_message") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      return;
    }
    if (item.type === "online_card_meeting_request") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      return;
    }
    if (item.type === "production_plan_share") {
      setSharedExportPreviewHtml(null);
      setSharedExportPreviewLoading(false);
      setPreviewItem(item);
      return;
    }
    if (item.type === "production_export_share") {
      setPreviewItem(item);
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
    if (quickReplyFileInputRef.current) quickReplyFileInputRef.current.value = "";
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    setQuickReplySubmitting(false);
  }, [previewItem]);

  useEffect(() => {
    if (!previewItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewItem(null);
        setSharedExportPreviewHtml(null);
        setSharedExportPreviewLoading(false);
        setQuickReplyText("");
        setQuickReplyFiles([]);
        if (quickReplyFileInputRef.current) quickReplyFileInputRef.current.value = "";
        setQuickReplyOpen(false);
        setQuickReplyErrorText(null);
        setQuickReplySuccessText(null);
        setQuickReplySubmitting(false);
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
        setComposeSelectedRecipient(null);
        setComposeRecipientQuery("");
        setComposeSubject("");
        setComposeMessageText("");
        setComposeFiles([]);
        if (composeFileInputRef.current) composeFileInputRef.current.value = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composeModalOpen, composeSubmitting]);

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
      <div className={`${styles.postaPage} relative min-h-screen w-full overflow-hidden bg-white px-2 pb-10 pt-2 sm:px-3`}>
        <div className={styles.canvas} aria-hidden="true">
          <span className={styles.mesh} />
          <span className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl min-w-0 space-y-4 pt-3 text-slate-900 sm:pt-6">
          <section
            className={`${styles.heroPanel} ${styles.mailHero} rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:p-5`}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex min-w-0 items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-950 bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
                  <Mail className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-800">
                    Pošta
                  </div>

                  <h1 className="mt-2 text-3xl font-bold tracking-[-0.02em] text-slate-950 sm:text-4xl">
                    Notifikační centrum
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-600 sm:text-base">
                    Přehled novinek z týmu, intranetu a reportů na jednom místě.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className={`${styles.heroStats} grid w-full grid-cols-3 gap-2 text-xs text-slate-600 sm:w-auto`}>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Nepřečtené</div>
                    <div className="mt-1 text-lg font-bold leading-none text-violet-800">{unreadCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Přijaté</div>
                    <div className="mt-1 text-lg font-bold leading-none text-violet-800">{activeReceivedItems.length}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Odeslané</div>
                    <div className="mt-1 text-lg font-bold leading-none text-violet-800">{sentItems.length}</div>
                  </div>
                </div>

                <div className={`${styles.heroActions} flex flex-wrap items-center gap-2 xl:justify-end`}>
                <button
                  type="button"
                  onClick={openComposeModal}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-violet-700 bg-[linear-gradient(135deg,#020617_0%,#211442_52%,#6d28d9_100%)] px-4 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_32px_rgba(88,28,135,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:brightness-90`}
                >
                  <SquarePen className="h-4 w-4" />
                  Napsat zprávu
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
                      ? "border-violet-700 bg-[linear-gradient(135deg,#020617_0%,#211442_52%,#6d28d9_100%)] !text-white shadow-[0_14px_32px_rgba(88,28,135,0.24)]"
                      : "border-slate-300 bg-white text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 hover:border-violet-500 hover:bg-violet-50"
                  }`}
                >
                  Označit
                </button>
                <button
                  type="button"
                  onClick={() => void loadMailbox()}
                  disabled={loading || saving}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Obnovit
                </button>
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={saving || unreadCount <= 0}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_32px_rgba(124,58,237,0.24)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:brightness-90`}
                >
                  <CheckCheck className="h-4 w-4" />
                  Vše přečteno
                </button>
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.mailListPanel} overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.07)]`}>
            <div className={`${styles.filterBar} flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5`}>
              <div className={`${styles.filterTabs} inline-flex items-center rounded-2xl border border-slate-200 bg-white p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]`}>
                <button
                  type="button"
                  onClick={() => setMailFilter("all")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "all"
                      ? "bg-[linear-gradient(135deg,#020617_0%,#211442_58%,#6d28d9_100%)] !text-white shadow-[0_8px_18px_rgba(88,28,135,0.2)]"
                      : "text-slate-700 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  Všechny zprávy
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
                  onClick={() => setMailFilter("sent")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "sent"
                      ? "bg-[linear-gradient(135deg,#020617_0%,#211442_58%,#6d28d9_100%)] !text-white shadow-[0_8px_18px_rgba(88,28,135,0.2)]"
                      : "text-slate-700 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  Odeslané
                </button>
              </div>

              <div className={`${styles.visibleCount} rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500`}>
                Zobrazeno: <strong className="text-violet-800">{visibleItems.length}</strong>
              </div>
            </div>

            <div className={`${styles.mailListBody} p-4 sm:p-5`}>
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
              <div className="space-y-3">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-[92px] animate-pulse rounded-[24px] border border-slate-200/85 bg-slate-100/80"
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
              <div className="space-y-3">
                {visibleRows.map((row, index) => {
                  if (row.kind === "item") return renderMailboxItemCard(row.item, index);

                  const expanded = expandedGroupKeys.includes(row.key);
                  const rowIds = row.items.map((item) => item.id);
                  const groupSnoozed = row.items.every((item) => isMailboxSnoozed(item));
                  const groupSnoozing = row.items.some((item) => snoozingIds.includes(item.id));
                  return (
                    <div key={row.key} className="space-y-2">
                      <div className={`${styles.groupCard} relative overflow-hidden rounded-[20px] border border-violet-200 bg-[linear-gradient(180deg,#fbf8ff_0%,#ffffff_100%)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.05)]`}>
                        <span
                          className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#020617_0%,#6d28d9_100%)]"
                          aria-hidden="true"
                        />
                        <div className={`${styles.groupCardInner} flex flex-wrap items-start justify-between gap-3 pl-2`}>
                          <button
                            type="button"
                            onClick={() => toggleExpandedGroup(row.key)}
                            className={`${styles.groupCardMain} min-w-0 flex-1 text-left`}
                            aria-expanded={expanded}
                          >
                            <div className={`${styles.groupTitleRow} flex min-w-0 items-center gap-2`}>
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                                <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
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
                            <p className="mt-2 line-clamp-2 text-sm text-slate-700">{row.body}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              Poslední {formatDateTime(row.latestCreatedAtMs)}
                            </p>
                          </button>

                          <div className={`${styles.groupCardActions} flex shrink-0 flex-wrap items-center justify-end gap-2`}>
                            {groupSnoozed ? (
                              <button
                                type="button"
                                onClick={() => void snoozeMailboxItems(rowIds, null)}
                                disabled={groupSnoozing}
                                className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Vrátit
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void snoozeMailboxItems(rowIds, snoozeUntilAfterDays(1))}
                                  disabled={groupSnoozing}
                                  className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Připomenout zítra
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void snoozeMailboxItems(rowIds, snoozeUntilAfterDays(7))}
                                  disabled={groupSnoozing}
                                  className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Připomenout za týden
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => void openItem(row.latestItem)}
                              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 transition hover:border-violet-500 hover:bg-violet-50 hover:text-slate-950"
                            >
                              Otevřít poslední
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleExpandedGroup(row.key)}
                              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100"
                              aria-expanded={expanded}
                            >
                              {expanded ? "Sbalit" : "Rozbalit"}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {expanded ? (
                        <div className={`${styles.groupChildren} space-y-2 pl-3 sm:pl-5`}>
                          {row.items.map((item, childIndex) =>
                            renderMailboxItemCard(item, index + childIndex + 1, true)
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
              aria-label="Zavřít psaní zprávy"
              onClick={() => closeComposeModal()}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            />

            <div className="relative z-[96] flex min-h-full items-center justify-center p-4">
              <section className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-violet-200 bg-white p-5 shadow-[0_28px_78px_rgba(88,28,135,0.22)] sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800">
                      <SquarePen className="h-3.5 w-3.5" />
                      Napsat zprávu
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                      Nová zpráva
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Vyber příjemce dle jména nebo e-mailu a pošli interní zprávu.
                    </p>
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
                      Příjemce
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="compose-recipient"
                        type="text"
                        value={composeRecipientQuery}
                        onChange={(event) => {
                          setComposeRecipientQuery(event.target.value);
                          setComposeSelectedRecipient(null);
                          setComposeErrorText(null);
                        }}
                        placeholder="Jméno nebo e-mail"
                        autoComplete="off"
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
                            onClick={() => handleSelectComposeSuggestion(option)}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {option.name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {option.email}
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                              Vybrat
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {composeSelectedRecipient ? (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm">
                        <span className="font-semibold text-violet-950">Vybraný příjemce:</span>{" "}
                        <span className="text-violet-950">{composeSelectedRecipient.name}</span>
                        <span className="text-violet-700"> ({composeSelectedRecipient.email})</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="compose-subject"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Předmět
                    </label>
                    <input
                      id="compose-subject"
                      type="text"
                      value={composeSubject}
                      onChange={(event) => {
                        setComposeSubject(event.target.value.slice(0, COMPOSE_SUBJECT_MAX_LEN));
                        setComposeErrorText(null);
                      }}
                      placeholder="Např. Shrnutí týdne"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    />
                    <p className="text-right text-[11px] text-slate-500">
                      {composeSubject.length}/{COMPOSE_SUBJECT_MAX_LEN}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="compose-message"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Text
                    </label>
                    <textarea
                      id="compose-message"
                      rows={5}
                      value={composeMessageText}
                      onChange={(event) => {
                        setComposeMessageText(event.target.value.slice(0, COMPOSE_MESSAGE_MAX_LEN));
                        setComposeErrorText(null);
                      }}
                      placeholder="Napiš zprávu…"
                      className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          <Smile className="h-3.5 w-3.5" />
                          Emoji
                        </span>
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => appendComposeEmoji(emoji)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                            aria-label={`Přidat emoji ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {composeMessageText.length}/{COMPOSE_MESSAGE_MAX_LEN}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Příloha
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
                        <Paperclip className="h-4 w-4" />
                        Přidat soubor
                        <input
                          ref={composeFileInputRef}
                          type="file"
                          multiple
                          onChange={(event) => handleComposeFilesChange(event.target.files)}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-slate-500">
                        Max {COMPOSE_FILES_MAX_COUNT} souborů
                      </span>
                    </div>

                    {composeFiles.length > 0 ? (
                      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                        {composeFiles.map((file) => {
                          const key = `${file.name}-${file.size}`;
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="min-w-0 truncate text-sm text-slate-700">
                                {file.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  {formatFileSize(file.size)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeComposeFile(key)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                                  aria-label={`Odebrat ${file.name}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

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
                      disabled={composeSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-700 bg-[linear-gradient(135deg,#020617_0%,#211442_52%,#6d28d9_100%)] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_30px_rgba(88,28,135,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:brightness-90"
                    >
                      {composeSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {composeSubmitting ? "Odesílám…" : "Odeslat"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {previewItem && mailboxPreviewHtml && (
          <div className="fixed inset-0 z-[90]">
            <button
              type="button"
              aria-label="Zavřít náhled"
              onClick={closePreviewModal}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            />

            <div className="relative z-[91] flex min-h-full items-center justify-center p-4">
              <section
                className={`w-full overflow-hidden rounded-[30px] border border-violet-300 bg-violet-50 shadow-[0_30px_82px_rgba(15,23,42,0.4)] ${
                  previewItem.type === "online_card_meeting_request" ? "max-w-[860px]" : "max-w-[980px]"
                }`}
              >
                <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(130deg,#020617_0%,#211442_58%,#6d28d9_100%)] px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-violet-300" />
                    <span className="h-3 w-3 rounded-full bg-white/80" />
                    <span className="h-3 w-3 rounded-full bg-slate-950 ring-1 ring-white/30" />
                    <span className="truncate text-[12px] font-medium tracking-[0.01em] text-[#f8fafc]">
                      Bohemka.App náhled
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={closePreviewModal}
                    aria-label="Zavřít náhled"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/20 text-white shadow-[0_6px_14px_rgba(2,6,23,0.35)] transition hover:bg-white/30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div
                  className={`relative flex flex-col bg-violet-50 p-0 ${
                    previewItem.type === "online_card_meeting_request"
                      ? "h-[72vh] min-h-[460px]"
                      : "h-[84vh] min-h-[640px]"
                  }`}
                >
                  {previewItem.type === "production_export_share" && sharedExportPreviewLoading ? (
                    <div className="grid h-full place-items-center text-sm font-medium text-slate-700">
                      Načítám přesný náhled exportu…
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1">
                      <iframe
                        srcDoc={mailboxPreviewHtml}
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
                            ? "Detail žádosti o schůzku"
                            : "Náhled zprávy"
                        }
                        className="h-full w-full bg-white"
                      />
                    </div>
                  )}

                  {quickReplyEnabled && quickReplyRecipient ? (
                    quickReplyOpen ? (
                      <div className="border-t border-violet-200 bg-white px-4 py-3 shadow-[0_-14px_30px_rgba(88,28,135,0.10)] sm:px-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700">
                              Rychlá odpověď
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              Odpověď odejde uživateli{" "}
                              <span className="font-semibold text-slate-800">{quickReplyRecipient.name}</span>
                              <span className="text-slate-500"> ({quickReplyRecipient.email})</span>.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] text-slate-500">
                              {quickReplyText.length}/{COMPOSE_MESSAGE_MAX_LEN}
                            </p>
                            <button
                              type="button"
                              onClick={() => setQuickReplyOpen(false)}
                              disabled={quickReplySubmitting}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <X className="h-3.5 w-3.5" />
                              Skrýt
                            </button>
                          </div>
                        </div>

                        <textarea
                          value={quickReplyText}
                          onChange={(event) => {
                            setQuickReplyText(event.target.value);
                            if (quickReplyErrorText) setQuickReplyErrorText(null);
                            if (quickReplySuccessText) setQuickReplySuccessText(null);
                          }}
                          placeholder="Napiš rychlou odpověď…"
                          maxLength={COMPOSE_MESSAGE_MAX_LEN}
                          rows={2}
                          className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                        />

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              <Smile className="h-3.5 w-3.5" />
                              Emoji
                            </span>
                            {QUICK_EMOJIS.map((emoji) => (
                              <button
                                key={`quick-reply-emoji-${emoji}`}
                                type="button"
                                onClick={() => appendQuickReplyEmoji(emoji)}
                                disabled={quickReplySubmitting}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-55"
                                aria-label={`Vložit emoji ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>

                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
                            <Paperclip className="h-3.5 w-3.5" />
                            Přiložit
                            <input
                              ref={quickReplyFileInputRef}
                              type="file"
                              multiple
                              onChange={(event) => handleQuickReplyFilesChange(event.target.files)}
                              disabled={quickReplySubmitting}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {quickReplyFiles.length > 0 ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {quickReplyFiles.map((file) => {
                              const key = `${file.name}-${file.size}`;
                              return (
                                <div
                                  key={key}
                                  className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                                >
                                  <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                                    {file.name}
                                  </span>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-[11px] text-slate-500">
                                      {formatFileSize(file.size)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeQuickReplyFile(key)}
                                      disabled={quickReplySubmitting}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                      aria-label={`Odebrat ${file.name}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {quickReplyErrorText ? (
                          <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {quickReplyErrorText}
                          </p>
                        ) : null}
                        {quickReplySuccessText ? (
                          <p className="mt-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                            {quickReplySuccessText}
                          </p>
                        ) : null}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleQuickReplySend()}
                            disabled={
                              quickReplySubmitting ||
                              (quickReplyText.trim().length === 0 && quickReplyFiles.length === 0)
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-700 bg-[linear-gradient(135deg,#020617_0%,#211442_52%,#6d28d9_100%)] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_30px_rgba(88,28,135,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:brightness-90"
                          >
                            {quickReplySubmitting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            {quickReplySubmitting ? "Odesílám…" : "Odeslat odpověď"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 bg-[linear-gradient(0deg,rgba(15,23,42,0.22)_0%,rgba(15,23,42,0.08)_46%,rgba(15,23,42,0)_100%)] px-4 pb-4 pt-12 sm:px-5">
                        <div className="min-w-0">
                          {quickReplySuccessText ? (
                            <p className="pointer-events-auto rounded-full border border-violet-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-[0_10px_24px_rgba(88,28,135,0.18)]">
                              {quickReplySuccessText}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickReplyOpen(true);
                            setQuickReplySuccessText(null);
                          }}
                          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/40 bg-[linear-gradient(135deg,#020617_0%,#211442_52%,#7c3aed_100%)] px-4 py-2 text-sm font-semibold !text-white shadow-[0_16px_34px_rgba(88,28,135,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(88,28,135,0.32)]"
                        >
                          <SquarePen className="h-4 w-4" />
                          Rychlá odpověď
                        </button>
                      </div>
                    )
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
