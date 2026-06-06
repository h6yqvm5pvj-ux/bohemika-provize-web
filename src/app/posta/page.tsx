"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Space_Grotesk } from "next/font/google";
import {
  CheckCheck,
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

const mailFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function PostaPage() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MailboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mailFilter, setMailFilter] = useState<MailFilterMode>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
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
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [quickReplySubmitting, setQuickReplySubmitting] = useState(false);
  const [quickReplyErrorText, setQuickReplyErrorText] = useState<string | null>(null);
  const [quickReplySuccessText, setQuickReplySuccessText] = useState<string | null>(null);
  const composeLookupSeq = useRef(0);
  const composeFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const sentItems = useMemo(() => items.filter(isSentMailboxItem), [items]);

  const visibleItems = useMemo(() => {
    if (mailFilter === "sent") {
      return sentItems;
    }
    if (mailFilter === "unread") {
      return receivedItems.filter((item) => !item.read);
    }
    return receivedItems;
  }, [mailFilter, receivedItems, sentItems]);

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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const selectedVisibleCount = useMemo(
    () => selectedIds.filter((id) => visibleItemIds.includes(id)).length,
    [selectedIds, visibleItemIds]
  );
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;

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

  const handleQuickReplySend = async () => {
    if (!user || !previewItem || previewItem.type !== "direct_message") return;
    if (!quickReplyRecipient) {
      setQuickReplyErrorText("U této zprávy nejde určit odesílatele.");
      return;
    }

    const messageText = quickReplyText.trim();
    if (!messageText) {
      setQuickReplyErrorText("Napiš text odpovědi.");
      return;
    }

    const formData = new FormData();
    formData.set("recipientEmail", quickReplyRecipient.email);
    formData.set("subject", toReplySubject(previewItem.title).slice(0, COMPOSE_SUBJECT_MAX_LEN));
    formData.set("text", messageText.slice(0, COMPOSE_MESSAGE_MAX_LEN));

    setQuickReplySubmitting(true);
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
    try {
      await fetchAuthedJsonOrThrow<MailboxComposeResponse>(user, "/api/mailbox/compose", {
        method: "POST",
        body: formData,
      });
      setQuickReplyText("");
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
    setQuickReplyOpen(false);
    setQuickReplyText("");
    setQuickReplyErrorText(null);
    setQuickReplySuccessText(null);
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
      <div className={`${mailFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className={styles.canvas} aria-hidden="true">
          <span className={`${styles.orb} ${styles.orbA}`} />
          <span className={`${styles.orb} ${styles.orbB}`} />
          <span className={`${styles.orb} ${styles.orbC}`} />
          <span className={styles.mesh} />
          <span className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl min-w-0 space-y-5 text-slate-900">
          <section
            className={`${styles.heroPanel} rounded-[34px] border border-white/70 bg-white/74 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-6`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">
                  <Mail className="h-3.5 w-3.5" />
                  Pošta
                </div>

                <div>
                  <h1 className="text-3xl font-bold tracking-[-0.02em] text-slate-900 sm:text-4xl">
                    Notifikační centrum
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
                    Přehled novinek z týmu, intranetu a reportů na jednom místě.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Nepřečtené: <strong>{unreadCount}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Přijaté zprávy: <strong>{receivedItems.length}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Odeslané: <strong>{sentItems.length}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={openComposeModal}
                  disabled={loading}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-indigo-700/70 bg-[linear-gradient(135deg,#1d4ed8_0%,#3730a3_100%)] px-4 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_14px_32px_rgba(59,130,246,0.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60`}
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
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectMode
                      ? "border-indigo-700/70 bg-[linear-gradient(135deg,#1d4ed8_0%,#3730a3_100%)] text-white shadow-[0_14px_32px_rgba(59,130,246,0.3)]"
                      : "border-slate-300/90 bg-white/95 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white"
                  }`}
                >
                  Označit
                </button>
                <button
                  type="button"
                  onClick={() => void loadMailbox()}
                  disabled={loading || saving}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-slate-300/90 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Obnovit
                </button>
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={saving || unreadCount <= 0}
                  className={`${styles.actionButton} inline-flex items-center gap-2 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-4 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_14px_32px_rgba(16,185,129,0.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <CheckCheck className="h-4 w-4" />
                  Vše přečteno
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/65 bg-white/74 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.13)] backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-2xl border border-slate-300/85 bg-white/90 p-1">
                <button
                  type="button"
                  onClick={() => setMailFilter("all")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "all"
                      ? "bg-slate-900 text-zinc-50 shadow-[0_6px_16px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  Všechny zprávy
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("unread")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "unread"
                      ? "bg-slate-900 text-zinc-50 shadow-[0_6px_16px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  Jen nepřečtené
                </button>
                <button
                  type="button"
                  onClick={() => setMailFilter("sent")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    mailFilter === "sent"
                      ? "bg-slate-900 text-zinc-50 shadow-[0_6px_16px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  Odeslané
                </button>
              </div>

              <div className="rounded-full border border-slate-300/85 bg-white/85 px-3 py-1 text-xs text-slate-600">
                Zobrazeno: <strong className="text-slate-800">{visibleItems.length}</strong>
              </div>
            </div>

            {selectMode ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-900">
                  Označeno: {selectedVisibleCount}/{visibleItems.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={visibleItems.length === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allVisibleSelected ? "Odznačit vše" : "Označit vše"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    disabled={selectedIds.length === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 px-6 py-10 text-center shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 shadow-[0_10px_28px_rgba(14,165,233,0.22)]">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Schránka je čistá</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                  Ve vybraném filtru zatím nejsou žádné zprávy.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleItems.map((item, index) => {
                  const isSent = isSentMailboxItem(item);
                  const isTipsterTip = isTipsterTipMailboxItem(item);
                  const sentTo = isSent ? sentRecipientText(item) : "";
                  const deleting = deletingIds.includes(item.id);
                  const attachments = item.type === "direct_message" ? parseMailboxAttachments(item) : [];

                  return (
                    <div
                      key={item.id}
                      className={`${styles.mailCard} group relative w-full overflow-hidden rounded-[24px] border p-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 ${
                        isTipsterTip
                          ? "border-violet-200/90 bg-violet-50/88 hover:border-violet-300"
                          : item.read
                          ? "border-slate-200/85 bg-white/92 hover:border-slate-300"
                          : "border-sky-200/90 bg-sky-50/88 hover:border-sky-300"
                      }`}
                      style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 w-1.5 ${
                          isTipsterTip
                            ? "bg-[linear-gradient(180deg,#8b5cf6_0%,#c084fc_100%)]"
                            : item.read
                            ? "bg-slate-200"
                            : "bg-[linear-gradient(180deg,#0ea5e9_0%,#22c55e_100%)]"
                        }`}
                        aria-hidden="true"
                      />

                      <div className="flex items-start justify-between gap-3 pl-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectMode) {
                              toggleSelected(item.id);
                              return;
                            }
                            void openItem(item);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            {selectMode ? (
                              <span
                                className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[11px] font-bold ${
                                  selectedIds.includes(item.id)
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-slate-400 bg-white text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                            ) : null}
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${
                                isTipsterTip ? "bg-violet-500" : item.read ? "bg-slate-300" : "bg-sky-500"
                              }`}
                            />
                            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                              {item.title}
                            </p>
                            {isSent && (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700">
                                Odeslané
                              </span>
                            )}
                            {isTipsterTip && (
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                                TIP
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.body}</p>
                          {attachments.length > 0 ? (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                              <Paperclip className="h-3.5 w-3.5" />
                              {attachments.length} {attachments.length === 1 ? "příloha" : "příloh"}
                            </p>
                          ) : null}
                          {sentTo ? (
                            <p className="mt-1 text-xs text-indigo-700">{sentTo}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500">{formatDateTime(item.createdAtMs)}</p>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
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
                              className="rounded-full border border-slate-300 bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 transition group-hover:border-slate-400 group-hover:text-slate-900"
                            >
                              Otevřít
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
              <section className="w-full max-w-2xl rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_78px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-800">
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
                        className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
                        <span className="font-semibold text-emerald-900">Vybraný příjemce:</span>{" "}
                        <span className="text-emerald-900">{composeSelectedRecipient.name}</span>
                        <span className="text-emerald-700"> ({composeSelectedRecipient.email})</span>
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
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                      className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#1d4ed8_100%)] px-4 py-2 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
              <section className="w-full max-w-[980px] overflow-hidden rounded-[30px] border border-[#9fb2cf] bg-[#d3dae5] shadow-[0_30px_82px_rgba(15,23,42,0.4)]">
                <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(130deg,#020617_0%,#031633_62%,#00153a_100%)] px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#fb7185]" />
                    <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
                    <span className="h-3 w-3 rounded-full bg-[#22c55e]" />
                    <span className="truncate font-mono text-[12px] font-medium tracking-[0.01em] text-[#f8fafc]">
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

                <div className="relative flex h-[84vh] min-h-[640px] flex-col bg-[#d3dae5] p-0">
                  {previewItem.type === "production_export_share" && sharedExportPreviewLoading ? (
                    <div className="grid h-full place-items-center text-sm font-medium text-slate-700">
                      Načítám přesný náhled exportu…
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1">
                      <iframe
                        srcDoc={mailboxPreviewHtml}
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
                      <div className="border-t border-[#bcc9dc] bg-white/92 px-4 py-3 shadow-[0_-14px_30px_rgba(15,23,42,0.10)] sm:px-5">
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
                          className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                        />

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

                        {quickReplyErrorText ? (
                          <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {quickReplyErrorText}
                          </p>
                        ) : null}
                        {quickReplySuccessText ? (
                          <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            {quickReplySuccessText}
                          </p>
                        ) : null}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleQuickReplySend()}
                            disabled={quickReplySubmitting || quickReplyText.trim().length === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#1d4ed8_100%)] px-4 py-2 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
                            <p className="pointer-events-auto rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
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
                          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/40 bg-[linear-gradient(135deg,#7c3aed_0%,#2563eb_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(49,46,129,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(49,46,129,0.40)]"
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
