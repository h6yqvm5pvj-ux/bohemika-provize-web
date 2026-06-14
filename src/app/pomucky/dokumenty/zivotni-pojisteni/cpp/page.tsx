// src/app/pomucky/dokumenty/zivotni-pojisteni/cpp/page.tsx
"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Space_Grotesk } from "next/font/google";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  Paperclip,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
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

const NEW_TAB_VALUE = "__new__";
const QUICK_SECTION_EMOJIS = ["📄", "📝", "📎", "📌", "✅", "💼", "🧾", "📊"] as const;
const DOCUMENT_FILE_ACCEPT = "application/pdf,image/png,image/jpeg,image/gif,image/webp,image/avif";

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
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileDropActive, setFileDropActive] = useState(false);

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
    () => (activeTab === "sprava" ? [] : filteredDocuments.filter((doc) => doc.tab === activeTab)),
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
    setActiveTab("prehled");
    setEditor(emptyEditor("prehled"));
    setEditorStatus(null);
    setEditorError(null);
    setFileInputKey((key) => key + 1);
  }, [currentInsurer.section, fallbackDocuments]);

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
      })) as { ok?: boolean; documents?: ToolDocumentRecord[] };

      if (payload.documents) setDocuments(payload.documents);
      setEditorStatus(editor.id ? "Dokument byl uložen." : "Dokument byl přidán.");
      if (!editor.id) setActiveTab(nextTab);
      if (addModalOpen && !editor.id) {
        setAddModalOpen(false);
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

  const deleteDocument = async (doc: ToolDocumentRecord) => {
    const user = auth.currentUser;
    if (!user || !canManageDocuments) return;
    if (!window.confirm(`Opravdu skrýt dokument „${doc.title}“?`)) return;

    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const payload = (await fetchAuthedJsonOrThrow(user, "/api/documents/manage", {
        method: "DELETE",
        body: JSON.stringify({
          id: doc.id,
          section: currentInsurer.section,
        }),
      })) as { ok?: boolean; documents?: ToolDocumentRecord[] };

      if (payload.documents) setDocuments(payload.documents);
      if (activeDocumentId === doc.id) setActiveDocumentId(null);
      setEditorStatus("Dokument byl skrytý.");
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : "Dokument se nepodařilo skrýt."
      );
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
            onClick={() => setActiveDocumentId(doc.id)}
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
                    setActiveDocumentId(null);
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
                    <p className="text-sm text-slate-600">Uprav existující položku nebo přidej novou.</p>
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
                    <div key={doc.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="break-words text-sm font-bold text-slate-900">{doc.title}</h4>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                              {doc.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI} {doc.tabLabel || resolveTabInfo(doc.tab).label}
                            </span>
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
                        <div className="flex shrink-0 gap-2">
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
                            onClick={() => void deleteDocument(doc)}
                            disabled={editorBusy}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Skrýt
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
                  onClick={() => setActiveDocumentId(null)}
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
