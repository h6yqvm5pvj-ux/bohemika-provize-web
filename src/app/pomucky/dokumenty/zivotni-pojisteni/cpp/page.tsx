// src/app/pomucky/dokumenty/zivotni-pojisteni/cpp/page.tsx
"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Space_Grotesk } from "next/font/google";
import {
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Paperclip,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UsersRound,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  DEFAULT_TOOL_DOCUMENT_EMOJI,
  DEFAULT_TOOL_DOCUMENT_TABS,
  defaultToolDocumentsForSection,
  getDefaultToolDocumentTab,
  getLifeToolDocumentInsurerBySlug,
  getPropertyToolDocumentInsurerBySlug,
  normalizeToolDocumentEmoji,
  normalizeToolDocumentTabId,
  type ToolDocumentRecord,
  type ToolDocumentsListResponse,
  type ToolDocumentTab,
  type ToolDocumentTabInfo,
} from "@/app/lib/toolDocuments";
import {
  SECURE_DOCUMENT_FILE_NAMES,
  useSecureDocumentBlob,
} from "@/app/lib/secureDocuments";
import SplitTitle from "../../../plan-produkce/SplitTitle";

const documentsFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type ActiveTab = ToolDocumentTab | "sprava";
type EditorTabMode = "existing" | "new";
type DocumentTabInfo = ToolDocumentTabInfo & {
  order: number;
};

type EditorState = {
  id: string | null;
  tab: ToolDocumentTab;
  tabLabel: string;
  emoji: string;
  tabMode: EditorTabMode;
  newTabLabel: string;
  title: string;
  description: string;
  body: string;
  file: File | null;
};

type DocumentNotificationDraft = {
  documentId: string;
  section: ToolDocumentRecord["section"];
  documentTitle: string;
};

const NEW_TAB_VALUE = "__new__";
const QUICK_SECTION_EMOJIS = ["📄", "📝", "📎", "📌", "✅", "💼", "🧾", "📊"] as const;
const DOCUMENT_NOTIFICATION_EMOJIS = ["📄", "📣", "🔔", "✅", "📝", "📎", "💡", "🔥"] as const;
const DOCUMENT_FILE_ACCEPT = "application/pdf,image/png,image/jpeg,image/gif,image/webp,image/avif";
const DOCUMENT_NOTIFICATION_TITLE_MAX = 80;
const DOCUMENT_NOTIFICATION_MESSAGE_MAX = 220;

const emptyEditor = (
  tab: ToolDocumentTab = "prehled",
  tabLabel?: string,
  emoji?: string
): EditorState => {
  const tabDefaults = getDefaultToolDocumentTab(tab);
  return {
    id: null,
    tab,
    tabLabel: tabLabel ?? tabDefaults?.label ?? tab,
    emoji: emoji ?? tabDefaults?.emoji ?? DEFAULT_TOOL_DOCUMENT_EMOJI,
    tabMode: "existing",
    newTabLabel: "",
    title: "",
    description: "",
    body: "",
    file: null,
  };
};

const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString("cs-CZ")} ${date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const formatDate = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
};

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function CppLifeDocumentsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const documentContext = useMemo(() => {
    const slug = pathname.split("/").filter(Boolean).at(-1);
    if (pathname.includes("/pomucky/dokumenty/majetek/")) {
      return {
        insurer: getPropertyToolDocumentInsurerBySlug(slug),
        categoryChip: "Majetek",
        categoryTitle: "Majetek",
        backHref: "/pomucky/dokumenty/majetek",
        backLabel: "Zpět na majetek",
        subject: "majetkové pojištění",
      };
    }

    return {
      insurer: getLifeToolDocumentInsurerBySlug(slug),
      categoryChip: "Život",
      categoryTitle: "Životní pojištění",
      backHref: "/pomucky/dokumenty/zivotni-pojisteni",
      backLabel: "Zpět na životní pojištění",
      subject: "životní pojištění",
    };
  }, [pathname]);
  const currentInsurer = documentContext.insurer;
  const fallbackDocuments = useMemo(
    () => defaultToolDocumentsForSection(currentInsurer.section),
    [currentInsurer.section]
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("prehled");
  const [documents, setDocuments] = useState<ToolDocumentRecord[]>(fallbackDocuments);
  const [searchQuery, setSearchQuery] = useState("");
  const [canManageDocuments, setCanManageDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor());
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirmationDoc, setDeleteConfirmationDoc] = useState<ToolDocumentRecord | null>(
    null
  );
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [documentNotificationDraft, setDocumentNotificationDraft] =
    useState<DocumentNotificationDraft | null>(null);
  const [documentNotificationEmoji, setDocumentNotificationEmoji] = useState("📄");
  const [documentNotificationTitle, setDocumentNotificationTitle] = useState("");
  const [documentNotificationMessage, setDocumentNotificationMessage] = useState("");
  const [documentNotificationBusy, setDocumentNotificationBusy] = useState(false);
  const [documentNotificationStatus, setDocumentNotificationStatus] = useState<string | null>(null);
  const [documentNotificationError, setDocumentNotificationError] = useState<string | null>(null);
  const [requestedDocumentId, setRequestedDocumentId] = useState<string | null>(null);

  const activeDocumentMeta = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents]
  );
  const activeDocumentHasFile = Boolean(
    activeDocumentMeta?.fileName && activeDocumentMeta.contentType
  );
  const activeDocument = useSecureDocumentBlob(
    activeDocumentHasFile ? activeDocumentMeta?.id ?? null : null
  );
  const activeDownloadName = activeDocumentMeta
    ? SECURE_DOCUMENT_FILE_NAMES[activeDocumentMeta.id] ?? activeDocumentMeta.fileName
    : "dokument";

  const documentTabs = useMemo<DocumentTabInfo[]>(() => {
    const tabs = new Map<ToolDocumentTab, DocumentTabInfo>();

    DEFAULT_TOOL_DOCUMENT_TABS.forEach((tab, index) => {
      tabs.set(tab.id, { ...tab, order: index });
    });

    documents.forEach((doc, index) => {
      const fallback = getDefaultToolDocumentTab(doc.tab);
      const existing = tabs.get(doc.tab);
      tabs.set(doc.tab, {
        id: doc.tab,
        label: doc.tabLabel || existing?.label || fallback?.label || doc.tab,
        emoji: doc.emoji || existing?.emoji || fallback?.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI,
        order: existing?.order ?? 100 + index,
      });
    });

    return Array.from(tabs.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, "cs");
    });
  }, [documents]);

  const tabInfoById = useMemo(
    () => new Map(documentTabs.map((tab) => [tab.id, tab])),
    [documentTabs]
  );

  const resolveTabInfo = useCallback(
    (tab: ToolDocumentTab): ToolDocumentTabInfo => {
      const fallback = getDefaultToolDocumentTab(tab);
      return (
        tabInfoById.get(tab) ?? {
          id: tab,
          label: fallback?.label ?? tab,
          emoji: fallback?.emoji ?? DEFAULT_TOOL_DOCUMENT_EMOJI,
        }
      );
    },
    [tabInfoById]
  );

  const filteredDocuments = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim());
    if (!query) return documents;

    return documents.filter((doc) => {
      const haystack = normalizeSearchText(
        [
          doc.title,
          doc.description,
          doc.fileName,
          doc.tabLabel,
          doc.emoji,
          formatDate(doc.publishedAt),
          doc.body.join(" "),
        ].join(" ")
      );
      return haystack.includes(query);
    });
  }, [documents, searchQuery]);

  const activeTabDocuments = useMemo(
    () =>
      activeTab === "sprava"
        ? []
        : filteredDocuments.filter((doc) => doc.tab === activeTab && !doc.isInvalid),
    [activeTab, filteredDocuments]
  );

  const loadDocuments = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setDocuments(fallbackDocuments);
      setCanManageDocuments(false);
      return;
    }

    setDocumentsError(null);
    try {
      const payload = (await fetchAuthedJsonOrThrow(user, `/api/documents/manage?section=${currentInsurer.section}`)) as ToolDocumentsListResponse;
      setDocuments(payload.documents);
      setCanManageDocuments(payload.canManage);
      if (!payload.canManage && activeTab === "sprava") setActiveTab("prehled");
    } catch (error) {
      setDocuments(fallbackDocuments);
      setCanManageDocuments(false);
      setDocumentsError(
        error instanceof Error ? error.message : "Dokumenty se nepodařilo načíst."
      );
    }
  }, [activeTab, currentInsurer.section, fallbackDocuments]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {
      void loadDocuments();
    });
    return () => unsub();
  }, [loadDocuments]);

  useEffect(() => {
    setDocuments(fallbackDocuments);
    setActiveDocumentId(null);
    setAddModalOpen(false);
    setDeleteConfirmationDoc(null);
    setActiveTab("prehled");
    setEditor(emptyEditor("prehled"));
    setEditorStatus(null);
    setEditorError(null);
    setFileInputKey((key) => key + 1);
  }, [currentInsurer.section, fallbackDocuments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRequestedDocumentId(new URLSearchParams(window.location.search).get("document"));
  }, [pathname]);

  useEffect(() => {
    if (!requestedDocumentId) return;
    const normalized = requestedDocumentId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!normalized) return;
    const target = documents.find((doc) => doc.id === normalized);
    if (!target) return;
    setActiveTab(target.tab);
    setActiveDocumentId(target.id);
  }, [documents, requestedDocumentId]);

  useEffect(() => {
    if (activeTab === "sprava" || tabInfoById.has(activeTab)) return;
    setActiveTab(documentTabs[0]?.id ?? "prehled");
  }, [activeTab, documentTabs, tabInfoById]);

  const buildNewTabId = useCallback(
    (label: string): ToolDocumentTab => {
      const existingIds = new Set(documentTabs.map((tab) => tab.id));
      const base = normalizeToolDocumentTabId(label) || "nova-sekce";
      let candidate = base;
      let suffix = 2;

      while (existingIds.has(candidate)) {
        const tail = `-${suffix}`;
        candidate = `${base.slice(0, 48 - tail.length)}${tail}`;
        suffix += 1;
      }

      return candidate;
    },
    [documentTabs]
  );

  const selectEditorTab = useCallback(
    (tab: ToolDocumentTab) => {
      const tabInfo = resolveTabInfo(tab);
      setEditor((current) => ({
        ...current,
        tab,
        tabLabel: tabInfo.label,
        emoji: tabInfo.emoji,
        tabMode: "existing",
        newTabLabel: "",
      }));
    },
    [resolveTabInfo]
  );

  const applySelectedFile = useCallback((file: File | null) => {
    setEditor((current) => ({ ...current, file }));
  }, []);

  const handleFileDrag = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setFileDropActive(true);
  };

  const handleFileDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setFileDropActive(false);
  };

  const handleFileDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setFileDropActive(false);
    applySelectedFile(event.dataTransfer.files?.[0] ?? null);
  };

  const renderFileUploadField = ({
    inputId,
    label,
    helper,
  }: {
    inputId: string;
    label: string;
    helper: string;
  }) => {
    const selectedFile = editor.file;
    const SelectedIcon = selectedFile?.type.startsWith("image/") ? ImageIcon : FileText;
    const selectedSize = selectedFile ? formatFileSize(selectedFile.size) : "";

    return (
      <div className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </span>
        <label
          htmlFor={inputId}
          onDragEnter={handleFileDrag}
          onDragOver={handleFileDrag}
          onDragLeave={handleFileDragLeave}
          onDrop={handleFileDrop}
          className={`group flex min-h-[5.25rem] cursor-pointer flex-col gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition sm:flex-row sm:items-center sm:justify-between ${
            fileDropActive
              ? "border-slate-900 bg-slate-100 shadow-[0_14px_28px_rgba(15,23,42,0.10)]"
              : selectedFile
                ? "border-emerald-300 bg-emerald-50/70 hover:border-emerald-400"
                : "border-slate-300 bg-white/85 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${
                selectedFile
                  ? "border-emerald-200 bg-white text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {selectedFile ? (
                selectedFile.type.startsWith("image/") ? (
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <SelectedIcon className="h-5 w-5" aria-hidden="true" />
                )
              ) : (
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-bold text-slate-900">
                {selectedFile ? selectedFile.name : "Přetáhni soubor sem nebo klikni pro výběr"}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                {selectedFile
                  ? `${selectedFile.type.startsWith("image/") ? "Obrázek" : "PDF"}${
                      selectedSize ? ` • ${selectedSize}` : ""
                    }`
                  : helper}
              </span>
            </span>
          </span>
          <span
            className={`inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition ${
              selectedFile
                ? "border border-emerald-200 bg-white text-emerald-800 group-hover:border-emerald-300"
                : "border border-slate-900 bg-slate-900 text-white group-hover:bg-slate-800"
            }`}
          >
            {selectedFile ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            )}
            {selectedFile ? "Změnit soubor" : "Vybrat soubor"}
          </span>
          <input
            id={inputId}
            key={fileInputKey}
            type="file"
            accept={DOCUMENT_FILE_ACCEPT}
            className="sr-only"
            onChange={(event) => applySelectedFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    );
  };

  const startCreate = (tab: ToolDocumentTab) => {
    const tabInfo = resolveTabInfo(tab);
    setEditor(emptyEditor(tab, tabInfo.label, tabInfo.emoji));
    setEditorStatus(null);
    setEditorError(null);
    setFileInputKey((key) => key + 1);
    setAddModalOpen(true);
  };

  const openManageDocuments = () => {
    setActiveDocumentId(null);
    setEditorStatus(null);
    setEditorError(null);
    setActiveTab("sprava");
  };

  const openDocumentDetail = (doc: ToolDocumentRecord) => {
    setActiveTab(doc.tab);
    setActiveDocumentId(doc.id);
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search
    );
    params.set("document", doc.id);
    setRequestedDocumentId(doc.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeDocumentDetail = () => {
    setActiveDocumentId(null);
    setRequestedDocumentId(null);
    if (!requestedDocumentId) return;
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search
    );
    params.delete("document");
    params.delete("source");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const startEdit = (doc: ToolDocumentRecord) => {
    setEditor({
      id: doc.id,
      tab: doc.tab,
      tabLabel: doc.tabLabel || resolveTabInfo(doc.tab).label,
      emoji: doc.emoji || resolveTabInfo(doc.tab).emoji,
      tabMode: "existing",
      newTabLabel: "",
      title: doc.title,
      description: doc.description,
      body: doc.body.join("\n"),
      file: null,
    });
    setEditorStatus(null);
    setEditorError(null);
    setFileInputKey((key) => key + 1);
    setAddModalOpen(false);
    setActiveTab("sprava");
  };

  const closeAddModal = () => {
    if (editorBusy) return;
    setAddModalOpen(false);
    setEditor(emptyEditor(editor.tab, editor.tabLabel, editor.emoji));
    setEditorStatus(null);
    setEditorError(null);
    setFileInputKey((key) => key + 1);
  };

  const closeDocumentNotificationPrompt = () => {
    if (documentNotificationBusy) return;
    setDocumentNotificationDraft(null);
    setDocumentNotificationEmoji("📄");
    setDocumentNotificationTitle("");
    setDocumentNotificationMessage("");
    setDocumentNotificationStatus(null);
    setDocumentNotificationError(null);
  };

  const prepareDocumentNotificationPrompt = ({
    documentId,
    documentTitle,
    description,
    emoji,
  }: {
    documentId: string;
    documentTitle: string;
    description: string;
    emoji: string;
  }) => {
    setDocumentNotificationDraft({
      documentId,
      section: currentInsurer.section,
      documentTitle,
    });
    setDocumentNotificationEmoji(normalizeToolDocumentEmoji(emoji, "📄"));
    setDocumentNotificationTitle(
      `Nový dokument: ${documentTitle}`.slice(0, DOCUMENT_NOTIFICATION_TITLE_MAX)
    );
    setDocumentNotificationMessage(
      (description.trim() ||
        `V dokumentech ${currentInsurer.title} je přidaný nový materiál.`).slice(
        0,
        DOCUMENT_NOTIFICATION_MESSAGE_MAX
      )
    );
    setDocumentNotificationStatus(null);
    setDocumentNotificationError(null);
  };

  const sendDocumentNotification = async () => {
    const user = auth.currentUser;
    if (!user || !documentNotificationDraft) return;

    const title = documentNotificationTitle.trim();
    const message = documentNotificationMessage.trim();
    if (!title || !message) {
      setDocumentNotificationError("Vyplň nadpis i popisek notifikace.");
      return;
    }

    setDocumentNotificationBusy(true);
    setDocumentNotificationError(null);
    setDocumentNotificationStatus(null);
    try {
      const payload = (await fetchAuthedJsonOrThrow(user, "/api/documents/notify", {
        method: "POST",
        body: JSON.stringify({
          id: documentNotificationDraft.documentId,
          section: documentNotificationDraft.section,
          emoji: documentNotificationEmoji,
          title,
          message,
        }),
      })) as {
        ok?: boolean;
        sent?: number;
        recipients?: number;
        matchedUsers?: number;
      };

      const sent = typeof payload.sent === "number" ? payload.sent : 0;
      const recipients = typeof payload.recipients === "number" ? payload.recipients : null;
      const matchedUsers =
        typeof payload.matchedUsers === "number" ? payload.matchedUsers : null;
      const details = [
        matchedUsers != null ? `poradci ${matchedUsers}` : null,
        recipients != null ? `příjemci ${recipients}` : null,
      ].filter(Boolean);
      setDocumentNotificationStatus(
        details.length > 0
          ? `Notifikace odeslána. Doručeno ${sent}. ${details.join(", ")}.`
          : `Notifikace odeslána. Doručeno ${sent}.`
      );
    } catch (error) {
      setDocumentNotificationError(
        error instanceof Error ? error.message : "Notifikaci se nepodařilo odeslat."
      );
    } finally {
      setDocumentNotificationBusy(false);
    }
  };

  const submitEditor = async () => {
    const user = auth.currentUser;
    if (!user || !canManageDocuments) return;

    const title = editor.title.trim();
    if (!title) {
      setEditorError("Název dokumentu je povinný.");
      return;
    }
    if (!editor.id && !editor.file) {
      setEditorError("U nového dokumentu přilož PDF nebo obrázek.");
      return;
    }
    const currentTabInfo = resolveTabInfo(editor.tab);
    const nextTabLabel =
      editor.tabMode === "new" ? editor.newTabLabel.trim() : editor.tabLabel.trim();
    if (editor.tabMode === "new" && !nextTabLabel) {
      setEditorError("Zadej název nové sekce.");
      return;
    }
    const nextTab = editor.tabMode === "new" ? buildNewTabId(nextTabLabel) : editor.tab;
    const nextEmoji = normalizeToolDocumentEmoji(
      editor.emoji,
      currentTabInfo.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI
    );
    const resolvedTabLabel = nextTabLabel || currentTabInfo.label;

    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const form = new FormData();
      if (editor.id) form.set("id", editor.id);
      form.set("section", currentInsurer.section);
      form.set("tab", nextTab);
      form.set("tabLabel", resolvedTabLabel);
      form.set("emoji", nextEmoji);
      form.set("title", title);
      form.set("description", editor.description.trim());
      form.set("body", editor.body.trim());
      if (editor.file) form.set("file", editor.file);

      const payload = (await fetchAuthedJsonOrThrow(user, "/api/documents/manage", {
        method: editor.id ? "PATCH" : "POST",
        body: form,
      })) as { ok?: boolean; id?: string; documents?: ToolDocumentRecord[] };

      if (payload.documents) setDocuments(payload.documents);
      setEditorStatus(editor.id ? "Dokument byl uložen." : "Dokument byl přidán.");
      if (!editor.id) setActiveTab(nextTab);
      if (addModalOpen && !editor.id) {
        setAddModalOpen(false);
      }
      if (!editor.id && payload.id) {
        prepareDocumentNotificationPrompt({
          documentId: payload.id,
          documentTitle: title,
          description: editor.description,
          emoji: nextEmoji,
        });
      }
      setEditor(emptyEditor(nextTab, resolvedTabLabel, nextEmoji));
      setFileInputKey((key) => key + 1);
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : "Dokument se nepodařilo uložit."
      );
    } finally {
      setEditorBusy(false);
    }
  };

  const setDocumentInvalidState = async (doc: ToolDocumentRecord, invalid: boolean) => {
    const user = auth.currentUser;
    if (!user || !canManageDocuments) return;
    const confirmed = window.confirm(
      invalid
        ? `Označit dokument „${doc.title}“ jako neplatný? Poradcům se přestane zobrazovat.`
        : `Obnovit dokument „${doc.title}“ mezi platné dokumenty?`
    );
    if (!confirmed) return;

    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const payload = (await fetchAuthedJsonOrThrow(user, "/api/documents/manage", {
        method: "PATCH",
        body: JSON.stringify({
          id: doc.id,
          section: currentInsurer.section,
          action: invalid ? "invalidate" : "restore",
        }),
      })) as { ok?: boolean; documents?: ToolDocumentRecord[] };

      if (payload.documents) setDocuments(payload.documents);
      if (invalid && activeDocumentId === doc.id) closeDocumentDetail();
      setEditorStatus(invalid ? "Dokument byl označen jako neplatný." : "Dokument byl obnoven.");
    } catch (error) {
      const fallbackMessage = invalid
        ? "Dokument se nepodařilo označit jako neplatný."
        : "Dokument se nepodařilo obnovit.";
      setEditorError(
        error instanceof Error ? error.message : fallbackMessage
      );
    } finally {
      setEditorBusy(false);
    }
  };

  const deleteDocumentPermanently = async (doc: ToolDocumentRecord) => {
    const user = auth.currentUser;
    if (!user || !canManageDocuments) return;

    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const payload = (await fetchAuthedJsonOrThrow(user, "/api/documents/manage", {
        method: "DELETE",
        body: JSON.stringify({
          id: doc.id,
          section: currentInsurer.section,
          permanent: true,
        }),
      })) as { ok?: boolean; documents?: ToolDocumentRecord[] };

      setDocuments((current) => {
        const nextDocuments = Array.isArray(payload.documents) ? payload.documents : current;
        return nextDocuments.filter((item) => item.id !== doc.id);
      });
      if (activeDocumentId === doc.id) closeDocumentDetail();
      if (editor.id === doc.id) {
        setEditor(emptyEditor(doc.tab, doc.tabLabel, doc.emoji));
        setFileInputKey((key) => key + 1);
      }
      setDeleteConfirmationDoc(null);
      setEditorStatus("Dokument byl trvale smazán.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dokument se nepodařilo smazat.";
      if (message.includes("Dokument nebyl nalezen")) {
        setDocuments((current) => current.filter((item) => item.id !== doc.id));
        if (activeDocumentId === doc.id) closeDocumentDetail();
        if (editor.id === doc.id) {
          setEditor(emptyEditor(doc.tab, doc.tabLabel, doc.emoji));
          setFileInputKey((key) => key + 1);
        }
        setDeleteConfirmationDoc(null);
        setEditorStatus("Dokument už byl smazán. Seznam jsem aktualizoval.");
      } else {
        setEditorError(message);
      }
    } finally {
      setEditorBusy(false);
    }
  };

  const renderDocumentCard = (doc: ToolDocumentRecord, variant: "wide" | "compact") => {
    const Icon = doc.isImage ? ImageIcon : FileText;
    const isWide = variant === "wide";
    const publishedDate = formatDate(doc.publishedAt);
    return (
      <article
        key={doc.id}
        className={`group relative overflow-hidden rounded-[24px] border border-cyan-200/85 bg-[linear-gradient(135deg,#f8fafc_0%,#eff6ff_56%,#ffffff_100%)] px-5 py-5 text-left shadow-[0_14px_30px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:border-cyan-300 ${
          isWide ? "" : "min-h-[170px]"
        }`}
      >
        <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
        <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-cyan-700">
          <span className="text-sm leading-none" aria-hidden="true">
            {doc.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI}
          </span>
          <Icon className="h-3.5 w-3.5" />
          {doc.isImage ? "Náhled dokumentu" : "Dokument"}
        </p>
        <h3 className={`mt-2 font-bold leading-tight tracking-[-0.015em] text-slate-900 ${
          isWide ? "text-[2rem] sm:text-[2.2rem]" : "text-2xl"
        }`}>
          {doc.title}
        </h3>
        <p className="mt-2 text-sm text-slate-600">{doc.description || doc.fileName}</p>
        {publishedDate ? (
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Zveřejněno {publishedDate}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openDocumentDetail(doc)}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-cyan-400 hover:bg-cyan-50"
          >
            Otevřít dokument
            <ArrowUpRight className="h-4 w-4" />
          </button>
          {canManageDocuments ? (
            <button
              type="button"
              onClick={() => startEdit(doc)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            >
              <Pencil className="h-4 w-4" />
              Upravit
            </button>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <AppLayout active="tools">
      <div className={`${documentsFont.className} w-full px-4 pb-10 pt-2 sm:px-5`}>
        <div
          className={`mx-auto max-w-[1040px] space-y-5 transition-[filter,opacity] duration-200 ${
            activeDocumentId || addModalOpen ? "pointer-events-none select-none blur-[2px] opacity-90" : ""
          }`}
        >
          <header className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f7fbff_55%,#eef6ff_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.1)] sm:px-8 sm:py-8">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
            <div
              className="pointer-events-none absolute right-1 top-1/2 hidden h-48 w-72 -translate-y-1/2 opacity-[0.08] sm:block lg:right-4 lg:h-64 lg:w-96"
              aria-hidden="true"
            >
              <Image
                src={currentInsurer.logo}
                alt=""
                fill
                sizes="224px"
                className="object-contain"
              />
            </div>
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-4 lg:max-w-[70%]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                    <Sparkles className="h-3.5 w-3.5" />
                    {currentInsurer.shortLabel} {documentContext.categoryChip} • Dokumenty
                  </span>
                  <Link
                    href={documentContext.backHref}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {documentContext.backLabel}
                  </Link>
                  <Link
                    href="/pomucky/dokumenty"
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Zpět na dokumenty
                  </Link>
                </div>

                <SplitTitle text={`${currentInsurer.title} Dokumenty`} className="!text-4xl !text-slate-900 sm:!text-5xl" />
                <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                  Rozcestník dokumentů pro {documentContext.subject} {currentInsurer.title}. Vyber režim práce, otevři náhledy a stáhni potřebné podklady.
                </p>
              </div>

              {canManageDocuments ? (
                <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => startCreate(activeTab === "sprava" ? documentTabs[0]?.id ?? "prehled" : activeTab)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-950 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Přidat
                  </button>
                  <button
                    type="button"
                    onClick={openManageDocuments}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-[0_14px_28px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 ${
                      activeTab === "sprava"
                        ? "border-cyan-500 bg-cyan-600 text-white hover:bg-cyan-700"
                        : "border-cyan-200 bg-white text-cyan-800 hover:border-cyan-300 hover:bg-cyan-50"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Spravovat
                  </button>
                </div>
              ) : null}
            </div>
          </header>
          {documentsError ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              {documentsError}
            </p>
          ) : null}

          <section className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="w-full md:max-w-sm">
              <label htmlFor="cpp-documents-search" className="sr-only">
                Hledat dokumenty
              </label>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="cpp-documents-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Hledat dokument..."
                  className="h-[58px] w-full bg-transparent py-2 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="inline-flex w-fit flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              {documentTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    closeDocumentDetail();
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? "border border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.24)]"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base leading-none" aria-hidden="true">
                    {tab.emoji}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab !== "sprava" ? (
            <section className="space-y-4">
              {activeTabDocuments.length > 0 ? (
                activeTab === "prehled" ? (
                  activeTabDocuments.map((doc) => renderDocumentCard(doc, "wide"))
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {activeTabDocuments.map((doc) => renderDocumentCard(doc, "compact"))}
                  </div>
                )
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
                  Žádný dokument neodpovídá hledání.
                </div>
              )}
            </section>
          ) : canManageDocuments ? (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Dokumenty v sekci</h3>
                    <p className="text-sm text-slate-600">
                      Uprav položku, označ ji jako neplatnou nebo ji trvale smaž.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startCreate(documentTabs[0]?.id ?? "prehled")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black"
                  >
                    <Plus className="h-4 w-4" />
                    Nový
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`rounded-2xl border px-3 py-3 ${
                        doc.isInvalid
                          ? "border-amber-200 bg-amber-50/70"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4
                              className={`break-words text-sm font-bold ${
                                doc.isInvalid ? "text-amber-950" : "text-slate-900"
                              }`}
                            >
                              {doc.title}
                            </h4>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                              {doc.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI} {doc.tabLabel || resolveTabInfo(doc.tab).label}
                            </span>
                            {doc.isInvalid ? (
                              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                Neplatný
                              </span>
                            ) : null}
                            {doc.isDefault ? (
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                                Výchozí
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {doc.fileName || "Bez přílohy"}
                          </p>
                          {doc.publishedAt ? (
                            <p className="mt-1 text-[11px] text-slate-400">
                              Zveřejněno: {formatDate(doc.publishedAt)}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-slate-400">
                            Upraveno: {formatDateTime(doc.updatedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(doc)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-500"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void setDocumentInvalidState(doc, !doc.isInvalid)}
                            disabled={editorBusy}
                            className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                              doc.isInvalid
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            {doc.isInvalid ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                            {doc.isInvalid ? "Obnovit" : "Neplatný"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmationDoc(doc)}
                            disabled={editorBusy}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Smazat
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredDocuments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm font-semibold text-slate-500">
                      Žádný dokument neodpovídá hledání.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                {editor.id ? (
                  <>
                    <div className="flex items-center gap-2">
                      <FilePlus2 className="h-5 w-5 text-slate-700" />
                      <h3 className="text-lg font-semibold text-slate-900">Editace dokumentu</h3>
                    </div>

                    <div className="mt-4 space-y-3">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sekce</span>
                        <select
                          value={editor.tabMode === "new" ? NEW_TAB_VALUE : editor.tab}
                          onChange={(event) => {
                            if (event.target.value === NEW_TAB_VALUE) {
                              setEditor((current) => ({
                                ...current,
                                tabMode: "new",
                                newTabLabel: current.newTabLabel || "",
                                tabLabel: current.newTabLabel || "Nová sekce",
                                emoji: current.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI,
                              }));
                              return;
                            }
                            selectEditorTab(event.target.value);
                          }}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                        >
                          {documentTabs.map((tab) => (
                            <option key={tab.id} value={tab.id}>
                              {tab.emoji} {tab.label}
                            </option>
                          ))}
                          <option value={NEW_TAB_VALUE}>+ Nová sekce</option>
                        </select>
                      </label>

                      {editor.tabMode === "new" ? (
                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Název nové sekce
                          </span>
                          <input
                            type="text"
                            value={editor.newTabLabel}
                            onChange={(event) =>
                              setEditor((current) => ({
                                ...current,
                                newTabLabel: event.target.value,
                                tabLabel: event.target.value,
                              }))
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                            maxLength={80}
                            placeholder="Např. Metodika"
                          />
                        </label>
                      ) : null}

                      <div className="space-y-2">
                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Emoji sekce
                          </span>
                          <input
                            type="text"
                            value={editor.emoji}
                            onChange={(event) =>
                              setEditor((current) => ({ ...current, emoji: event.target.value }))
                            }
                            className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-center text-xl text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                            maxLength={8}
                          />
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_SECTION_EMOJIS.map((emoji) => (
                            <button
                              key={`edit-${emoji}`}
                              type="button"
                              onClick={() => setEditor((current) => ({ ...current, emoji }))}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-base transition hover:border-cyan-300 hover:bg-cyan-50"
                              aria-label={`Vybrat emoji ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Název</span>
                        <input
                          type="text"
                          value={editor.title}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, title: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                          maxLength={140}
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Popis</span>
                        <input
                          type="text"
                          value={editor.description}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, description: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                          maxLength={420}
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Poznámky / pravidla</span>
                        <textarea
                          value={editor.body}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, body: event.target.value }))
                          }
                          className="min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                          placeholder="Každé pravidlo na nový řádek."
                          maxLength={4000}
                        />
                      </label>

                      {renderFileUploadField({
                        inputId: "cpp-document-edit-file",
                        label: "Příloha (volitelné, ponechá stávající)",
                        helper: "PDF nebo obrázek. Když nic nevybereš, zůstane původní soubor.",
                      })}

                      {editorStatus ? (
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                          {editorStatus}
                        </p>
                      ) : null}
                      {editorError ? (
                        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                          {editorError}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditor(emptyEditor(editor.tab, editor.tabLabel, editor.emoji));
                            setEditorError(null);
                            setEditorStatus(null);
                            setFileInputKey((key) => key + 1);
                          }}
                          disabled={editorBusy}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          <X className="h-4 w-4" />
                          Zrušit
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitEditor()}
                          disabled={editorBusy}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
                        >
                          {editorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Uložit
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                    <FilePlus2 className="h-8 w-8 text-slate-400" />
                    <h3 className="mt-3 text-lg font-semibold text-slate-900">Vyber dokument k úpravě</h3>
                    <p className="mt-1 max-w-xs text-sm text-slate-500">
                      Pro nový dokument použij tlačítko Přidat. Editaci otevřeš přes tlačítko Edit u konkrétní položky.
                    </p>
                    <button
                      type="button"
                      onClick={() => startCreate(documentTabs[0]?.id ?? "prehled")}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                    >
                      <Plus className="h-4 w-4" />
                      Přidat dokument
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {addModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-3 py-5"
          role="dialog"
          aria-modal="true"
          aria-label="Přidat dokument"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
            onClick={closeAddModal}
            aria-label="Zavřít přidání dokumentu"
          />
          <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_34px_92px_rgba(15,23,42,0.34)] sm:p-6">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Nový dokument
                </span>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  Přidat dokument
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={editorBusy}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sekce</span>
                <select
                  value={editor.tabMode === "new" ? NEW_TAB_VALUE : editor.tab}
                  onChange={(event) => {
                    if (event.target.value === NEW_TAB_VALUE) {
                      setEditor((current) => ({
                        ...current,
                        tabMode: "new",
                        newTabLabel: current.newTabLabel || "",
                        tabLabel: current.newTabLabel || "Nová sekce",
                        emoji: current.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI,
                      }));
                      return;
                    }
                    selectEditorTab(event.target.value);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                >
                  {documentTabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.emoji} {tab.label}
                    </option>
                  ))}
                  <option value={NEW_TAB_VALUE}>+ Nová sekce</option>
                </select>
              </label>

              {editor.tabMode === "new" ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Název nové sekce
                  </span>
                  <input
                    type="text"
                    value={editor.newTabLabel}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        newTabLabel: event.target.value,
                        tabLabel: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                    maxLength={80}
                    placeholder="Např. Metodika"
                  />
                </label>
              ) : null}

              <div className="space-y-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Emoji sekce
                  </span>
                  <input
                    type="text"
                    value={editor.emoji}
                    onChange={(event) =>
                      setEditor((current) => ({ ...current, emoji: event.target.value }))
                    }
                    className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-center text-xl text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                    maxLength={8}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SECTION_EMOJIS.map((emoji) => (
                    <button
                      key={`add-${emoji}`}
                      type="button"
                      onClick={() => setEditor((current) => ({ ...current, emoji }))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-base transition hover:border-cyan-300 hover:bg-cyan-50"
                      aria-label={`Vybrat emoji ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Název</span>
                <input
                  type="text"
                  value={editor.title}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, title: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                  maxLength={140}
                  autoFocus
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Popis</span>
                <input
                  type="text"
                  value={editor.description}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, description: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                  maxLength={420}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Poznámky / pravidla</span>
                <textarea
                  value={editor.body}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, body: event.target.value }))
                  }
                  className="min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                  placeholder="Každé pravidlo na nový řádek."
                  maxLength={4000}
                />
              </label>

              {renderFileUploadField({
                inputId: "cpp-document-add-file",
                label: "Příloha (PDF nebo obrázek)",
                helper: "Podporuje PDF, PNG, JPG, GIF, WEBP nebo AVIF. Maximum 12 MB.",
              })}

              {editorStatus ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {editorStatus}
                </p>
              ) : null}
              {editorError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {editorError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={editorBusy}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={() => void submitEditor()}
                  disabled={editorBusy}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Přidat dokument
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmationDoc ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center px-3 py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Potvrdit smazání dokumentu"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/62 backdrop-blur-md"
            onClick={() => {
              if (!editorBusy) setDeleteConfirmationDoc(null);
            }}
            aria-label="Zavřít potvrzení smazání"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-rose-100 bg-white shadow-[0_34px_90px_rgba(15,23,42,0.42)]">
            <div className="bg-[linear-gradient(135deg,#881337_0%,#be123c_52%,#f43f5e_100%)] px-5 py-5 text-white sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] !text-white">
                    <Trash2 className="h-3.5 w-3.5" />
                    Trvalé smazání
                  </span>
                  <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.02em] !text-white">
                    Smazat dokument?
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed !text-rose-50/90">
                    Tato akce odstraní dokument ze správy i z pomůcek. Nejde ji vrátit zpět.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmationDoc(null)}
                  disabled={editorBusy}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Zavřít"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Dokument
                </span>
                <p className="mt-1 break-words text-base font-bold text-slate-950">
                  {deleteConfirmationDoc.title}
                </p>
                <p className="mt-1 break-words text-sm text-slate-500">
                  {deleteConfirmationDoc.fileName || "Bez přílohy"}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmationDoc(null)}
                  disabled={editorBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteDocumentPermanently(deleteConfirmationDoc)}
                  disabled={editorBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-rose-300 bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_34px_rgba(225,29,72,0.28)] transition hover:-translate-y-0.5 hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                >
                  {editorBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Trvale smazat
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {documentNotificationDraft ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-3 py-5"
          role="dialog"
          aria-modal="true"
          aria-label="Upozornit poradce na nový dokument"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/66 backdrop-blur-md"
            onClick={closeDocumentNotificationPrompt}
            aria-label="Zavřít notifikaci k dokumentu"
          />
          <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fbff_55%,#eef8ff_100%)] shadow-[0_34px_92px_rgba(15,23,42,0.38)]">
            <div className="relative overflow-hidden bg-[linear-gradient(135deg,#4c1d95_0%,#6d28d9_54%,#8b5cf6_100%)] px-5 py-5 text-white shadow-[0_18px_44px_rgba(76,29,149,0.24)] sm:px-6">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden="true" />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                      <BellRing className="h-3.5 w-3.5" />
                      Notifikace k dokumentu
                    </span>
                    <span className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] !text-white">
                      Dokument uložen
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.02em] !text-white sm:text-3xl">
                    Poslat upozornění poradci?
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed !text-violet-100/86">
                    Notifikace se odešle poradcům a po kliknutí otevře přímo nově přidaný dokument.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDocumentNotificationPrompt}
                  disabled={documentNotificationBusy}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white shadow-[0_10px_22px_rgba(30,15,70,0.16)] backdrop-blur transition hover:bg-white/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Zavřít"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <div className="rounded-[24px] border border-slate-200 bg-white/88 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                        Text zprávy
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {documentNotificationTitle.length}/{DOCUMENT_NOTIFICATION_TITLE_MAX} ·{" "}
                      {documentNotificationMessage.length}/{DOCUMENT_NOTIFICATION_MESSAGE_MAX}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Emoji notifikace
                        </span>
                        <span className="hidden text-right text-[11px] font-semibold text-slate-400 sm:inline">
                          Zobrazí se v náhledu i v push zprávě
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                        {DOCUMENT_NOTIFICATION_EMOJIS.map((emoji) => {
                          const isSelected = documentNotificationEmoji === emoji;
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setDocumentNotificationEmoji(emoji);
                                setDocumentNotificationError(null);
                                setDocumentNotificationStatus(null);
                              }}
                              disabled={documentNotificationBusy}
                              className={`flex h-10 items-center justify-center rounded-2xl border text-xl shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-violet-200/70 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 ${
                                isSelected
                                  ? "border-violet-500 bg-violet-50 text-violet-950 ring-2 ring-violet-200"
                                  : "border-slate-200 bg-white text-slate-900 hover:border-violet-200 hover:bg-violet-50"
                              }`}
                              aria-pressed={isSelected}
                              aria-label={`Emoji ${emoji}`}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Nadpis notifikace
                      </span>
                      <input
                        type="text"
                        value={documentNotificationTitle}
                        onChange={(event) => {
                          setDocumentNotificationTitle(
                            event.target.value.slice(0, DOCUMENT_NOTIFICATION_TITLE_MAX)
                          );
                          setDocumentNotificationError(null);
                          setDocumentNotificationStatus(null);
                        }}
                        maxLength={DOCUMENT_NOTIFICATION_TITLE_MAX}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Popisek
                      </span>
                      <textarea
                        value={documentNotificationMessage}
                        onChange={(event) => {
                          setDocumentNotificationMessage(
                            event.target.value.slice(0, DOCUMENT_NOTIFICATION_MESSAGE_MAX)
                          );
                          setDocumentNotificationError(null);
                          setDocumentNotificationStatus(null);
                        }}
                        rows={4}
                        maxLength={DOCUMENT_NOTIFICATION_MESSAGE_MAX}
                        className="min-h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                      />
                    </label>
                  </div>
                </div>

                {documentNotificationStatus ? (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
                    {documentNotificationStatus}
                  </p>
                ) : null}
                {documentNotificationError ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
                    {documentNotificationError}
                  </p>
                ) : null}
              </div>

              <aside className="rounded-[24px] border border-slate-200 bg-slate-950 p-4 text-white shadow-[0_20px_48px_rgba(15,23,42,0.20)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                    Náhled
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/72">
                    Web push
                  </span>
                </div>

                <div className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.08] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl text-slate-950">
                      {documentNotificationEmoji}
                    </span>
                    <div className="min-w-0">
                      <div className="break-words text-sm font-bold text-white">
                        {documentNotificationEmoji} {documentNotificationTitle || "Nový dokument"}
                      </div>
                      <p className="mt-1 break-words text-sm leading-relaxed text-cyan-50/76">
                        {documentNotificationMessage || "Popisek notifikace se zobrazí tady."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-xs">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2">
                    <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em] text-cyan-100/60">
                      <UsersRound className="h-3.5 w-3.5" />
                      Příjemci
                    </span>
                    <span className="mt-1 block font-semibold text-white">Poradci</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2">
                    <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em] text-cyan-100/60">
                      <Link2 className="h-3.5 w-3.5" />
                      Otevře
                    </span>
                    <span className="mt-1 block break-words font-semibold text-white">
                      {documentNotificationDraft.documentTitle}
                    </span>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white/82 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm text-slate-600">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Cíl po kliknutí
                </span>
                <span className="mt-0.5 block truncate font-semibold text-slate-900">
                  Konkrétní detail dokumentu
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDocumentNotificationPrompt}
                  disabled={documentNotificationBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-200/70 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                >
                  {documentNotificationStatus ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <X className="h-4 w-4 text-slate-500" />
                  )}
                  {documentNotificationStatus ? "Zavřít" : "Teď ne"}
                </button>
                {!documentNotificationStatus ? (
                  <button
                    type="button"
                    onClick={() => void sendDocumentNotification()}
                    disabled={documentNotificationBusy}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-violet-200/70 bg-[linear-gradient(135deg,#6d28d9_0%,#7c3aed_52%,#a855f7_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_34px_rgba(124,58,237,0.32)] transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-violet-200/80 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {documentNotificationBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Odeslat notifikaci
                  </button>
                ) : null}
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeDocumentMeta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/62 px-3 py-6 backdrop-blur-[2.5px] sm:px-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_55%,#eff6ff_100%)] p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  {currentInsurer.title} {documentContext.categoryTitle}
                </span>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                  {activeDocumentMeta.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {activeDocumentMeta.description || activeDocumentMeta.fileName}
                </p>
                {activeDocumentMeta.publishedAt ? (
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Zveřejněno {formatDate(activeDocumentMeta.publishedAt)}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {activeDocumentHasFile ? (
                  <a
                    href={activeDocument.url ?? "#"}
                    download={activeDownloadName}
                    onClick={(event) => {
                      if (!activeDocument.url) event.preventDefault();
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black ${
                      activeDocument.url ? "" : "pointer-events-none opacity-60"
                    }`}
                    aria-disabled={!activeDocument.url}
                  >
                    <Download className="h-4 w-4" />
                    {activeDocument.loading ? "Načítám..." : "Stáhnout"}
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={closeDocumentDetail}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Zavřít"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {activeDocumentMeta.body.length > 0 ? (
              <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-800">
                {activeDocumentMeta.id === "cpp-storno-dohodou" ? (
                  <>
                    <p className="font-semibold">Vážení poradci,</p>
                    <p>
                      Od 3.12. 2025 platí následující pravidla pro storno dohodou pro smlouvy životního pojištění ČPP a.s.,
                      prosím o jejich důsledné dodržování:
                    </p>
                  </>
                ) : (
                  <p className="font-semibold">Poznámky / pravidla</p>
                )}
                <ol className="space-y-2">
                  {activeDocumentMeta.body.map((rule, index) => (
                    <li key={`${rule}-${index}`} className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-300 bg-white text-xs font-semibold text-cyan-700">
                        {index + 1}
                      </span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ol>
                {activeDocumentMeta.id === "cpp-storno-dohodou" ? (
                  <>
                    <p>Děkuji</p>
                    <p className="font-semibold">Jindřich Hájek.</p>
                  </>
                ) : null}
              </div>
            ) : activeDocumentMeta.isImage ? (
              <div className="mt-5">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {activeDocument.loading ? (
                    <div className="flex min-h-[360px] items-center justify-center text-sm font-medium text-slate-600">
                      Načítám dokument...
                    </div>
                  ) : activeDocument.error ? (
                    <div className="flex min-h-[360px] items-center justify-center px-4 text-center text-sm font-medium text-rose-700">
                      {activeDocument.error}
                    </div>
                  ) : activeDocument.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeDocument.url}
                      alt={activeDocumentMeta.title}
                      className="h-auto w-full object-contain"
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-3 text-[15px] leading-7 text-slate-800">
                <p className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-cyan-700" />
                  {activeDocumentMeta.fileName}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Použij tlačítko <span className="font-semibold">Stáhnout</span> vpravo nahoře.
                </p>
                {activeDocument.error ? (
                  <p className="mt-2 text-sm font-semibold text-rose-700">{activeDocument.error}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
