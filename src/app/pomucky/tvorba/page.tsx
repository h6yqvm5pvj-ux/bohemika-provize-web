"use client";

import { privateMemory, purgePrivateBrowserCaches } from "@/app/lib/privateMemory";

import Image from "next/image";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Pilcrow,
  List,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  WandSparkles,
  Pipette,
  type LucideIcon,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  FilePlus2,
  Save,
  Settings2,
  ContactRound as UserCardIcon,
  Download,
  ImagePlus,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { resolveUserProfilePatchRequest } from "@/app/lib/adminImpersonation";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
  useAdminImpersonationState,
} from "@/app/lib/useAdminImpersonation";
import { auth } from "@/app/firebase-auth";
import { systemCondensedFont, systemSansFont } from "@/lib/fonts";

import { fittedImageSize, formatBytes, optimizeImage, pdfFilename, PDF_QUALITY_PRESETS, type DocumentPage, type PlacedImage, type PdfQualityPreset } from "./documentModel";
import { createDocumentPdf, downloadPdfUrl } from "./documentPdf";
import styles from "./tvorba.module.css";
import { ContactQrCode } from "./ContactQrCode";
import { contactQr, onlineCardUrl, type ContactDetails } from "./contactQr";
import { useDocumentDraft } from "./useDocumentDraft";
import { paginateEditor } from "./paginateEditor";

const modernSans = systemSansFont;
const modernPoster = systemCondensedFont;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

const DEFAULT_EDITOR_HTML = `
  <h1 style="font-size:32px;font-weight:700;letter-spacing:-0.035em;margin:0 0 20px 0;">Název dokumentu</h1>
  <p style="margin:0 0 12px 0;">Sem napiš svůj text. Můžeš používat tučné písmo, odrážky i číslované seznamy.</p>
  <ul style="margin:0 0 12px 18px;">
    <li>První bod</li>
    <li>Druhý bod</li>
    <li>Třetí bod</li>
  </ul>
  <p style="margin:0;">Tip: výsledný dokument stáhneš kliknutím na tlačítko „Stáhnout PDF“.</p>
`;

function EditorToolButton({
  label, icon: Icon, active, showLabel = false, onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  showLabel?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={styles.toolButton}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <Icon size={16} strokeWidth={1.8} />
      {showLabel && <span>{label}</span>}
    </button>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToEditorHtml(input: string): string {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function stripFooterDuplicateContactLines(input: string): string {
  const normalized = input.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;

    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(trimmed);
    const hasPhone = /(?:\+?\d[\d\s-]{7,}\d)/.test(trimmed);
    const hasContactLabel = /^kontakt\s*:/i.test(trimmed);
    const looksLikeContactSummary =
      trimmed.includes("|") && (hasEmail || hasPhone || /e-?mail|mobil|telefon/i.test(trimmed));

    if (hasContactLabel) return false;
    if (looksLikeContactSummary) return false;
    return true;
  });

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function ensureClosingSignature(input: string, signatureName: string): string {
  const normalized = stripFooterDuplicateContactLines(input);
  const safeName = signatureName.trim() || "Jméno poradce";
  const closing = `S přáním hezkého dne,\n${safeName}\nBohemika a.s.`;
  const hasGreeting = /s přáním hezkého dne[,!]?/i.test(normalized);
  const hasCompany = /bohemika\s*a\.s\./i.test(normalized);

  if (hasGreeting && hasCompany) {
    return normalized;
  }
  return normalized ? `${normalized}\n\n${closing}` : closing;
}

type FooterProfile = ContactDetails;

type UserProfileApiResponse = {
  ok?: boolean;
  profile?: {
    tvorbaFooterProfile?: Partial<FooterProfile>;
    [key: string]: unknown;
  };
};

type AiAssistantApiResponse = {
  ok?: boolean;
  reply?: string;
  error?: string;
};

type ImageInteraction = {
  imageId: string;
  mode: "move" | "resize";
  scale: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  stageWidth: number;
  stageHeight: number;
};

type FontOption = {
  key: string;
  label: string;
  css: string;
  commandValue: string;
};

type TextAlignMode = "left" | "center" | "right" | "justify";

type InlineStyleState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
};

type EyeDropperLike = {
  open: () => Promise<{ sRGBHex: string }>;
};

type WindowWithEyeDropper = Window & {
  EyeDropper?: new () => EyeDropperLike;
};

type AiDocType = "dopis" | "email" | "shrnutí";
type AiTone = "formální" | "přátelský" | "obchodní";
type AiLength = "krátký" | "střední" | "dlouhý";
type AiAddressing = "vykání" | "tykání";

const FONT_OPTIONS: FontOption[] = [
  {
    key: "manrope",
    label: "Moderní bezpatkové",
    css: `${modernSans.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernSans.style.fontFamily,
  },
  {
    key: "bebas",
    label: "Úzké bezpatkové",
    css: `${modernPoster.style.fontFamily}, 'Arial Narrow', sans-serif`,
    commandValue: modernPoster.style.fontFamily,
  },
  {
    key: "georgia",
    label: "Georgia",
    css: "Georgia, 'Times New Roman', serif",
    commandValue: "Georgia",
  },
  {
    key: "arial",
    label: "Arial",
    css: "Arial, Helvetica, sans-serif",
    commandValue: "Arial",
  },
  {
    key: "times",
    label: "Times New Roman",
    css: "'Times New Roman', Times, serif",
    commandValue: "Times New Roman",
  },
  {
    key: "verdana",
    label: "Verdana",
    css: "Verdana, Geneva, sans-serif",
    commandValue: "Verdana",
  },
  {
    key: "tahoma",
    label: "Tahoma",
    css: "Tahoma, Geneva, sans-serif",
    commandValue: "Tahoma",
  },
  {
    key: "trebuchet",
    label: "Trebuchet MS",
    css: "'Trebuchet MS', Arial, sans-serif",
    commandValue: "Trebuchet MS",
  },
  {
    key: "garamond",
    label: "Garamond",
    css: "Garamond, 'Times New Roman', serif",
    commandValue: "Garamond",
  },
  {
    key: "palatino",
    label: "Palatino Linotype",
    css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    commandValue: "Palatino Linotype",
  },
  {
    key: "book-antiqua",
    label: "Book Antiqua",
    css: "'Book Antiqua', Palatino, serif",
    commandValue: "Book Antiqua",
  },
  {
    key: "courier",
    label: "Courier New",
    css: "'Courier New', Courier, monospace",
    commandValue: "Courier New",
  },
  {
    key: "lucida",
    label: "Lucida Console",
    css: "'Lucida Console', Monaco, monospace",
    commandValue: "Lucida Console",
  },
];

const DEFAULT_FONT_KEY = FONT_OPTIONS[0]?.key ?? "manrope";
const AI_ASSISTANT_ENDPOINT = "/api/ai-assistant";
const PDF_QUALITY_ORDER: PdfQualityPreset[] = ["low", "medium", "high"];
const DEFAULT_PDF_QUALITY_PRESET: PdfQualityPreset = "medium";

const TEXT_COLOR_PALETTE = [
  "#111827",
  "#374151",
  "#6b7280",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#65a30d",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#be185d",
  "#f43f5e",
  "#f59e0b",
  "#ffffff",
];

const EMPTY_FOOTER_PROFILE: FooterProfile = {
  fullName: "",
  jobTitle: "",
  companyId: "",
  phone: "",
  email: "",
  officeAddress: "",
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const waitNextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

const footerStorageKey = (email?: string | null) =>
  `tvorba.footerProfile:${normalizeEmail(email) || "anon"}`;

function readLocalFooterProfile(email?: string | null): FooterProfile | null {
  if (typeof window === "undefined") return null;
  purgePrivateBrowserCaches();
  const raw = privateMemory.getItem(footerStorageKey(email));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<FooterProfile>;
    return {
      fullName: data.fullName ?? "",
      jobTitle: data.jobTitle ?? "",
      companyId: data.companyId ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      officeAddress: data.officeAddress ?? "",
    };
  } catch {
    return null;
  }
}

function writeLocalFooterProfile(email: string | null, profile: FooterProfile) {
  if (typeof window === "undefined") return;
  privateMemory.setItem(footerStorageKey(email), JSON.stringify(profile));
  // Pro nepřihlášený stav držíme i anonymní draft.
  if (!email) {
    privateMemory.setItem(footerStorageKey("anon"), JSON.stringify(profile));
  }
}

async function syncFooterProfileToCloud(
  user: FirebaseUser,
  profile: FooterProfile
): Promise<void> {
  const profilePatch = resolveUserProfilePatchRequest();
  await fetchAuthedJsonOrThrow(user, profilePatch.url, {
    method: "PATCH",
    headers: profilePatch.headers,
    body: JSON.stringify({
      tvorbaFooterProfile: profile,
    }),
  });
}

export default function TvorbaPage() {
  const [session, setSession] = useState<{ user: FirebaseUser | null } | null>(null);
  const owner = useEffectiveUserEmail(session?.user?.email);
  const impersonation = useAdminImpersonationState();
  useEffect(() => onAuthStateChanged(auth, user => setSession({ user })), []);
  if (!session) return <AppLayout active="tools"><p role="status">Načítám dokument…</p></AppLayout>;
  if (!session.user) return <AppLayout active="tools"><p role="status">Pro tvorbu dokumentu a otevření konceptu se přihlas.</p></AppLayout>;
  if (impersonation || normalizeEmail(owner) !== normalizeEmail(session.user.email)) return <AppLayout active="tools"><p role="status">Soukromé koncepty jsou přístupné pouze autorovi. Ukonči režim zastoupení uživatele.</p></AppLayout>;
  return <TvorbaWorkspace key={session.user.uid} authUser={session.user} effectiveProfileEmail={owner} />;
}

function TvorbaWorkspace({ authUser, effectiveProfileEmail }: { authUser: FirebaseUser; effectiveProfileEmail: string | null | undefined }) {
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedEditorRangeRef = useRef<Range | null>(null);
  const editorStageRef = useRef<HTMLDivElement | null>(null);
  const imageUploadRef = useRef<HTMLInputElement | null>(null);
  const textColorInputRef = useRef<HTMLInputElement | null>(null);
  const textPaletteRef = useRef<HTMLDivElement | null>(null);
  const pdfDialogRef = useRef<HTMLDivElement | null>(null);
  const imageInteractionRef = useRef<ImageInteraction | null>(null);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [showContactQr, setShowContactQr] = useState(true);
  const [profileCard, setProfileCard] = useState<{ owner: string; url: string } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [fontSizePx, setFontSizePx] = useState(15);
  const [fontFamilyKey, setFontFamilyKey] = useState(DEFAULT_FONT_KEY);
  const [textColor, setTextColor] = useState("#1f2937");
  const [headerDocTitle, setHeaderDocTitle] = useState("Podpisem to pro nás nekončí");
  const [documentTitle, setDocumentTitle] = useState("Nový dokument");
  const [pages, setPages] = useState<DocumentPage[]>([{
    id: "first-page", html: DEFAULT_EDITOR_HTML, images: [], fontSize: 15,
    fontKey: DEFAULT_FONT_KEY, fontFamily: FONT_OPTIONS[0].css, color: "#1f2937",
  }]);
  const [activePageId, setActivePageId] = useState("first-page");
  const [removedPage, setRemovedPage] = useState<{ page: DocumentPage; index: number } | null>(null);
  const [contentOverflow, setContentOverflow] = useState(false);
  const [autoPaginate, setAutoPaginate] = useState(true);
  const [paginationStatus, setPaginationStatus] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [newDocumentConfirm, setNewDocumentConfirm] = useState(false);
  const [previousDocument, setPreviousDocument] = useState<{ pages: DocumentPage[]; activePageId: string; title: string; header: string } | null>(null);
  const composingRef = useRef(false);
  const failedPaginationRef = useRef<string | null>(null);
  const [imageImporting, setImageImporting] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 1 });
  const [lastExport, setLastExport] = useState<{ url: string; filename: string; bytes: number; pages: number } | null>(null);
  const exportBusyRef = useRef(false);
  const imageBusyRef = useRef(false);
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [footerSettingsOpen, setFooterSettingsOpen] = useState(false);
  const [pdfSettingsOpen, setPdfSettingsOpen] = useState(false);
  const [pdfPasswordEnabled, setPdfPasswordEnabled] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfQualityPreset, setPdfQualityPreset] =
    useState<PdfQualityPreset>(DEFAULT_PDF_QUALITY_PRESET);
  const [pdfSaveStatus, setPdfSaveStatus] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDocType, setAiDocType] = useState<AiDocType>("dopis");
  const [aiTone, setAiTone] = useState<AiTone>("formální");
  const [aiLength, setAiLength] = useState<AiLength>("střední");
  const [aiAddressing, setAiAddressing] = useState<AiAddressing>("vykání");
  const [aiClientName, setAiClientName] = useState("");
  const [aiContractNumber, setAiContractNumber] = useState("");
  const [aiProductName, setAiProductName] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [aiUseCurrentContext, setAiUseCurrentContext] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [textPaletteOpen, setTextPaletteOpen] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [textAlignMode, setTextAlignMode] = useState<TextAlignMode>("left");
  const [inlineStyleState, setInlineStyleState] = useState<InlineStyleState>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
  });
  const [previewScale, setPreviewScale] = useState(1);
  const [previewFit, setPreviewFit] = useState(true);
  const [previewBaseSize, setPreviewBaseSize] = useState({ width: 0, height: 0 });
  const selectedFontOption =
    FONT_OPTIONS.find((option) => option.key === fontFamilyKey) ?? FONT_OPTIONS[0];
  const selectedPdfQuality = PDF_QUALITY_PRESETS[pdfQualityPreset];
  const previewFrameWidth =
    previewBaseSize.width > 0 ? previewBaseSize.width * previewScale : null;
  const previewFrameHeight =
    previewBaseSize.height > 0 ? previewBaseSize.height * previewScale : null;

  const selectedImage = placedImages.find(image => image.id === activeImageId);
  const activePageIndex = pages.findIndex(page => page.id === activePageId);
  const snapshotPages = () => pages.map(page => page.id === activePageId ? {
    ...page, html: editorRef.current?.innerHTML ?? page.html, images: placedImages,
    fontSize: fontSizePx, fontKey: fontFamilyKey, fontFamily: selectedFontOption.css, color: textColor,
  } : page);

  const activatePage = (page: DocumentPage, nextPages: DocumentPage[]) => {
    if (exportBusyRef.current || imageBusyRef.current) return;
    setPages(nextPages);
    setActivePageId(page.id);
    if (editorRef.current) {
      editorRef.current.innerHTML = page.html;
      editorRef.current.scrollTop = 0;
    }
    setPlacedImages(page.images);
    setFontSizePx(page.fontSize);
    setFontFamilyKey(page.fontKey);
    setTextColor(page.color);
    setActiveImageId(null);
    savedEditorRangeRef.current = null;
    imageInteractionRef.current = null;
    setErrorText(null);
  };

  const addPage = (duplicate = false) => {
    const current = snapshotPages();
    const page: DocumentPage = {
      ...current[activePageIndex], id: crypto.randomUUID(),
      html: duplicate ? current[activePageIndex].html : "<p><br></p>",
      images: duplicate ? current[activePageIndex].images.map(image => ({ ...image, id: crypto.randomUUID() })) : [],
    };
    current.splice(activePageIndex + 1, 0, page);
    activatePage(page, current);
  };

  const movePage = (direction: -1 | 1) => {
    const current = snapshotPages();
    const target = activePageIndex + direction;
    if (target < 0 || target >= current.length) return;
    [current[activePageIndex], current[target]] = [current[target], current[activePageIndex]];
    setPages(current);
  };

  const removePage = () => {
    if (pages.length <= 1) return;
    const current = snapshotPages();
    const [removed] = current.splice(activePageIndex, 1);
    setRemovedPage({ page: removed, index: activePageIndex });
    activatePage(current[Math.min(activePageIndex, current.length - 1)], current);
  };

  const restorePage = () => {
    if (!removedPage) return;
    const current = snapshotPages();
    current.splice(removedPage.index, 0, removedPage.page);
    activatePage(removedPage.page, current);
    setRemovedPage(null);
  };

  const draftState = useMemo(() => ({
    title: documentTitle, header: headerDocTitle, activePageId, quality: pdfQualityPreset, showContactQr, autoPaginate,
    pages: pages.map(page => page.id === activePageId ? {
      ...page, images: placedImages, fontSize: fontSizePx, fontKey: fontFamilyKey, fontFamily: selectedFontOption.css, color: textColor,
    } : page),
  }), [documentTitle, headerDocTitle, activePageId, pdfQualityPreset, showContactQr, autoPaginate, pages, placedImages, fontSizePx, fontFamilyKey, selectedFontOption.css, textColor]);
  const draft = useDocumentDraft(authUser, draftState, editorRef, saved => {
    activatePage(saved.pages.find(page => page.id === saved.activePageId) || saved.pages[0], saved.pages);
    setDocumentTitle(saved.title);
    setHeaderDocTitle(saved.header);
    setPdfQualityPreset(saved.quality);
    setShowContactQr(saved.showContactQr);
    setAutoPaginate(saved.autoPaginate);
  });

  const startNewDocument = () => {
    setPreviousDocument({ pages: snapshotPages(), activePageId, title: documentTitle, header: headerDocTitle });
    const page: DocumentPage = { id: crypto.randomUUID(), html: "<p><br></p>", images: [], fontSize: 15, fontKey: DEFAULT_FONT_KEY, fontFamily: FONT_OPTIONS[0].css, color: "#1f2937" };
    activatePage(page, [page]);
    setDocumentTitle("Nový dokument");
    setRemovedPage(null);
    setNewDocumentConfirm(false);
    setLastExport(null);
    setPaginationStatus(null);
    setPdfPassword("");
    setPdfPasswordEnabled(false);
  };

  const splitOverflow = () => {
    const editor = editorRef.current;
    if (!editor || !draft.ready || exportBusyRef.current || imageBusyRef.current || composingRef.current) return;
    if (editor.innerHTML === failedPaginationRef.current) return;
    if (editor.scrollHeight <= editor.clientHeight + 2 && editor.scrollWidth <= editor.clientWidth + 2) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && editor.contains(selection.anchorNode)) return;
    const current = snapshotPages();
    const source = current[activePageIndex];
    const flowId = source.flowId || source.id;
    let end = activePageIndex + 1;
    while (end < current.length && current[end].flowId === flowId && !current[end].images.length &&
      current[end].fontSize === source.fontSize && current[end].fontKey === source.fontKey && current[end].color === source.color) end++;
    const marker = document.createElement("span");
    marker.setAttribute("data-pagination-caret", "true");
    const hadFocus = document.activeElement === editor;
    if (hadFocus && selection?.rangeCount && editor.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(false);
      range.insertNode(marker);
    }
    try {
      const parts = paginateEditor(editor, editor.innerHTML + current.slice(activePageIndex + 1, end).map(page => page.html).join(""));
      if (parts.length <= 1) return;
      const caretPage = Math.max(0, parts.findIndex(html => html.includes("data-pagination-caret")));
      const generated = parts.map((html, index): DocumentPage => ({
        ...source, id: activePageIndex + index < end ? current[activePageIndex + index].id : crypto.randomUUID(),
        flowId, images: index === 0 ? source.images : [],
        html: html.replace(/<span data-pagination-caret="true"><\/span>/g, ""),
      }));
      current.splice(activePageIndex, end - activePageIndex, ...generated);
      activatePage({ ...generated[caretPage], html: parts[caretPage] }, current);
      const cursor = editor.querySelector("[data-pagination-caret]");
      if (cursor && hadFocus) {
        editor.focus({ preventScroll: true });
        const range = document.createRange();
        range.setStartBefore(cursor); range.collapse(true); cursor.remove();
        selection?.removeAllRanges(); selection?.addRange(range);
        savedEditorRangeRef.current = range.cloneRange();
      } else cursor?.remove();
      setPaginationError(null);
      setPaginationStatus(`Text byl rozdělen do ${parts.length} stran. Formátování zůstalo zachované.`);
      return current;
    } catch (error) {
      setPaginationError(error instanceof Error ? error.message : "Text se nepodařilo rozdělit.");
      marker.remove();
      failedPaginationRef.current = editor.innerHTML;
    } finally { marker.remove(); }
  };
  const autoSplit = useEffectEvent(() => { if (autoPaginate) splitOverflow(); });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      const overflow = editor.scrollHeight > editor.clientHeight + 2 || editor.scrollWidth > editor.clientWidth + 2;
      setContentOverflow(overflow);
      clearTimeout(timer);
      if (overflow) timer = setTimeout(() => autoSplit(), 350);
    };
    const observer = new MutationObserver(measure);
    const resizeObserver = new ResizeObserver(measure);
    observer.observe(editor, { childList: true, subtree: true, characterData: true, attributes: true });
    resizeObserver.observe(editor);
    measure();
    return () => { observer.disconnect(); resizeObserver.disconnect(); clearTimeout(timer); };
  }, []);

  useEffect(() => { if (draft.ready && autoPaginate) autoSplit(); }, [draft.ready, autoPaginate]);

  useEffect(() => () => { if (lastExport) URL.revokeObjectURL(lastExport.url); }, [lastExport]);

  const collectFooterProfile = (): FooterProfile => ({
    fullName: fullName.trim(),
    jobTitle: jobTitle.trim(),
    companyId: companyId.trim(),
    phone: phone.trim(),
    email: email.trim(),
    officeAddress: officeAddress.trim(),
  });

  const currentCardUrl = profileCard && profileCard.owner === effectiveProfileEmail ? profileCard.url : "";
  const qrContact = showContactQr ? contactQr(collectFooterProfile(), currentCardUrl) : null;

  const applyFooterProfile = (profile: Partial<FooterProfile>, fallbackEmail?: string) => {
    setFullName(profile.fullName ?? "");
    setJobTitle(profile.jobTitle ?? "");
    setCompanyId(profile.companyId ?? "");
    setPhone(profile.phone ?? "");
    setEmail(profile.email ?? fallbackEmail ?? "");
    setOfficeAddress(profile.officeAddress ?? "");
  };

  const persistFooterDraft = async (syncCloud = false) => {
    const nextProfile = collectFooterProfile();
    writeLocalFooterProfile(userEmail, nextProfile);
    if (syncCloud && userEmail) {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      if (effectiveUserEmail(currentUser.email) !== userEmail) return;
      try {
        await syncFooterProfileToCloud(currentUser, nextProfile);
      } catch (error) {
        console.warn("Nepodařilo se synchronizovat draft patičky do cloudu:", error);
      }
    }
  };

  const handleSavePdfSettings = () => {
    setPdfSaveStatus(null);
    const normalizedPdfPassword = pdfPassword.trim();
    const qualityLabel = PDF_QUALITY_PRESETS[pdfQualityPreset].label;

    try {
      if (pdfPasswordEnabled && !normalizedPdfPassword) {
        setErrorText("Nejdřív zadej heslo pro zaheslování PDF.");
        setPdfSaveStatus(null);
        return;
      }
      if (pdfPasswordEnabled) {
        setPdfSaveStatus(`Heslo je připravené pro jeden export. Kvalita: ${qualityLabel}.`);
      } else {
        setPdfSaveStatus(`Nastavená kvalita PDF: ${qualityLabel}.`);
      }
      setErrorText(null);
    } catch (error) {
      console.error("Nepodařilo se uložit nastavení PDF:", error);
      setPdfSaveStatus(null);
      setErrorText("Nastavení PDF se nepodařilo potvrdit.");
    } finally {
      window.setTimeout(() => setPdfSaveStatus(null), 2400);
    }
  };

  const buildAiPrompt = () => {
    const lengthHint =
      aiLength === "krátký"
        ? "max 120 slov"
        : aiLength === "střední"
          ? "cca 150-220 slov"
          : "cca 250-400 slov";

    const clientName = aiClientName.trim();
    const contractNumber = aiContractNumber.trim();
    const productName = aiProductName.trim();
    const goal = aiGoal.trim();
    const signatureIdentity = fullName.trim();

    const editorContextRaw = editorRef.current?.innerText ?? "";
    const editorContext = editorContextRaw.replace(/\s+/g, " ").trim().slice(0, 1200);
    const signatureName = fullName.trim() || "Jméno poradce";

    const personalization: string[] = [
      `Oslovení klienta: ${aiAddressing}.`,
      clientName
        ? `Jméno klienta: ${clientName}.`
        : "Jméno klienta není zadané, použij obecné oslovení.",
      contractNumber ? `Číslo smlouvy: ${contractNumber}.` : "",
      productName ? `Produkt: ${productName}.` : "",
      goal ? `Cíl textu: ${goal}.` : "",
      signatureIdentity
        ? `Podpisové jméno autora: ${signatureIdentity}.`
        : "",
      aiUseCurrentContext && editorContext
        ? `Kontext z aktuálního rozpracovaného dokumentu: ${editorContext}`
        : "",
    ].filter(Boolean);

    return [
      "Vytvoř text dokumentu v češtině pro interní firemní použití.",
      `Typ výstupu: ${aiDocType}.`,
      `Tón: ${aiTone}.`,
      `Délka: ${lengthHint}.`,
      "Piš bez markdownu, bez uvozovek, v hotových odstavcích přímo použitelných do dokumentu.",
      "Nepiš technické poznámky ani vysvětlování.",
      "NEPIŠ do těla textu kontakt (telefon, e-mail, řádek Kontakt:, ani kontaktní podpis). Kontakty jsou v patičce dokumentu.",
      `Závěr napiš ve formátu: "S přáním hezkého dne," + nový řádek + "${signatureName}" + nový řádek + "Bohemika a.s."`,
      "",
      "Personalizace:",
      ...personalization,
      "",
      "Zadání uživatele:",
      aiPrompt.trim(),
    ].join("\n");
  };

  const handleGenerateAiText = async () => {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) {
      setAiError("Napiš zadání pro AI asistenta.");
      return;
    }

    const activeUser = auth.currentUser;
    if (!activeUser) {
      setAiError("Pro AI asistenta je potřeba přihlášení.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const payload = await fetchAuthedJsonOrThrow<AiAssistantApiResponse>(
        activeUser,
        AI_ASSISTANT_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify({
            prompt: buildAiPrompt(),
          }),
        }
      );

      const reply = String(payload.reply ?? "").trim();
      if (payload?.ok === false) {
        throw new Error(reply || payload.error || "AI asistent neodpověděl.");
      }
      if (!reply) {
        throw new Error("AI asistent nevrátil text.");
      }

      const signatureName = fullName.trim() || "Jméno poradce";
      setAiResult(ensureClosingSignature(reply, signatureName));
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError &&
        /failed to fetch|networkerror|network error/i.test(error.message);
      if (isNetworkError) {
        setAiError(
          "Nepodařilo se spojit s AI službou. Zkontroluj připojení nebo dostupnost endpointu."
        );
      } else {
        console.error("Chyba AI asistenta:", error);
        setAiError(
          error instanceof Error ? error.message : "AI asistent není teď dostupný."
        );
      }
    } finally {
      setAiLoading(false);
    }
  };

  const insertAiResultIntoEditor = () => {
    if (!aiResult.trim()) return;
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const html = plainTextToEditorHtml(aiResult);
    const inserted = document.execCommand("insertHTML", false, html);

    if (!inserted && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const fragment = range.createContextualFragment(html);
      range.deleteContents();
      range.insertNode(fragment);
      selection.removeAllRanges();
    }
    syncFormattingState();
  };

  const replaceEditorWithAiResult = () => {
    if (!aiResult.trim()) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = plainTextToEditorHtml(aiResult);
    focusEditor();
    syncFormattingState();
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.innerHTML.trim()) {
      editor.innerHTML = DEFAULT_EDITOR_HTML;
    }
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.style.fontSize = `${fontSizePx}px`;
    editor.style.fontFamily = selectedFontOption.css;
    editor.style.color = textColor;
  }, [fontSizePx, selectedFontOption.css, textColor]);

  useEffect(() => {
    if (!textPaletteOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (textPaletteRef.current?.contains(target)) return;
      setTextPaletteOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [textPaletteOpen]);

  useEffect(() => {
    if (!pdfSettingsOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(pdfDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]'
    ) ?? []);
    focusable()[0]?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfSettingsOpen(false);
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => { window.removeEventListener("keydown", handleEscape); previousFocus?.focus(); };
  }, [pdfSettingsOpen]);

  useEffect(() => {
    let cancelled = false;
    const loadUserProfile = async () => {
        const activeUser = authUser;
        const normalized = effectiveProfileEmail;
        if (!activeUser || !normalized) {
          setProfileCard(null);
          setUserEmail(null);
          const localProfile = readLocalFooterProfile(null);
          if (localProfile) applyFooterProfile(localProfile);
          return;
        }

        if (!cancelled) {
          setUserEmail(normalized);
          setEmail(normalized);
          setFullName(nameFromEmail(normalized));
          const localProfile = readLocalFooterProfile(normalized);
          if (localProfile) {
            applyFooterProfile(localProfile, normalized);
          }
        }

        try {
          const payload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
            activeUser,
            "/api/user/profile",
            { method: "GET" }
          );
          if (
            cancelled ||
            effectiveUserEmail(auth.currentUser?.email) !== normalized
          ) return;
          setProfileCard({ owner: normalized, url: onlineCardUrl(payload.profile, window.location.origin) });
          const profile = payload.profile?.tvorbaFooterProfile;
          if (!profile) return;

          const merged: FooterProfile = {
            fullName: profile.fullName ?? nameFromEmail(normalized),
            jobTitle: profile.jobTitle ?? "",
            companyId: profile.companyId ?? "",
            phone: profile.phone ?? "",
            email: profile.email ?? normalized,
            officeAddress: profile.officeAddress ?? "",
          };
          applyFooterProfile(merged, normalized);
          writeLocalFooterProfile(normalized, merged);
        } catch (error) {
          console.error("Nepodařilo se načíst uloženou patičku:", error);
        }
    };

    void loadUserProfile();

    return () => {
      cancelled = true;
    };
  }, [authUser, effectiveProfileEmail]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const interaction = imageInteractionRef.current;
      if (!interaction) return;

      const scale = interaction.scale > 0 ? interaction.scale : 1;
      const deltaX = (event.clientX - interaction.startClientX) / scale;
      const deltaY = (event.clientY - interaction.startClientY) / scale;

      setPlacedImages((prev) =>
        prev.map((image) => {
          if (image.id !== interaction.imageId) return image;

          if (interaction.mode === "move") {
            const nextX = clampNumber(
              interaction.originX + deltaX,
              0,
              Math.max(0, interaction.stageWidth - interaction.originWidth)
            );
            const nextY = clampNumber(
              interaction.originY + deltaY,
              0,
              Math.max(0, interaction.stageHeight - interaction.originHeight)
            );
            return { ...image, x: nextX, y: nextY };
          }

          const minWidth = 40;
          const minHeight = 40;
          const maxWidth = Math.max(minWidth, interaction.stageWidth - interaction.originX);
          const maxHeight = Math.max(minHeight, interaction.stageHeight - interaction.originY);
          const nextWidth = clampNumber(interaction.originWidth + deltaX, minWidth, maxWidth);
          const nextHeight = clampNumber(interaction.originHeight + deltaY, minHeight, maxHeight);

          return { ...image, width: nextWidth, height: nextHeight };
        })
      );
    };

    const handleMouseUp = () => {
      if (!imageInteractionRef.current) return;
      imageInteractionRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;

    let frameId = 0;
    const measure = () => {
      const baseWidth = Math.max(1, page.offsetWidth);
      const baseHeight = Math.max(1, page.offsetHeight);
      const availableWidth = Math.max(1, viewport.clientWidth - 24);
      const nextScale = previewFit ? Math.min(1, availableWidth / baseWidth) : 1;

      setPreviewBaseSize((prev) =>
        prev.width === baseWidth && prev.height === baseHeight
          ? prev
          : { width: baseWidth, height: baseHeight }
      );
      setPreviewScale((prev) => (Math.abs(prev - nextScale) < 0.001 ? prev : nextScale));
    };
    const scheduleMeasure = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(viewport);
    observer.observe(page);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [previewFit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeImageId) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setPlacedImages((prev) => prev.filter((image) => image.id !== activeImageId));
      setActiveImageId(null);
      imageInteractionRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImageId]);

  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
  };

  const storeEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedEditorRangeRef.current = range.cloneRange();
  };

  const restoreStoredEditorSelection = (): Selection | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection) return null;
    const storedRange = savedEditorRangeRef.current;
    if (!storedRange) return null;
    if (!storedRange.commonAncestorContainer.isConnected) return null;
    if (!editor.contains(storedRange.commonAncestorContainer)) return null;
    selection.removeAllRanges();
    selection.addRange(storedRange.cloneRange());
    return selection;
  };

  const ensureSelectionInEditor = (): Selection | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection) return null;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedEditorRangeRef.current = range.cloneRange();
        return selection;
      }
    }
    const restoredSelection = restoreStoredEditorSelection();
    if (restoredSelection && restoredSelection.rangeCount > 0) {
      return restoredSelection;
    }
    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(editor);
    fallbackRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallbackRange);
    savedEditorRangeRef.current = fallbackRange.cloneRange();
    return selection;
  };

  const normalizeExecCommandFontSizing = (px: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const fontNodes = Array.from(editor.querySelectorAll("font[size]"));
    fontNodes.forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });

    const sizedSpans = Array.from(editor.querySelectorAll<HTMLElement>("span[style*='font-size']"));
    sizedSpans.forEach((span) => {
      const raw = span.style.fontSize.trim().toLowerCase();
      if (!raw) return;
      if (/^\d+(\.\d+)?px$/.test(raw)) return;
      span.style.fontSize = `${px}px`;
    });
  };

  const normalizeExecCommandFontFamilies = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const fontNodes = Array.from(editor.querySelectorAll<HTMLFontElement>("font"));
    fontNodes.forEach((node) => {
      const span = document.createElement("span");
      const face = node.getAttribute("face")?.trim();
      const inlineFamily = node.style.fontFamily.trim();
      if (face) {
        span.style.fontFamily = face;
      } else if (inlineFamily) {
        span.style.fontFamily = inlineFamily;
      }
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });
  };

  const normalizeExecCommandTextColors = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const fontNodes = Array.from(editor.querySelectorAll<HTMLFontElement>("font[color]"));
    fontNodes.forEach((node) => {
      const span = document.createElement("span");
      const color = node.getAttribute("color")?.trim();
      if (color) {
        span.style.color = color;
      }
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });
  };

  const wrapSelectedTextWithStyles = (styles: Record<string, string>) => {
    const selection = ensureSelectionInEditor();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return false;

    const span = document.createElement("span");
    Object.entries(styles).forEach(([property, value]) => {
      span.style.setProperty(property, value);
    });

    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedEditorRangeRef.current = nextRange.cloneRange();
    return true;
  };

  const applyFontFamily = (option: FontOption) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    if (hasSelection) {
      wrapSelectedTextWithStyles({ "font-family": option.css });
    } else {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("fontName", false, option.commandValue);
      normalizeExecCommandFontFamilies();
    }
    if (!hasSelection && editorRef.current) {
      editorRef.current.style.fontFamily = option.css;
    }
    setErrorText(null);
    syncFormattingState();
  };

  const handleSelectFont = (option: FontOption) => {
    setFontFamilyKey(option.key);
    applyFontFamily(option);
  };

  const applyFontSize = (px: number) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, "7");
    normalizeExecCommandFontSizing(px);
    if (!hasSelection && editorRef.current) {
      editorRef.current.style.fontSize = `${px}px`;
    }
  };

  const applyTextColor = (color: string) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    normalizeExecCommandTextColors();
    if (!hasSelection && editorRef.current) {
      editorRef.current.style.color = color;
    }
  };

  const applyAndStoreTextColor = (color: string, closePalette = false) => {
    setTextColor(color);
    applyTextColor(color);
    if (closePalette) {
      setTextPaletteOpen(false);
    }
    setErrorText(null);
  };

  const handlePickColorBySample = async () => {
    if (typeof window === "undefined") return;
    const EyeDropperCtor = (window as WindowWithEyeDropper).EyeDropper;
    if (!EyeDropperCtor) {
      setErrorText("Pipeta není v tomto prohlížeči dostupná.");
      return;
    }

    try {
      const eyedropper = new EyeDropperCtor();
      const picked = await eyedropper.open();
      if (!picked?.sRGBHex) return;
      applyAndStoreTextColor(picked.sRGBHex, true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Nepodařilo se načíst barvu pipetou:", error);
      setErrorText("Nepodařilo se načíst barvu pipetou.");
    }
  };

  const applyFormatBlock = (blockTag: "H2" | "P") => {
    focusEditor();
    ensureSelectionInEditor();
    const asTag = blockTag.toLowerCase();
    const asNode = `<${blockTag.toLowerCase()}>`;
    const ok = document.execCommand("formatBlock", false, asTag);
    if (!ok) {
      document.execCommand("formatBlock", false, asNode);
    }
  };

  const applyList = (ordered: boolean) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection || selection.rangeCount === 0) return;

    const command = ordered ? "insertOrderedList" : "insertUnorderedList";
    const ok = document.execCommand(command, false);
    if (ok) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const list = document.createElement(ordered ? "ol" : "ul");
    selectedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        list.appendChild(li);
      });

    range.deleteContents();
    range.insertNode(list);
    selection.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(list);
    after.collapse(false);
    selection.addRange(after);
  };

  const applyCommand = (command: string, value?: string) => {
    focusEditor();
    ensureSelectionInEditor();
    document.execCommand(command, false, value);
  };

  const syncTextAlignMode = () => {
    try {
      if (document.queryCommandState("justifyCenter")) {
        setTextAlignMode("center");
        return;
      }
      if (document.queryCommandState("justifyRight")) {
        setTextAlignMode("right");
        return;
      }
      if (document.queryCommandState("justifyFull")) {
        setTextAlignMode("justify");
        return;
      }
      setTextAlignMode("left");
    } catch {
      // Ignored: some browsers can throw for queryCommandState in edge cases.
    }
  };

  const syncInlineStyleState = () => {
    try {
      setInlineStyleState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
      });
    } catch {
      // Ignored: some browsers can throw for queryCommandState in edge cases.
    }
  };

  const applyTextAlign = (mode: TextAlignMode) => {
    const commandByMode: Record<TextAlignMode, string> = {
      left: "justifyLeft",
      center: "justifyCenter",
      right: "justifyRight",
      justify: "justifyFull",
    };
    applyCommand(commandByMode[mode]);
    setTextAlignMode(mode);
  };

  const applyInlineStyle = (command: "bold" | "italic" | "underline" | "strikeThrough") => {
    applyCommand(command);
    window.requestAnimationFrame(() => {
      syncInlineStyleState();
    });
  };

  const syncFormattingState = () => {
    storeEditorSelection();
    syncTextAlignMode();
    syncInlineStyleState();
  };

  const startImageInteraction = (
    event: ReactMouseEvent<HTMLElement>,
    imageId: string,
    mode: "move" | "resize"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (exportBusyRef.current) return;

    const stage = editorStageRef.current;
    if (!stage) return;
    const image = placedImages.find((item) => item.id === imageId);
    if (!image) return;

    const stageWidth = Math.max(1, stage.clientWidth);
    const stageHeight = Math.max(1, stage.clientHeight);
    imageInteractionRef.current = {
      imageId,
      mode,
      scale: previewScale > 0 ? previewScale : 1,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: image.x,
      originY: image.y,
      originWidth: image.width,
      originHeight: image.height,
      stageWidth,
      stageHeight,
    };
    setActiveImageId(imageId);
    document.body.style.userSelect = "none";
  };

  const removeActiveImage = () => {
    if (!activeImageId) return;
    setPlacedImages((prev) => prev.filter((image) => image.id !== activeImageId));
    setActiveImageId(null);
    imageInteractionRef.current = null;
  };

  const handleInsertImageClick = () => {
    imageUploadRef.current?.click();
  };

  const insertImageFiles = async (files: File[]) => {
    if (imageBusyRef.current || exportBusyRef.current || !files.length) return;
    imageBusyRef.current = true;
    setImageImporting(true);
    setImageStatus(null);
    setErrorText(null);
    let originalBytes = 0;
    let optimizedBytes = 0;
    let inserted = 0;
    try {
      for (const file of files) {
        const optimized = await optimizeImage(file);
        const stage = editorStageRef.current;
        const stageWidth = stage?.clientWidth || 688;
        const stageHeight = stage?.clientHeight || 760;
        const size = fittedImageSize(optimized.width, optimized.height, 300, stageHeight - 32);
        const lastBlock = editorRef.current?.lastElementChild as HTMLElement | null;
        const textBottom = lastBlock ? lastBlock.offsetTop + lastBlock.offsetHeight + 20 : 16;
        const id = crypto.randomUUID();
        setPlacedImages(previous => [...previous, {
          id, src: optimized.src, alt: file.name || "Vložený obrázek",
          x: Math.min(16 + (previous.length % 5) * 14, stageWidth - size.width),
          y: Math.min(textBottom + (previous.length % 5) * 14, stageHeight - size.height),
          ...size,
        }]);
        setActiveImageId(id);
        originalBytes += optimized.originalBytes;
        optimizedBytes += optimized.bytes;
        inserted++;
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Obrázek se nepodařilo načíst.");
    } finally {
      if (inserted) setImageStatus(`Obrázky vloženy: ${inserted} · ${formatBytes(originalBytes)} → ${formatBytes(optimizedBytes)}`);
      imageBusyRef.current = false;
      setImageImporting(false);
    }
  };

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await insertImageFiles(files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (downloading) return;
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
    if (files.length) { void insertImageFiles(files); return; }
    // Strip foreign page layouts and remote images; use the document's own typography.
    document.execCommand("insertHTML", false, plainTextToEditorHtml(event.clipboardData.getData("text/plain")));
    syncFormattingState();
  };

  const handleDownloadPdf = async () => {
    if (!pageRef.current || exportBusyRef.current || imageBusyRef.current) return;
    const normalizedPdfPassword = pdfPassword.trim();
    if (pdfPasswordEnabled && !normalizedPdfPassword) {
      setErrorText("Pro zaheslování PDF zadej heslo v Nastavení PDF.");
      setPdfSettingsOpen(true);
      return;
    }
    const exportPages = (autoPaginate ? splitOverflow() : undefined) || snapshotPages();
    exportBusyRef.current = true;
    setDownloading(true);
    setErrorText(null);
    setExportProgress({ done: 0, total: exportPages.length });
    try {
      imageInteractionRef.current = null;
      document.body.style.userSelect = "";
      setActiveImageId(null);
      await waitNextFrame();
      const blob = await createDocumentPdf({
        source: pageRef.current, pages: exportPages, title: documentTitle.trim() || "Dokument", author: fullName,
        quality: pdfQualityPreset, password: pdfPasswordEnabled ? normalizedPdfPassword : undefined,
        contact: qrContact,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      const result = { url: URL.createObjectURL(blob), filename: pdfFilename(documentTitle), bytes: blob.size, pages: exportPages.length };
      setLastExport(result);
      downloadPdfUrl(result.url, result.filename);
      if (pdfPasswordEnabled) {
        setPdfPassword("");
        setPdfPasswordEnabled(false);
      }
    } catch (error) {
      console.error("Nepodařilo se stáhnout PDF:", error);
      setErrorText(error instanceof Error ? error.message : "PDF se nepodařilo vygenerovat. Zkus to prosím znovu.");
    } finally {
      exportBusyRef.current = false;
      setDownloading(false);
    }
  };

  const handleSaveFooterProfile = async () => {
    setSavingFooter(true);
    setSaveStatus(null);

    try {
      const nextProfile = collectFooterProfile();

      const hasAnyValue = Object.values(nextProfile).some((v) => v.length > 0);
      const profileToSave = hasAnyValue ? nextProfile : EMPTY_FOOTER_PROFILE;
      writeLocalFooterProfile(userEmail, profileToSave);

      if (userEmail) {
        const currentUser = auth.currentUser;
        if (currentUser && effectiveUserEmail(currentUser.email) === userEmail) {
          await syncFooterProfileToCloud(currentUser, profileToSave);
        }
      }

      setSaveStatus(
        userEmail
          ? "Údaje patičky byly uloženy k uživateli."
          : "Údaje byly uloženy lokálně (pro cloud se přihlas)."
      );
    } catch (error) {
      console.error("Nepodařilo se uložit údaje patičky:", error);
      setSaveStatus("Cloud uložení se nepovedlo, ale lokální draft je uložen.");
    } finally {
      setSavingFooter(false);
      window.setTimeout(() => setSaveStatus(null), 2400);
    }
  };

  return (
    <AppLayout active="tools">
      {!draft.ready && (draft.status === "error" ? <div role="alert" className={styles.documentNotice}>
        <div><strong>Koncept se nepodařilo bezpečně otevřít.</strong><span>{draft.errorMessage}</span></div>
        <button type="button" onClick={draft.retry}>Zkusit načíst znovu</button>
      </div> : <p role="status" className={styles.loadingDraft}><Loader2 size={16} className="animate-spin" /> Ověřuji autora a načítám koncept…</p>)}
      <div className={styles.workspace} inert={!draft.ready} style={!draft.ready ? { visibility: "hidden" } : undefined}>
        <header className={styles.workspaceHeader}>
          <div>
            <span className={styles.eyebrow}>BOHEMIKA / DOKUMENTY</span>
            <h1>Tvorba PDF<span>.</span></h1>
            <p>Od prvního slova po dokument, který rád pošleš dál.</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.formatBadge}><FileText size={15} /> A4 · {pages.length} {pages.length === 1 ? "strana" : pages.length < 5 ? "strany" : "stran"}</span>
            <button type="button" className={styles.secondaryButton} disabled={downloading || imageImporting} onClick={() => setNewDocumentConfirm(value => !value)}><FilePlus2 size={16} /> Nový dokument</button>
            <button type="button" className={styles.primaryButton} disabled={downloading || imageImporting} onClick={() => void handleDownloadPdf()}>
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? `Připravuji ${exportProgress.done}/${exportProgress.total}` : "Stáhnout PDF"}
            </button>
          </div>
        </header>
        <fieldset disabled={downloading} className={styles.documentSettings}>
          <label>Název souboru<input maxLength={100} value={documentTitle} onChange={event => setDocumentTitle(event.target.value)} /><span>.pdf</span></label>
          <label>Text v hlavičce<input maxLength={110} value={headerDocTitle} onChange={event => setHeaderDocTitle(event.target.value)} /></label>
          <button type="button" className={styles.secondaryButton} onClick={() => { setPdfSettingsOpen(true); setFooterSettingsOpen(true); }}><UserCardIcon /> Moje vizitka</button>
        </fieldset>
        <div className={styles.draftBar}>
          <span role="status" aria-live="polite" data-draft-status={draft.status}>
            {draft.status === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {draft.status === "error" ? "Koncept se nepodařilo uložit." : draft.status === "saving" ? "Ukládám koncept…" : "Koncept je šifrovaný · přístup pouze autor"}
            {draft.status === "error" && <button type="button" onClick={draft.retry}>Zkusit uložit znovu</button>}
          </span>
          <button type="button" className={styles.saveDraftButton} disabled={downloading || imageImporting} onClick={draft.saveNow}><Save size={13} /> Uložit koncept</button>
          {draft.restoredAt && <small>Navazuješ na uložený dokument z {new Date(draft.restoredAt).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}.</small>}
        </div>
        {newDocumentConfirm && <div className={styles.documentNotice}>
          <div><strong>Začít nový dokument?</strong><span>Současný koncept se nahradí prázdným dokumentem. Hotovou verzi si nejdřív stáhni.</span></div>
          <button type="button" disabled={downloading || imageImporting} onClick={startNewDocument}>Vytvořit prázdný</button>
          <button type="button" onClick={() => setNewDocumentConfirm(false)}>Zrušit</button>
        </div>}
        {previousDocument && <div className={styles.undo}>Nový dokument je připravený. <button type="button" disabled={downloading || imageImporting} onClick={() => {
          activatePage(previousDocument.pages.find(page => page.id === previousDocument.activePageId) || previousDocument.pages[0], previousDocument.pages);
          setDocumentTitle(previousDocument.title); setHeaderDocTitle(previousDocument.header); setPreviousDocument(null);
        }}>Vrátit předchozí dokument</button></div>}
        {errorText && <p role="alert" className={styles.error}>{errorText}</p>}
        {lastExport && !downloading && <div className={styles.exportResult} role="status">
          <CheckCircle2 size={21} />
          <div><strong>PDF je připravené · {formatBytes(lastExport.bytes)}</strong><span>{lastExport.filename} · počet stran: {lastExport.pages}. Po dalších úpravách stáhni novou verzi.</span></div>
          <a href={lastExport.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Otevřít</a>
          <a href={lastExport.url} download={lastExport.filename}><Download size={14} /> Stáhnout znovu</a>
        </div>}
        {downloading && <div className={styles.progress} role="status" aria-live="polite">
          <span>Připravuji PDF · hotovo {exportProgress.done} z {exportProgress.total} stran</span>
          <progress value={exportProgress.done} max={exportProgress.total} aria-label="Průběh tvorby PDF" />
        </div>}
        <div className={styles.editorLayout}>
          <aside className={styles.sidebar} aria-label="Nástroje dokumentu">
            <div className={styles.panelHeader}>
              <span className={styles.panelHeaderIcon}><SlidersHorizontal size={19} /></span>
              <div><h2>Nástroje dokumentu</h2><p>Vše pro tvůj dokument.</p></div>
              <span className={styles.panelPage} title={`Upravuješ stranu ${activePageIndex + 1}`}>{activePageIndex + 1}</span>
            </div>
            <fieldset disabled={downloading} className={styles.controls}>
              <section className={styles.panelSection} aria-labelledby="text-tools-title">
                <div className={styles.sectionHeading}><Type size={15} /><h3 id="text-tools-title">Typografie</h3></div>
                <label className={styles.panelField}>
                  <span>Písmo</span>
                  <div className={styles.selectWrap}>
                    <select value={fontFamilyKey} onMouseDown={storeEditorSelection} onChange={event => { const option = FONT_OPTIONS.find(font => font.key === event.target.value); if (option) handleSelectFont(option); }} style={{ fontFamily: selectedFontOption.css }}>
                      {FONT_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                    <ChevronDown size={14} aria-hidden="true" />
                  </div>
                </label>
                <div className={styles.fieldPair}>
                  <label className={styles.panelField}>
                    <span>Velikost</span>
                    <div className={styles.selectWrap}>
                      <select value={fontSizePx} onMouseDown={storeEditorSelection} onChange={event => { const next = Number(event.target.value) || 15; setFontSizePx(next); applyFontSize(next); }}>
                        {[12, 14, 15, 16, 18, 20, 24, 28, 32].map(size => <option key={size} value={size}>{size} px</option>)}
                      </select>
                      <ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </label>
                  <div ref={textPaletteRef} className={`${styles.panelField} ${styles.colorField}`}>
                    <span>Barva textu</span>
                    <button type="button" className={styles.colorTrigger} onMouseDown={event => event.preventDefault()} onClick={() => setTextPaletteOpen(open => !open)} aria-label="Barva textu" aria-expanded={textPaletteOpen} aria-controls="text-color-palette">
                      <i style={{ backgroundColor: textColor }} /><span>{textColor.toUpperCase()}</span><ChevronDown size={13} />
                    </button>
                    <input ref={textColorInputRef} type="color" value={textColor} onChange={event => applyAndStoreTextColor(event.target.value, true)} className="sr-only" aria-label="Vlastní barva textu" />
                    {textPaletteOpen && <div id="text-color-palette" className={styles.colorPopover} onKeyDown={event => { if (event.key === "Escape") { setTextPaletteOpen(false); event.stopPropagation(); } }}>
                      <div className={styles.swatchGrid}>
                        {TEXT_COLOR_PALETTE.map(color => <button type="button" key={color} onMouseDown={event => event.preventDefault()} onClick={() => applyAndStoreTextColor(color, true)} aria-pressed={textColor.toLowerCase() === color} aria-label={`Nastavit barvu ${color}`} title={color} style={{ backgroundColor: color }} />)}
                      </div>
                      <div className={styles.paletteActions}>
                        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => textColorInputRef.current?.click()}>Vlastní barva</button>
                        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => void handlePickColorBySample()}><Pipette size={13} /> Pipeta</button>
                      </div>
                    </div>}
                  </div>
                </div>
                <div className={styles.formatGroup}>
                  <span className={styles.fieldCaption}>Styl písma</span>
                  <div className={styles.segmentedTools} role="group" aria-label="Styl písma">
                    <EditorToolButton label="Tučně" icon={Bold} active={inlineStyleState.bold} onClick={() => applyInlineStyle("bold")} />
                    <EditorToolButton label="Kurzíva" icon={Italic} active={inlineStyleState.italic} onClick={() => applyInlineStyle("italic")} />
                    <EditorToolButton label="Podtržení" icon={Underline} active={inlineStyleState.underline} onClick={() => applyInlineStyle("underline")} />
                    <EditorToolButton label="Přeškrtnutí" icon={Strikethrough} active={inlineStyleState.strikeThrough} onClick={() => applyInlineStyle("strikeThrough")} />
                  </div>
                </div>
                <div className={styles.formatGroup}>
                  <span className={styles.fieldCaption}>Zarovnání</span>
                  <div className={styles.segmentedTools} role="group" aria-label="Zarovnání textu">
                    <EditorToolButton label="Zarovnat vlevo" icon={AlignLeft} active={textAlignMode === "left"} onClick={() => applyTextAlign("left")} />
                    <EditorToolButton label="Zarovnat na střed" icon={AlignCenter} active={textAlignMode === "center"} onClick={() => applyTextAlign("center")} />
                    <EditorToolButton label="Zarovnat vpravo" icon={AlignRight} active={textAlignMode === "right"} onClick={() => applyTextAlign("right")} />
                    <EditorToolButton label="Zarovnat do bloku" icon={AlignJustify} active={textAlignMode === "justify"} onClick={() => applyTextAlign("justify")} />
                  </div>
                </div>
                <div className={styles.formatGroup}>
                  <span className={styles.fieldCaption}>Struktura textu</span>
                  <div className={styles.blockTools}>
                    <EditorToolButton label="Odstavec" icon={Pilcrow} showLabel onClick={() => applyFormatBlock("P")} />
                    <EditorToolButton label="Nadpis" icon={Heading2} showLabel onClick={() => applyFormatBlock("H2")} />
                    <EditorToolButton label="Odrážky" icon={List} showLabel onClick={() => applyList(false)} />
                    <EditorToolButton label="Číslování" icon={ListOrdered} showLabel onClick={() => applyList(true)} />
                  </div>
                </div>
              </section>

              <section className={styles.panelSection} aria-labelledby="image-tools-title">
                <div className={styles.sectionHeading}><ImagePlus size={15} /><h3 id="image-tools-title">Obrázky</h3>{placedImages.length > 0 && <span className={styles.sectionCount}>{placedImages.length}</span>}</div>
                <button type="button" className={styles.imageDropzone} disabled={imageImporting} data-dragging={imageDragOver} onClick={handleInsertImageClick}
                  onDragOver={event => { event.preventDefault(); if (!imageImporting && !downloading) setImageDragOver(true); }}
                  onDragLeave={() => setImageDragOver(false)}
                  onDrop={event => { event.preventDefault(); setImageDragOver(false); void insertImageFiles(Array.from(event.dataTransfer.files)); }}>
                  <span className={styles.uploadIcon}>{imageImporting ? <Loader2 size={19} className="animate-spin" /> : <ImagePlus size={19} />}</span>
                  <strong>{imageImporting ? "Zmenšuji obrázky…" : imageDragOver ? "Pusť obrázek sem" : "Vložit obrázek"}</strong>
                  <span>Vyber soubor nebo ho přetáhni sem.</span>
                </button>
                <input ref={imageUploadRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp" multiple className="hidden" onChange={event => void handleImageFileChange(event)} />
                <div className={styles.imageHint}><CheckCircle2 size={12} /><span>Automatická komprese</span><span>·</span><span>Lze vložit i ze schránky</span></div>
                {selectedImage && <div className={styles.selectedImage}>
                  <Image src={selectedImage.src} alt="" width={34} height={34} unoptimized />
                  <div><span>Vybraný obrázek</span><strong title={selectedImage.alt}>{selectedImage.alt}</strong></div>
                  <button type="button" onClick={removeActiveImage} aria-label="Smazat vybraný obrázek" title="Smazat vybraný obrázek"><Trash2 size={15} /></button>
                </div>}
                {imageStatus && <p className={styles.imageStatus} role="status">{imageStatus}</p>}
              </section>

              <section className={styles.panelSection}>
                <button type="button" className={styles.aiToggle} aria-expanded={aiPanelOpen} aria-controls="ai-writing-panel" onClick={() => { setAiPanelOpen(open => !open); setTextPaletteOpen(false); }}>
                  <span className={styles.aiIcon}><Sparkles size={18} /></span>
                  <span><strong>AI asistent</strong><small>Pomůže s prvním návrhem</small></span>
                  <ChevronDown size={16} className={styles.accordionChevron} />
                </button>
                {aiPanelOpen && <div id="ai-writing-panel" className={styles.aiPanel}>
                  <label className={styles.panelField}><span>Co chceš napsat?</span><textarea value={aiPrompt} onChange={event => { setAiPrompt(event.target.value); setAiError(null); }} placeholder="Např. dopis klientovi o doplnění podkladů…" rows={4} /></label>
                  <div className={styles.fieldPair}>
                    <label className={styles.panelField}><span>Typ textu</span><select value={aiDocType} onChange={event => setAiDocType(event.target.value as AiDocType)}><option value="dopis">Dopis</option><option value="email">E-mail</option><option value="shrnutí">Shrnutí</option></select></label>
                    <label className={styles.panelField}><span>Tón</span><select value={aiTone} onChange={event => setAiTone(event.target.value as AiTone)}><option value="formální">Formální</option><option value="obchodní">Obchodní</option><option value="přátelský">Přátelský</option></select></label>
                    <label className={styles.panelField}><span>Délka</span><select value={aiLength} onChange={event => setAiLength(event.target.value as AiLength)}><option value="krátký">Krátká</option><option value="střední">Střední</option><option value="dlouhý">Dlouhá</option></select></label>
                    <label className={styles.panelField}><span>Oslovení</span><select value={aiAddressing} onChange={event => setAiAddressing(event.target.value as AiAddressing)}><option value="vykání">Vykání</option><option value="tykání">Tykání</option></select></label>
                  </div>
                  <details className={styles.aiDetails}>
                    <summary>Upřesnit zadání<ChevronDown size={13} /></summary>
                    <label className={styles.panelField}><span>Jméno klienta</span><input value={aiClientName} onChange={event => setAiClientName(event.target.value)} placeholder="Jméno a příjmení" /></label>
                    <label className={styles.panelField}><span>Číslo smlouvy</span><input value={aiContractNumber} onChange={event => setAiContractNumber(event.target.value)} /></label>
                    <label className={styles.panelField}><span>Produkt</span><input value={aiProductName} onChange={event => setAiProductName(event.target.value)} /></label>
                    <label className={styles.panelField}><span>Cíl textu</span><input value={aiGoal} onChange={event => setAiGoal(event.target.value)} placeholder="Čeho má text dosáhnout?" /></label>
                  </details>
                  <label className={styles.contextCheckbox}><input type="checkbox" checked={aiUseCurrentContext} onChange={event => setAiUseCurrentContext(event.target.checked)} /><span>Vycházet z aktuálního textu</span></label>
                  <button type="button" className={styles.aiGenerate} onClick={() => void handleGenerateAiText()} disabled={aiLoading}>{aiLoading ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />}{aiLoading ? "Připravuji návrh…" : "Vytvořit návrh textu"}</button>
                  {aiError && <p role="alert" className={styles.panelError}>{aiError}</p>}
                  {aiResult && <div className={styles.aiResult}>
                    <span>NÁVRH TEXTU</span><div>{aiResult}</div>
                    <div className={styles.aiResultActions}><button type="button" onClick={insertAiResultIntoEditor}>Vložit do kurzoru</button><button type="button" onClick={replaceEditorWithAiResult}>Nahradit text</button></div>
                  </div>}
                </div>}
              </section>

              <section className={styles.panelSection}>
                <button type="button" className={styles.settingsRow} onClick={() => { setPdfSettingsOpen(true); setTextPaletteOpen(false); }} aria-label="Nastavení PDF">
                  <span className={styles.settingsIcon}><Settings2 size={18} /></span>
                  <span><strong>Nastavení PDF</strong><small>{selectedPdfQuality.label} <span>·</span> {pdfPasswordEnabled ? "S heslem" : "Bez hesla"}</small></span>
                  {pdfPasswordEnabled ? <Lock size={14} /> : <ChevronRight size={16} />}
                </button>
              </section>
            </fieldset>
          </aside>

          <section className={styles.previewSection} aria-label="Dokument">
            <fieldset disabled={downloading || imageImporting} className={styles.pageTools}>
              <div className={styles.pageTabs} aria-label="Stránky dokumentu">
                {pages.map((page, index) => <button type="button" key={page.id} aria-label={`Strana ${index + 1}`} aria-current={page.id === activePageId ? "page" : undefined} onClick={() => { const current = snapshotPages(); activatePage(current[index], current); }}>
                  <FileText size={16} /> Strana {index + 1}
                </button>)}
                <button type="button" onClick={() => addPage()} className={styles.addPage}><Plus size={16} /> Přidat stranu</button>
              </div>
              <div className={styles.pageActions}>
                <span>STRANA {activePageIndex + 1} Z {pages.length}</span>
                <button type="button" title="Posunout stranu doleva" aria-label="Posunout stranu doleva" disabled={activePageIndex === 0} onClick={() => movePage(-1)}><ArrowLeft size={16} /></button>
                <button type="button" title="Posunout stranu doprava" aria-label="Posunout stranu doprava" disabled={activePageIndex === pages.length - 1} onClick={() => movePage(1)}><ArrowRight size={16} /></button>
                <button type="button" onClick={() => addPage(true)}><Copy size={15} /> Duplikovat</button>
                <button type="button" disabled={pages.length === 1} onClick={removePage} aria-label="Smazat aktuální stranu"><Trash2 size={15} /></button>
              </div>
              {removedPage && <div className={styles.undo}>Strana byla odebrána. <button type="button" onClick={restorePage}>Vrátit zpět</button></div>}
              <div className={styles.paginationOptions}>
                <label><input type="checkbox" checked={autoPaginate} onChange={event => { setAutoPaginate(event.target.checked); setPaginationError(null); failedPaginationRef.current = null; }} /> Automatické stránkování</label>
                <span>Dlouhý text pokračuje na další straně.</span>
              </div>
            </fieldset>
            {paginationStatus && !contentOverflow && <div className={styles.paginationNotice} role="status"><CheckCircle2 size={14} />{paginationStatus}<button type="button" aria-label="Skrýt oznámení o stránkování" onClick={() => setPaginationStatus(null)}>×</button></div>}
            {contentOverflow && <div role="alert" className={styles.overflowWarning}>{paginationError || "Text přesahuje stránku. Rozděl jej do dalších stran nebo zmenši písmo."} <button type="button" disabled={downloading || imageImporting} onClick={() => { failedPaginationRef.current = null; splitOverflow(); }}>Rozdělit text do stran</button></div>}
            <div className={styles.previewShell}>
              <div className={styles.previewBar}>
                <span><span className={styles.liveDot} /> Živý náhled</span>
                <div className={styles.zoomControls}>
                  <span>A4 · {Math.round(previewScale * 100)} %</span>
                  <button type="button" aria-pressed={previewFit} onClick={() => setPreviewFit(true)}>Přizpůsobit</button>
                  <button type="button" aria-pressed={!previewFit} onClick={() => setPreviewFit(false)}>100 %</button>
                </div>
              </div>
              <div ref={previewViewportRef} className={styles.previewViewport}>
                <div
                  className="relative mx-auto"
                  style={{
                    width: previewFrameWidth ? `${previewFrameWidth}px` : undefined,
                    height: previewFrameHeight ? `${previewFrameHeight}px` : undefined,
                  }}
                >
                  <div
                    className="origin-top-left"
                    style={{
                      transform: `scale(${previewScale})`,
                    }}
                  >
                    <div
                      ref={pageRef}
                      className={styles.paper}
                    >
                <div className={styles.paperAccent} aria-hidden="true" />
                <header className={styles.paperHeader}>
                  <Image src="/icons/nadpislogo.jpg" alt="Bohemika – finanční poradenství" width={320} height={205} className={styles.brandLogo} priority />
                  <div className={styles.paperHeading}>
                    <span><i /> PŘIPRAVENO PRO VÁS</span>
                    <div>{headerDocTitle}</div>
                  </div>
                </header>
                <main className={styles.paperBody}>
                  <div
                    ref={editorStageRef}
                    className={styles.editorStage}
                    onMouseDown={() => setActiveImageId(null)}
                  >
                    <div
                      ref={editorRef}
                      contentEditable={!downloading}
                      suppressContentEditableWarning
                      data-editor-frame="1"
                      role="textbox"
                      aria-label={`Obsah strany ${activePageIndex + 1}`}
                      aria-multiline="true"
                      onPaste={handlePaste}
                      onCompositionStart={() => { composingRef.current = true; }}
                      onCompositionEnd={() => { composingRef.current = false; if (autoPaginate) splitOverflow(); }}
                      style={{
                        fontSize: `${fontSizePx}px`,
                        fontFamily: selectedFontOption.css,
                        color: textColor,
                      }}
                      onKeyUp={syncFormattingState}
                      onMouseUp={syncFormattingState}
                      onMouseDown={() => setActiveImageId(null)}
                      className={styles.editor}
                    />
                    <div className="pointer-events-none absolute inset-0" data-image-layer="1">
                      {placedImages.map((image) => {
                        const isActive = activeImageId === image.id;
                        return (
                          <div
                            key={image.id}
                            data-image-item="1"
                            onMouseDown={(event) => startImageInteraction(event, image.id, "move")}
                            className="pointer-events-auto absolute overflow-visible bg-transparent"
                            style={{
                              left: `${image.x}px`,
                              top: `${image.y}px`,
                              width: `${image.width}px`,
                              height: `${image.height}px`,
                              cursor: "move",
                            }}
                          >
                            <Image
                              src={image.src}
                              alt={image.alt}
                              fill
                              unoptimized
                              sizes="320px"
                              draggable={false}
                              className="pointer-events-none select-none object-contain"
                            />

                            {isActive && (
                              <>
                                <button
                                  type="button"
                                  data-export-ignore="1"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    removeActiveImage();
                                  }}
                                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-900 shadow-md"
                                  aria-label="Smazat obrázek"
                                >
                                  ×
                                </button>

                                <button
                                  type="button"
                                  data-export-ignore="1"
                                  onMouseDown={(event) => startImageInteraction(event, image.id, "resize")}
                                  className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-tl-md border border-slate-300 bg-blue-500/80"
                                  aria-label="Změnit velikost obrázku"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </main>

                <footer className={styles.paperFooter}>
                  <div className={styles.businessCard} data-has-qr={Boolean(qrContact)}>
                    <div className={styles.advisorIdentity}>
                      <span className={styles.advisorAvatar}>{(fullName.trim() || "Bohemika").split(/\s+/).slice(0, 2).map(name => name[0]).join("").toUpperCase()}</span>
                      <div><span className={styles.cardEyebrow}>JSEM TU PRO VÁS</span><strong>{fullName.trim() || "Bohemika a.s."}</strong><span>{jobTitle.trim() || "Finanční poradenství"}</span>{companyId.trim() && <small>IČ: {companyId.trim()}</small>}</div>
                    </div>
                    <div className={styles.advisorContacts}>
                      {phone.trim() && <div><Phone size={12} /><span>{phone.trim()}</span></div>}
                      {email.trim() && <div><Mail size={12} /><span>{email.trim()}</span></div>}
                      {officeAddress.trim() && <div><MapPin size={12} /><span>{officeAddress.trim()}</span></div>}
                      {!phone.trim() && !email.trim() && !officeAddress.trim() && <span>Podpisem to pro nás nekončí.</span>}
                    </div>
                    {qrContact && <div className={styles.contactQr}>
                      <div data-contact-qr="1" className={styles.qrImage}><ContactQrCode payload={qrContact.payload} /></div>
                      <span>{qrContact.label}</span>
                    </div>}
                  </div>
                  <div className={styles.paperFolio}><span>BOHEMIKA · FINANČNÍ PORADENSTVÍ</span><span data-page-number="1">{activePageIndex + 1} / {pages.length}</span></div>
                </footer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {pdfSettingsOpen && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
            onMouseDown={() => setPdfSettingsOpen(false)}
          >
            <div
              ref={pdfDialogRef}
              className="w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-300 bg-gradient-to-br from-white via-slate-50 to-[#eef2ff] p-4 shadow-[0_30px_84px_rgba(15,23,42,0.32)]"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pdf-settings-title"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 id="pdf-settings-title" className="text-base font-semibold text-slate-900">Nastavení PDF</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Komprese, jednorázové heslo a tvoje kontaktní vizitka.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPdfSettingsOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 transition hover:border-slate-900 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Zavřít nastavení PDF"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                {errorText && <p role="alert" className={styles.error}>{errorText}</p>}
                <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-900">
                        <Lock className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Zaheslovat PDF</p>
                        <p className="text-xs text-slate-600">
                          Jednorázové heslo pro příští export PDF.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pdfPasswordEnabled}
                      aria-label="Zaheslovat PDF"
                      onClick={() => {
                        setPdfSaveStatus(null);
                        setPdfPasswordEnabled((prev) => {
                          const next = !prev;
                          if (!next) setPdfPassword("");
                          return next;
                        });
                      }}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                        pdfPasswordEnabled
                          ? "border-slate-900 bg-slate-900"
                          : "border-slate-300 bg-slate-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          pdfPasswordEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  {pdfPasswordEnabled && (
                    <div className="mt-3 space-y-2 border-t border-slate-300 pt-3">
                      <input
                        type="password"
                        aria-label="Heslo pro otevření PDF"
                        value={pdfPassword}
                        onChange={(event) => {
                          setPdfPassword(event.target.value);
                          setPdfSaveStatus(null);
                        }}
                        placeholder="Zadej heslo pro otevření PDF"
                        className="w-full rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                      <p className="text-xs text-slate-600">
                        Heslo se použije jen jednou a po stažení PDF se automaticky smaže.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 space-y-2 border-t border-slate-300 pt-3">
                    <p className="text-sm font-semibold text-slate-900">Kvalita exportu PDF</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PDF_QUALITY_ORDER.map((quality) => {
                        const cfg = PDF_QUALITY_PRESETS[quality];
                        const isSelected = pdfQualityPreset === quality;
                        return (
                          <button
                            key={quality}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setPdfQualityPreset(quality);
                              setPdfSaveStatus(null);
                            }}
                            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                              isSelected
                                ? "border-blue-300/80 bg-blue-100 text-slate-900"
                                : "border-slate-300 bg-white text-slate-800 hover:border-blue-300/60"
                            }`}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-600">{selectedPdfQuality.helperText}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-3 border-t border-slate-300 pt-3">
                    <button
                      type="button"
                      onClick={handleSavePdfSettings}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                    >
                      {pdfPasswordEnabled ? "Potvrdit heslo pro 1 export" : "Potvrdit nastavení"}
                    </button>
                    {pdfSaveStatus && (
                      <p className="text-xs font-medium text-slate-700">{pdfSaveStatus}</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFooterSettingsOpen((prev) => !prev)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
                >
                  {footerSettingsOpen ? "Nastavení patičky (skrýt)" : "Nastavení patičky"}
                </button>

                {footerSettingsOpen && (
                  <div className="space-y-3 rounded-2xl border border-slate-300 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
                    <h3 className="text-sm font-semibold text-slate-900">Vizitka na každé straně</h3>
                    <div className={styles.qrSettings}>
                      <label><input type="checkbox" checked={showContactQr} onChange={event => setShowContactQr(event.target.checked)} /> QR kód ve vizitce</label>
                      <p>{currentCardUrl ? "QR otevře tvoji aktivní online vizitku. V PDF na něj lze také kliknout." : "QR umožní uložit tvoje kontaktní údaje přímo do telefonu. Doplň jméno, telefon nebo e-mail."}</p>
                    </div>
                    <div className="space-y-2">
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        aria-label="Jméno a příjmení"
                        maxLength={80}
                        placeholder="Jméno a příjmení"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                      <input
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        aria-label="Pozice"
                        maxLength={80}
                        placeholder="Pozice"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                      <input
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        aria-label="IČ"
                        maxLength={80}
                        placeholder="IČ"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        aria-label="Mobil"
                        maxLength={80}
                        placeholder="Mobil"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        aria-label="E-mail"
                        maxLength={80}
                        placeholder="E-mail"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                      <input
                        value={officeAddress}
                        onChange={(e) => setOfficeAddress(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        aria-label="Adresa kanceláře"
                        maxLength={120}
                        placeholder="Adresa kanceláře"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveFooterProfile()}
                      disabled={savingFooter}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingFooter ? "Ukládám…" : "Uložit údaje patičky"}
                    </button>
                    {saveStatus && <p className="text-xs text-slate-700">{saveStatus}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
